from __future__ import annotations

import json
import logging
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Thread
from urllib.parse import parse_qs, urlparse

import psycopg
from apscheduler.schedulers.background import BackgroundScheduler

from config import AppConfig, load_config
from daily_report_generator import DailyReportGenerator
from database_manager import DatabaseManager
from screenshot_analyzer import KimiScreenshotAnalyzer, compute_sha256


@dataclass(frozen=True)
class ScreenshotRecord:
    id: str
    user_id: str
    session_id: str | None
    file_path: str
    active_application: str | None
    window_title: str | None
    captured_at: datetime


class ScreenshotAIWorker:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.db = DatabaseManager(config.sqlite_path)
        self.analyzer = KimiScreenshotAnalyzer(
            api_mode=config.kimi_api_mode,
            api_base_url=config.kimi_api_base_url,
            gateway_id=config.kimi_gateway_id,
            api_key=config.kimi_api_key,
            model=config.kimi_model,
            timeout_seconds=config.kimi_timeout_seconds,
            max_retries=config.kimi_max_retries,
            max_tokens=config.kimi_max_tokens,
            max_image_width=config.max_image_width,
            jpeg_quality=config.jpeg_quality,
        )
        self.report_generator = DailyReportGenerator(self.db, config.report_output_dir)
        self.reschedule_periodic_job = lambda _minutes: None  # Will be replaced after scheduler starts

    def run_once(self) -> None:
        last_captured = self.db.get_last_processed_captured_at()
        records = self.fetch_recent_screenshots(after_captured_at=last_captured)
        logging.info("Fetched screenshot batch", extra={"count": len(records), "after": last_captured})
        for record in records:
            if self.db.has_screenshot(record.id):
                continue
            self.process_record(record)
        if records:
            max_captured = max(record.captured_at for record in records)
            self.db.set_last_processed_captured_at(max_captured.isoformat())
            logging.debug("Updated last processed captured_at", extra={"last_captured_at": max_captured.isoformat()})

    def fetch_recent_screenshots(self, after_captured_at: str = "") -> list[ScreenshotRecord]:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        lookback = now - timedelta(hours=self.config.screenshot_lookback_hours)

        if after_captured_at:
            cursor_ts = datetime.fromisoformat(after_captured_at.replace("Z", "+00:00")) + timedelta(microseconds=1)
            # If cursor is from before today, reset to today_start to prioritize fresh data
            since = max(cursor_ts, today_start)
        else:
            # No cursor yet: start with today's screenshots
            since = today_start

        query = """
            SELECT id, user_id, session_id, file_path, active_application, window_title, captured_at
            FROM screenshots
            WHERE captured_at >= %s
            ORDER BY captured_at ASC, id ASC
            LIMIT %s
        """
        with psycopg.connect(self.config.database_url) as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (since.isoformat(), self.config.screenshot_batch_limit))
                rows = cursor.fetchall()
        return [
            ScreenshotRecord(
                id=row[0],
                user_id=row[1],
                session_id=row[2],
                file_path=row[3],
                active_application=row[4],
                window_title=row[5],
                captured_at=self.ensure_aware(row[6]),
            )
            for row in rows
        ]

    def process_record(self, record: ScreenshotRecord) -> None:
        image_path = self.resolve_screenshot_path(record.file_path)
        if not image_path.exists():
            image_path = self.copy_from_docker_uploads(record)
            if not image_path.exists():
                message = f"Screenshot file missing: db_path={record.file_path}, resolved_path={image_path}"
                logging.warning(message)
                self.insert_failure(record, "", message)
                return

        try:
            image_sha256 = compute_sha256(image_path)
            metadata = {
                "application_name_hint": record.active_application or "",
                "window_title_hint": record.window_title or "",
            }

            if self.db.image_hash_exists(image_sha256):
                self.insert_skipped(record, image_sha256, "duplicate_image_hash", metadata)
                return

            if self.db.has_recent_same_window(
                record.user_id,
                record.session_id,
                record.active_application,
                record.window_title,
                record.captured_at,
                self.config.analysis_sample_stable_minutes,
            ):
                self.insert_skipped(record, image_sha256, "stable_window_sampling", metadata)
                return

            analysis = self.analyzer.analyze(image_path)
            raw_json = analysis.model_dump()
            raw_json["metadata"] = metadata
            self.db.insert_analysis(
                screenshot_id=record.id,
                user_id=record.user_id,
                session_id=record.session_id,
                file_path=record.file_path,
                captured_at=record.captured_at.isoformat(),
                image_sha256=image_sha256,
                application_name=analysis.application_name,
                task=analysis.task,
                category=analysis.category,
                focus_level=analysis.focus_level,
                visible_text=analysis.visible_text,
                confidence=analysis.confidence,
                raw_json=raw_json,
                status="success",
            )
            logging.info("Analyzed screenshot", extra={"screenshot_id": record.id, "category": analysis.category})
        except Exception as error:
            if "Model response did not include message.content" in str(error):
                self.insert_metadata_fallback(record, locals().get("image_sha256", ""), metadata, str(error))
                return

            logging.exception("Screenshot analysis failed", extra={"screenshot_id": record.id})
            self.insert_failure(record, locals().get("image_sha256", ""), str(error))

    def insert_metadata_fallback(
        self,
        record: ScreenshotRecord,
        image_sha256: str,
        metadata: dict[str, str],
        error_message: str,
    ) -> None:
        app_name = record.active_application or "Unknown"
        window_title = record.window_title or ""
        category, focus_level, task = self.classify_from_metadata(app_name, window_title)

        self.db.insert_analysis(
            screenshot_id=record.id,
            user_id=record.user_id,
            session_id=record.session_id,
            file_path=record.file_path,
            captured_at=record.captured_at.isoformat(),
            image_sha256=image_sha256 or "unknown",
            application_name=app_name,
            task=task,
            category=category,
            focus_level=focus_level,
            visible_text=window_title[:300],
            confidence=0.35,
            raw_json={
                "fallback_reason": "kimi_missing_content",
                "error": error_message,
                "metadata": metadata,
            },
            status="success",
            error_message=error_message,
        )
        logging.info(
            "Stored metadata fallback analysis",
            extra={"screenshot_id": record.id, "category": category, "focus_level": focus_level},
        )

    @staticmethod
    def classify_from_metadata(app_name: str, window_title: str) -> tuple[str, str, str]:
        text = f"{app_name} {window_title}".lower()

        if any(word in text for word in ["youtube", "netflix", "instagram", "facebook", "game", "spotify"]):
            return "Leisure", "Distraction", "leisure browsing"
        if any(word in text for word in ["slack", "teams", "gmail", "mail", "outlook", "whatsapp", "discord"]):
            return "Communication", "Medium", "communication"
        if any(word in text for word in ["docs", "documentation", "course", "tutorial", "learn", "stackoverflow"]):
            return "Learning", "Medium", "learning or research"
        if any(word in text for word in ["code", "vscode", "visual studio", "terminal", "github", "gitlab", "jira", "figma"]):
            return "Work", "Deep Work", "technical work"
        if any(word in text for word in ["chrome", "brave", "edge", "browser", "dashboard", "admin"]):
            return "Work", "Medium", "dashboard or browser work"

        return "Other", "Medium", "unclear activity"

    def insert_skipped(self, record: ScreenshotRecord, image_sha256: str, reason: str, metadata: dict[str, str]) -> None:
        self.db.insert_analysis(
            screenshot_id=record.id,
            user_id=record.user_id,
            session_id=record.session_id,
            file_path=record.file_path,
            captured_at=record.captured_at.isoformat(),
            image_sha256=image_sha256,
            application_name=None,
            task=None,
            category=None,
            focus_level=None,
            visible_text=None,
            confidence=0,
            raw_json={"skip_reason": reason, "metadata": metadata},
            status="skipped",
        )
        logging.info("Skipped screenshot analysis", extra={"screenshot_id": record.id, "reason": reason})

    def insert_failure(self, record: ScreenshotRecord, image_sha256: str, error_message: str) -> None:
        self.db.insert_analysis(
            screenshot_id=record.id,
            user_id=record.user_id,
            session_id=record.session_id,
            file_path=record.file_path,
            captured_at=record.captured_at.isoformat(),
            image_sha256=image_sha256 or "unknown",
            application_name=None,
            task=None,
            category=None,
            focus_level=None,
            visible_text=None,
            confidence=0,
            raw_json={"error": error_message},
            status="failed",
            error_message=error_message,
        )

    def resolve_screenshot_path(self, stored_path: str) -> Path:
        path = Path(stored_path)
        if path.is_absolute():
            return path

        upload_dir = self.config.upload_dir
        clean_parts = path.parts
        if clean_parts and clean_parts[0].lower() == "uploads":
            path = Path(*clean_parts[1:])
        if not str(path).startswith("screenshots") and "screenshots" in clean_parts:
            path = Path(*clean_parts[clean_parts.index("screenshots") :])
        return (upload_dir / path).resolve()

    def copy_from_docker_uploads(self, record: ScreenshotRecord) -> Path:
        cache_path = self.docker_cache_path(record)
        if cache_path.exists():
            return cache_path

        if not self.config.docker_upload_container:
            return self.resolve_screenshot_path(record.file_path)

        stored_path = record.file_path
        if not stored_path.startswith("/app/uploads/"):
            return self.resolve_screenshot_path(stored_path)

        cache_path.parent.mkdir(parents=True, exist_ok=True)
        source = f"{self.config.docker_upload_container}:{stored_path}"
        try:
            subprocess.run(
                ["docker", "cp", source, str(cache_path)],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            logging.info(f"Copied Docker screenshot for analysis: {stored_path} -> {cache_path}")
            return cache_path
        except (OSError, subprocess.CalledProcessError) as error:
            logging.warning(f"Unable to copy screenshot from Docker container {self.config.docker_upload_container}: {error}")
            return cache_path

    def docker_cache_path(self, record: ScreenshotRecord) -> Path:
        stored_path = Path(record.file_path)
        filename = stored_path.name or f"{record.id}.png"
        date_part = "unknown-date"
        parts = stored_path.parts
        if "screenshots" in parts:
            index = parts.index("screenshots")
            if index + 1 < len(parts):
                date_part = parts[index + 1]
        return (self.config.sqlite_path.parent / "docker-screenshots" / date_part / f"{record.id}-{filename}").resolve()

    @staticmethod
    def ensure_aware(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def generate_today_report_if_due(self) -> None:
        now = datetime.now()
        hour, minute = self.parse_report_time()
        if now.hour > hour or (now.hour == hour and now.minute >= minute):
            self.report_generator.generate_for_date(now.date().isoformat(), only_missing=True)

    def generate_daily_reports(self) -> None:
        today = datetime.now().date().isoformat()
        generated = self.report_generator.generate_for_date(today)
        logging.info("Generated daily reports", extra={"date": today, "count": generated})

    def collect_periodic_summaries(self) -> None:
        """Generate periodic summaries — current window + backfill missing slots."""
        interval = int(self.db.get_org_config("periodic_interval_minutes", str(self.config.periodic_interval_minutes)))
        now = datetime.now(timezone.utc)
        epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
        interval_seconds = interval * 60

        # Round now down to interval boundary
        elapsed = (now - epoch).total_seconds()
        elapsed_rounded = int(elapsed) // interval_seconds * interval_seconds
        boundary_now = epoch + timedelta(seconds=elapsed_rounded)

        # Determine earliest window to backfill (max 8 hours back, or first analyzed screenshot)
        lookback_hours = int(self.db.get_org_config("periodic_lookback_hours", "8"))
        earliest_window = boundary_now - timedelta(hours=lookback_hours)

        # Walk through each interval window from earliest to now (including current)
        current_start = earliest_window
        generated = 0
        while current_start <= boundary_now:
            window_end = current_start + timedelta(seconds=interval_seconds)
            start_iso = current_start.isoformat()
            end_iso = window_end.isoformat()

            # Get users active in this window (from PostgreSQL screenshots)
            active_users = self._find_active_users(start_iso, end_iso)
            if not active_users:
                current_start = window_end
                continue

            for user_id in active_users:
                try:
                    if self.db.periodic_summary_exists(user_id, start_iso):
                        continue

                    rows = self.db.list_reportable_analysis_for_users_between([user_id], start_iso, end_iso)
                    if not rows or len(rows) < 2:
                        continue

                    summary = self.report_generator.build_summary(
                        rows,
                        now.date().isoformat(),
                        f"Periodic Summary ({interval}min)",
                        range_label=self._interval_label(interval, start_iso, end_iso),
                    )
                    if summary.get("total_analyzed_screenshots", 0) < 2:
                        continue

                    self.db.insert_periodic_summary(
                        user_id=user_id,
                        start_iso=start_iso,
                        end_iso=end_iso,
                        summary_json=summary,
                        screenshot_count=summary["total_analyzed_screenshots"],
                        productivity_score=summary["productivity_score"],
                        interval_minutes=interval,
                    )
                    generated += 1
                    logging.info(
                        "Periodic summary stored",
                        extra={"user_id": user_id, "start": start_iso, "end": end_iso,
                               "screenshots": summary["total_analyzed_screenshots"], "score": summary["productivity_score"]},
                    )
                except Exception as error:
                    logging.exception("Periodic summary failed for user", extra={"user_id": user_id, "window": start_iso, "error": str(error)})

            current_start = window_end

        logging.info("Periodic summary collection done", extra={"generated": generated, "lookback_hours": lookback_hours})
        # Trigger a second pass if run before all today's screenshots were analyzed
        if generated == 0:
            logging.info("No new summaries generated, will retry on next scheduler tick")

    def _find_active_users(self, start_iso: str, end_iso: str) -> list[str]:
        """Find users who have screenshots in the given time window."""
        query = """
            SELECT DISTINCT user_id
            FROM screenshots
            WHERE captured_at >= %s AND captured_at < %s
        """
        try:
            with psycopg.connect(self.config.database_url) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(query, (start_iso, end_iso))
                    return [row[0] for row in cursor.fetchall()]
        except Exception as error:
            logging.warning("Could not query active users from PostgreSQL", extra={"error": str(error)})
            return []

    def _get_user_names(self, user_ids: list[str]) -> dict[str, str]:
        """Fetch full_name from PostgreSQL users table for given user IDs."""
        if not user_ids:
            return {}
        query = "SELECT id, full_name FROM users WHERE id = ANY(%s)"
        try:
            with psycopg.connect(self.config.database_url) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(query, (user_ids,))
                    return {row[0]: row[1] for row in cursor.fetchall()}
        except Exception as error:
            logging.warning("Could not fetch user names", extra={"error": str(error)})
            return {}

    @staticmethod
    def _interval_label(interval: int, start_iso: str, end_iso: str) -> str:
        try:
            start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
            end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
            return f"{start.astimezone().strftime('%H:%M')} - {end.astimezone().strftime('%H:%M')} ({interval}min)"
        except ValueError:
            return f"{interval}min interval"

    def parse_report_time(self) -> tuple[int, int]:
        hour_text, minute_text = self.config.report_time_local.split(":", 1)
        return int(hour_text), int(minute_text)

    @staticmethod
    def parse_summary_datetime(value: str) -> datetime:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.astimezone()
        return parsed

    def build_live_summary(
        self,
        *,
        scope: str,
        report_date: str,
        start_iso: str,
        end_iso: str,
        range_label: str,
        user_ids: list[str],
        min_screenshots: int,
    ) -> tuple[int, dict[str, object]]:
        rows = self.db.list_reportable_analysis_for_users_between(user_ids, start_iso, end_iso)
        analyzed_count = len(rows)
        if analyzed_count < min_screenshots:
            return 422, {
                "success": False,
                "message": f"Not enough analyzed screenshots in this time range. Need at least {min_screenshots}, found {analyzed_count}.",
                "data": {
                    "scope": scope,
                    "date": report_date,
                    "start": start_iso,
                    "end": end_iso,
                    "range": range_label,
                    "analyzedScreenshots": analyzed_count,
                    "requiredScreenshots": min_screenshots,
                },
            }

        title = "Team Screenshot Intelligence Summary" if scope == "team" else "Employee Screenshot Intelligence Summary"
        summary = self.report_generator.build_summary(rows, report_date, title, range_label)
        summary["scope"] = scope
        summary["user_ids"] = user_ids
        summary["start"] = start_iso
        summary["end"] = end_iso
        summary["range"] = range_label
        return 200, {"success": True, "data": summary}


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def start_summary_http_server(worker: ScreenshotAIWorker) -> ThreadingHTTPServer:
    class SummaryHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/")

            if path == "/health":
                self.respond(200, {"success": True, "status": "ok"})
                return

            if path == "/summary":
                self._handle_summary(parsed)
                return

            if path == "/live-summaries":
                self._handle_live_summaries()
                return

            if path == "/periodic-summaries":
                self._handle_periodic_summaries(parsed)
                return

            if path == "/config/report-interval":
                self._handle_get_report_interval()
                return

            # ── Daily Report Endpoints ──
            if path == "/daily-reports/dates":
                self._handle_daily_report_dates()
                return

            if path == "/daily-reports":
                self._handle_daily_reports_for_date(parsed)
                return

            if path == "/config/daily-report-time":
                self._handle_get_daily_report_time()
                return

            # /daily-reports/{userId}
            if path.startswith("/daily-reports/"):
                user_id = path[len("/daily-reports/"):]
                self._handle_single_daily_report(parsed, user_id)
                return

            self.respond(404, {"success": False, "message": "Not found"})

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/")

            if path == "/config/report-interval":
                self._handle_set_report_interval(parsed)
                return

            if path == "/config/daily-report-time":
                self._handle_set_daily_report_time(parsed)
                return

            if path == "/daily-reports/regenerate":
                self._handle_regenerate_daily_reports(parsed)
                return

            self.respond(404, {"success": False, "message": "Not found"})

        def _handle_summary(self, parsed) -> None:
            query = parse_qs(parsed.query)
            scope = query.get("scope", ["team"])[0]
            report_date = query.get("date", [date.today().isoformat()])[0]
            start_param = query.get("start", [""])[0].strip()
            end_param = query.get("end", [""])[0].strip()
            range_label = query.get("range", [""])[0].strip()
            min_screenshots_raw = query.get("minScreenshots", [str(worker.config.summary_min_screenshots)])[0]
            user_ids = [item.strip() for item in query.get("userIds", [""])[0].split(",") if item.strip()]
            single_user_id = query.get("userId", [""])[0].strip()
            if single_user_id and single_user_id not in user_ids:
                user_ids.append(single_user_id)

            try:
                min_screenshots = max(1, int(min_screenshots_raw))
            except ValueError:
                min_screenshots = worker.config.summary_min_screenshots

            if scope not in {"team", "user"}:
                self.respond(400, {"success": False, "message": "scope must be team or user"})
                return
            if scope == "user" and len(user_ids) != 1:
                self.respond(400, {"success": False, "message": "user scope requires exactly one userId"})
                return

            try:
                if start_param and end_param:
                    start_dt = worker.parse_summary_datetime(start_param)
                    end_dt = worker.parse_summary_datetime(end_param)
                else:
                    start_dt = datetime.fromisoformat(report_date).replace(tzinfo=timezone.utc)
                    end_dt = start_dt + timedelta(days=1)
            except ValueError:
                self.respond(400, {"success": False, "message": "start/end must be valid ISO datetimes"})
                return

            if end_dt <= start_dt:
                self.respond(400, {"success": False, "message": "end must be after start"})
                return

            if not range_label:
                range_label = f"{start_dt.astimezone().strftime('%H:%M')} - {end_dt.astimezone().strftime('%H:%M')}"

            status, payload = worker.build_live_summary(
                scope=scope,
                report_date=report_date,
                start_iso=start_dt.astimezone(timezone.utc).isoformat(),
                end_iso=end_dt.astimezone(timezone.utc).isoformat(),
                range_label=range_label,
                user_ids=user_ids,
                min_screenshots=min_screenshots,
            )
            self.respond(status, payload)

        def _handle_live_summaries(self) -> None:
            """Return the latest periodic summary for every user."""
            summaries = worker.db.get_all_latest_periodic_summaries()
            user_ids = list({s["user_id"] for s in summaries})
            names = worker._get_user_names(user_ids)
            result = []
            for s in summaries:
                try:
                    summary_data = json.loads(s["summary_json"])
                except (TypeError, json.JSONDecodeError):
                    summary_data = {}
                rating = summary_data.get("rating", "average")
                result.append({
                    "userId": s["user_id"],
                    "fullName": names.get(s["user_id"], s["user_id"]),
                    "start": s["start_iso"],
                    "end": s["end_iso"],
                    "generatedAt": s["generated_at"],
                    "screenshotCount": s["screenshot_count"],
                    "productivityScore": s["productivity_score"],
                    "rating": rating,
                    "task": summary_data.get("top_tasks", [{}])[0].get("task", "") if summary_data.get("top_tasks") else "",
                    "categoryBreakdown": summary_data.get("category_breakdown", []),
                    "activeApplication": self._latest_app_from_summary(summary_data),
                })
            self.respond(200, {"success": True, "data": result})

        def _handle_periodic_summaries(self, parsed) -> None:
            query = parse_qs(parsed.query)
            user_ids_str = query.get("userIds", [""])[0].strip()
            user_ids = [u.strip() for u in user_ids_str.split(",") if u.strip()] if user_ids_str else None
            start_iso = query.get("start", [""])[0].strip()
            end_iso = query.get("end", [""])[0].strip()

            if not start_iso or not end_iso:
                self.respond(400, {"success": False, "message": "start and end ISO params required"})
                return

            try:
                rows = worker.db.list_periodic_summaries(user_ids, start_iso, end_iso)
            except Exception as error:
                self.respond(500, {"success": False, "message": str(error)})
                return

            result = []
            user_ids_in_result = list({row["user_id"] for row in rows})
            names = worker._get_user_names(user_ids_in_result)
            for row in rows:
                try:
                    summary_data = json.loads(row["summary_json"])
                except (TypeError, json.JSONDecodeError):
                    summary_data = {}
                result.append({
                    "userId": row["user_id"],
                    "fullName": names.get(row["user_id"], row["user_id"]),
                    "start": row["start_iso"],
                    "end": row["end_iso"],
                    "generatedAt": row["generated_at"],
                    "screenshotCount": row["screenshot_count"],
                    "productivityScore": row["productivity_score"],
                    "summary": summary_data,
                })
            self.respond(200, {"success": True, "data": result, "total": len(result)})

        def _handle_get_report_interval(self) -> None:
            interval = worker.db.get_org_config("periodic_interval_minutes", str(worker.config.periodic_interval_minutes))
            self.respond(200, {"success": True, "data": {"intervalMinutes": int(interval)}})

        def _handle_set_report_interval(self, parsed) -> None:
            query = parse_qs(parsed.query)
            minutes_str = query.get("minutes", [""])[0].strip()
            try:
                minutes = int(minutes_str)
                if minutes < 5 or minutes > 480:
                    self.respond(400, {"success": False, "message": "intervalMinutes must be between 5 and 480"})
                    return
            except ValueError:
                self.respond(400, {"success": False, "message": "minutes must be an integer"})
                return

            worker.db.set_org_config("periodic_interval_minutes", str(minutes))
            # Reschedule the periodic job
            worker.reschedule_periodic_job(minutes)
            logging.info("Report interval updated", extra={"interval_minutes": minutes})
            self.respond(200, {"success": True, "data": {"intervalMinutes": minutes}})

        # ── Daily Report Handlers ──────────────────────────────────────

        def _handle_get_daily_report_time(self) -> None:
            time_str = worker.db.get_daily_report_time("18:00")
            self.respond(200, {"success": True, "data": {"reportTime": time_str}})

        def _handle_set_daily_report_time(self, parsed) -> None:
            query = parse_qs(parsed.query)
            time_str = query.get("time", [""])[0].strip()
            import re
            if not re.match(r"^([01]\d|2[0-3]):([0-5]\d)$", time_str):
                self.respond(400, {"success": False, "message": "time must be in HH:MM format (24h)"})
                return
            worker.db.set_daily_report_time(time_str)
            worker.reschedule_daily_report_job(time_str)
            logging.info("Daily report time updated", extra={"time": time_str})
            self.respond(200, {"success": True, "data": {"reportTime": time_str}})

        def _handle_daily_report_dates(self) -> None:
            dates = worker.db.list_daily_report_dates()
            self.respond(200, {"success": True, "data": dates})

        def _handle_daily_reports_for_date(self, parsed) -> None:
            query = parse_qs(parsed.query)
            date = query.get("date", [datetime.now().date().isoformat()])[0].strip()
            reports = worker.db.list_daily_reports_for_date(date)
            user_ids = list({r["user_id"] for r in reports})
            names = worker._get_user_names(user_ids)
            result = []
            for r in reports:
                result.append({
                    "userId": r["user_id"],
                    "fullName": names.get(r["user_id"], r["user_id"]),
                    "reportDate": r["report_date"],
                    "generatedAt": r["generated_at"],
                    "totalAnalyzedScreenshots": r["total_analyzed_screenshots"],
                    "productivityScore": r["productivity_score"],
                    "categoryBreakdown": json.loads(r["category_breakdown_json"]),
                    "topTasks": json.loads(r["top_tasks_json"]),
                    "hourlyFocus": json.loads(r["hourly_focus_json"]),
                    "distractionAlerts": json.loads(r["distraction_alerts_json"]),
                    "recommendations": json.loads(r["recommendations_json"]),
                    "reportMarkdown": r["report_markdown"],
                })
            self.respond(200, {"success": True, "data": result})

        def _handle_single_daily_report(self, parsed, user_id: str) -> None:
            query = parse_qs(parsed.query)
            date = query.get("date", [datetime.now().date().isoformat()])[0].strip()
            report = worker.db.get_daily_report(user_id, date)
            if not report:
                self.respond(404, {"success": False, "message": "Report not found"})
                return
            names = worker._get_user_names([user_id])
            self.respond(200, {"success": True, "data": {
                "userId": report["user_id"],
                "fullName": names.get(report["user_id"], report["user_id"]),
                "reportDate": report["report_date"],
                "generatedAt": report["generated_at"],
                "totalAnalyzedScreenshots": report["total_analyzed_screenshots"],
                "productivityScore": report["productivity_score"],
                "categoryBreakdown": json.loads(report["category_breakdown_json"]),
                "topTasks": json.loads(report["top_tasks_json"]),
                "hourlyFocus": json.loads(report["hourly_focus_json"]),
                "distractionAlerts": json.loads(report["distraction_alerts_json"]),
                "recommendations": json.loads(report["recommendations_json"]),
                "reportMarkdown": report["report_markdown"],
            }})

        def _handle_regenerate_daily_reports(self, parsed) -> None:
            query = parse_qs(parsed.query)
            date = query.get("date", [""])[0].strip()
            if not date:
                date = datetime.now().date().isoformat()
            try:
                generated = worker.report_generator.generate_for_date(date)
                self.respond(200, {"success": True, "data": {"date": date, "generated": generated}})
            except Exception as e:
                self.respond(500, {"success": False, "message": str(e)})

        @staticmethod
        def _latest_app_from_summary(summary_data: dict) -> str:
            timeline = summary_data.get("activity_timeline", [])
            if timeline:
                return timeline[-1].get("application_name", "")
            tasks = summary_data.get("top_tasks", [])
            if tasks:
                return tasks[0].get("task", "")
            return ""

        def log_message(self, _format: str, *_args: object) -> None:
            return

        def respond(self, status: int, payload: dict[str, object]) -> None:
            body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer((worker.config.summary_http_host, worker.config.summary_http_port), SummaryHandler)
    thread = Thread(target=server.serve_forever, name="summary-http-server", daemon=True)
    thread.start()
    logging.info("Screenshot AI summary HTTP server started", extra={"host": worker.config.summary_http_host, "port": worker.config.summary_http_port})
    return server


def run_forever(worker: ScreenshotAIWorker) -> None:
    stop_event = Event()

    def stop(_signum: int, _frame: object) -> None:
        stop_event.set()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    # Read daily report time from DB (fallback to env var)
    report_time = worker.db.get_daily_report_time("18:00")
    try:
        hour, minute = map(int, report_time.split(":"))
    except (ValueError, AttributeError):
        hour, minute = worker.parse_report_time()

    scheduler = BackgroundScheduler()
    scheduler.add_job(worker.generate_daily_reports, "cron", hour=hour, minute=minute, id="daily_reports", replace_existing=True)

    # Callback for dynamic rescheduling from HTTP endpoint
    def reschedule_daily_job(time_str: str) -> None:
        try:
            h, m = map(int, time_str.split(":"))
            job = scheduler.get_job("daily_reports")
            if job:
                scheduler.reschedule_job("daily_reports", trigger="cron", hour=h, minute=m)
                logging.info("Daily report job rescheduled", extra={"time": time_str})
        except Exception as e:
            logging.error("Failed to reschedule daily report job", extra={"error": str(e)})

    worker.reschedule_daily_report_job = reschedule_daily_job

    # Periodic summaries job (configurable interval)
    initial_interval = int(worker.db.get_org_config("periodic_interval_minutes", str(worker.config.periodic_interval_minutes)))
    scheduler.add_job(
        worker.collect_periodic_summaries,
        "interval",
        minutes=initial_interval,
        id="periodic_summaries",
        replace_existing=True,
    )
    worker.reschedule_periodic_job = lambda minutes: (
        scheduler.reschedule_job("periodic_summaries", trigger="interval", minutes=minutes)
        if scheduler.get_job("periodic_summaries")
        else None
    )

    scheduler.start()
    summary_server = start_summary_http_server(worker)
    worker.generate_today_report_if_due()

    logging.info("Screenshot AI worker started", extra={"poll_interval_seconds": worker.config.poll_interval_seconds})
    try:
        while not stop_event.is_set():
            worker.run_once()
            stop_event.wait(worker.config.poll_interval_seconds)
    finally:
        scheduler.shutdown(wait=False)
        summary_server.shutdown()
        logging.info("Screenshot AI worker stopped")


def main() -> int:
    config = load_config()
    configure_logging(config.log_level)
    logging.info("Loaded screenshot AI config", extra={"sqlite_path": str(config.sqlite_path), "upload_dir": str(config.upload_dir)})
    worker = ScreenshotAIWorker(config)
    run_forever(worker)
    return 0


if __name__ == "__main__":
    sys.exit(main())
