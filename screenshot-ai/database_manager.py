from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator


class DatabaseManager:
    def __init__(self, sqlite_path: Path) -> None:
        self.sqlite_path = sqlite_path
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def initialize(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS screenshot_analysis (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  screenshot_id TEXT UNIQUE NOT NULL,
                  user_id TEXT NOT NULL,
                  session_id TEXT,
                  file_path TEXT NOT NULL,
                  captured_at TEXT NOT NULL,
                  analyzed_at TEXT NOT NULL,
                  image_sha256 TEXT NOT NULL,
                  application_name TEXT,
                  task TEXT,
                  category TEXT CHECK(category IN ('Work','Learning','Communication','Leisure','Other')),
                  focus_level TEXT CHECK(focus_level IN ('Deep Work','Medium','Distraction')),
                  visible_text TEXT,
                  confidence REAL DEFAULT 0,
                  raw_json TEXT NOT NULL,
                  status TEXT NOT NULL DEFAULT 'success',
                  error_message TEXT
                );

                CREATE TABLE IF NOT EXISTS daily_reports (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id TEXT NOT NULL,
                  report_date TEXT NOT NULL,
                  generated_at TEXT NOT NULL,
                  total_analyzed_screenshots INTEGER NOT NULL,
                  category_breakdown_json TEXT NOT NULL,
                  top_tasks_json TEXT NOT NULL,
                  productivity_score INTEGER NOT NULL,
                  hourly_focus_json TEXT NOT NULL,
                  distraction_alerts_json TEXT NOT NULL,
                  recommendations_json TEXT NOT NULL,
                  report_markdown TEXT NOT NULL,
                  UNIQUE(user_id, report_date)
                );

                CREATE TABLE IF NOT EXISTS analyzer_state (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_screenshot_analysis_user_date
                  ON screenshot_analysis(user_id, captured_at);
                CREATE INDEX IF NOT EXISTS idx_screenshot_analysis_hash
                  ON screenshot_analysis(image_sha256);
                CREATE INDEX IF NOT EXISTS idx_screenshot_analysis_status
                  ON screenshot_analysis(status);

                CREATE TABLE IF NOT EXISTS org_config (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS periodic_summaries (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id TEXT NOT NULL,
                  start_iso TEXT NOT NULL,
                  end_iso TEXT NOT NULL,
                  summary_json TEXT NOT NULL,
                  screenshot_count INTEGER NOT NULL DEFAULT 0,
                  productivity_score INTEGER NOT NULL DEFAULT 0,
                  generated_at TEXT NOT NULL,
                  interval_minutes INTEGER NOT NULL DEFAULT 30
                );

                CREATE INDEX IF NOT EXISTS idx_periodic_summaries_user_date
                  ON periodic_summaries(user_id, start_iso, end_iso);
                CREATE INDEX IF NOT EXISTS idx_periodic_summaries_generated
                  ON periodic_summaries(generated_at);
                """
            )

    def has_screenshot(self, screenshot_id: str) -> bool:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM screenshot_analysis WHERE screenshot_id = ? AND status IN ('success', 'skipped') LIMIT 1",
                (screenshot_id,),
            ).fetchone()
            return row is not None

    def image_hash_exists(self, image_sha256: str) -> bool:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM screenshot_analysis WHERE image_sha256 = ? AND status = 'success' LIMIT 1",
                (image_sha256,),
            ).fetchone()
            return row is not None

    def has_recent_same_window(
        self,
        user_id: str,
        session_id: str | None,
        application_name: str | None,
        window_title: str | None,
        captured_at: datetime,
        stable_minutes: int,
    ) -> bool:
        cutoff = captured_at - timedelta(minutes=stable_minutes)
        raw = json.dumps({"application_name_hint": application_name or "", "window_title_hint": window_title or ""})
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT 1
                FROM screenshot_analysis
                WHERE user_id = ?
                  AND COALESCE(session_id, '') = COALESCE(?, '')
                  AND captured_at >= ?
                  AND status = 'success'
                  AND json_extract(raw_json, '$.metadata.application_name_hint') = json_extract(?, '$.application_name_hint')
                  AND json_extract(raw_json, '$.metadata.window_title_hint') = json_extract(?, '$.window_title_hint')
                LIMIT 1
                """,
                (user_id, session_id, cutoff.isoformat(), raw, raw),
            ).fetchone()
            return row is not None

    def insert_analysis(
        self,
        *,
        screenshot_id: str,
        user_id: str,
        session_id: str | None,
        file_path: str,
        captured_at: str,
        image_sha256: str,
        application_name: str | None,
        task: str | None,
        category: str | None,
        focus_level: str | None,
        visible_text: str | None,
        confidence: float,
        raw_json: dict[str, Any],
        status: str,
        error_message: str | None = None,
    ) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO screenshot_analysis (
                  screenshot_id, user_id, session_id, file_path, captured_at, analyzed_at,
                  image_sha256, application_name, task, category, focus_level, visible_text,
                  confidence, raw_json, status, error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(screenshot_id) DO UPDATE SET
                  analyzed_at = excluded.analyzed_at,
                  image_sha256 = excluded.image_sha256,
                  application_name = excluded.application_name,
                  task = excluded.task,
                  category = excluded.category,
                  focus_level = excluded.focus_level,
                  visible_text = excluded.visible_text,
                  confidence = excluded.confidence,
                  raw_json = excluded.raw_json,
                  status = excluded.status,
                  error_message = excluded.error_message
                """,
                (
                    screenshot_id,
                    user_id,
                    session_id,
                    file_path,
                    captured_at,
                    datetime.now(timezone.utc).isoformat(),
                    image_sha256,
                    application_name,
                    task,
                    category,
                    focus_level,
                    visible_text,
                    confidence,
                    json.dumps(raw_json, ensure_ascii=True),
                    status,
                    error_message,
                ),
            )

    def list_successful_analysis_for_date(self, user_id: str, report_date: str) -> list[sqlite3.Row]:
        start = datetime.fromisoformat(report_date).replace(tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        with self.connect() as conn:
            return list(
                conn.execute(
                    """
                    SELECT *
                    FROM screenshot_analysis
                    WHERE user_id = ?
                      AND status = 'success'
                      AND captured_at >= ?
                      AND captured_at < ?
                    ORDER BY captured_at ASC
                    """,
                    (user_id, start.isoformat(), end.isoformat()),
                )
            )

    def list_successful_analysis_for_users_on_date(self, user_ids: list[str], report_date: str) -> list[sqlite3.Row]:
        start = datetime.fromisoformat(report_date).replace(tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        return self.list_successful_analysis_for_users_between(user_ids, start.isoformat(), end.isoformat())

    def list_successful_analysis_for_users_between(
        self,
        user_ids: list[str],
        start_iso: str,
        end_iso: str,
    ) -> list[sqlite3.Row]:
        with self.connect() as conn:
            if not user_ids:
                return list(
                    conn.execute(
                        """
                        SELECT *
                        FROM screenshot_analysis
                        WHERE status = 'success'
                          AND captured_at >= ?
                          AND captured_at < ?
                        ORDER BY captured_at ASC
                        """,
                        (start_iso, end_iso),
                    )
                )

            placeholders = ",".join("?" for _ in user_ids)
            return list(
                conn.execute(
                    f"""
                    SELECT *
                    FROM screenshot_analysis
                    WHERE status = 'success'
                      AND user_id IN ({placeholders})
                      AND captured_at >= ?
                      AND captured_at < ?
                    ORDER BY captured_at ASC
                    """,
                    (*user_ids, start_iso, end_iso),
                )
            )

    def list_reportable_analysis_for_users_between(
        self,
        user_ids: list[str],
        start_iso: str,
        end_iso: str,
    ) -> list[dict[str, Any]]:
        with self.connect() as conn:
            user_filter = ""
            args: list[Any] = [start_iso, end_iso]
            if user_ids:
                placeholders = ",".join("?" for _ in user_ids)
                user_filter = f" AND user_id IN ({placeholders})"
                args.extend(user_ids)

            rows = [
                dict(row)
                for row in conn.execute(
                    f"""
                    SELECT *
                    FROM screenshot_analysis
                    WHERE status IN ('success', 'skipped')
                      AND captured_at >= ?
                      AND captured_at < ?
                      {user_filter}
                    ORDER BY user_id ASC, COALESCE(session_id, '') ASC, captured_at ASC
                    """,
                    args,
                )
            ]

        hydrated: list[dict[str, Any]] = []
        last_success_by_user: dict[str, dict[str, Any]] = {}
        last_success_by_session: dict[tuple[str, str], dict[str, Any]] = {}

        for row in rows:
            if row["status"] == "success":
                hydrated.append(row)
                last_success_by_user[row["user_id"]] = row
                last_success_by_session[(row["user_id"], row.get("session_id") or "")] = row
                continue

            inherited = last_success_by_session.get((row["user_id"], row.get("session_id") or "")) or last_success_by_user.get(row["user_id"])
            if not inherited:
                continue

            merged = dict(row)
            for field in ("application_name", "task", "category", "focus_level", "visible_text"):
                merged[field] = inherited.get(field)
            merged["confidence"] = min(float(inherited.get("confidence") or 0), 0.65)
            merged["raw_json"] = self._merge_inherited_raw_json(row.get("raw_json"), inherited.get("raw_json"))
            hydrated.append(merged)

        return sorted(hydrated, key=lambda row: row["captured_at"])

    @staticmethod
    def _merge_inherited_raw_json(raw_json: str | None, inherited_raw_json: str | None) -> str:
        try:
            raw = json.loads(raw_json or "{}")
        except json.JSONDecodeError:
            raw = {}
        try:
            inherited = json.loads(inherited_raw_json or "{}")
        except json.JSONDecodeError:
            inherited = {}

        metadata = raw.get("metadata") or inherited.get("metadata") or {}
        return json.dumps(
            {
                **inherited,
                "metadata": metadata,
                "inherited_from_previous_analysis": True,
                "skip_reason": raw.get("skip_reason"),
            },
            ensure_ascii=True,
        )

    def list_users_with_analysis_for_date(self, report_date: str) -> list[str]:
        start = datetime.fromisoformat(report_date).replace(tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT DISTINCT user_id
                FROM screenshot_analysis
                WHERE status = 'success'
                  AND captured_at >= ?
                  AND captured_at < ?
                """,
                (start.isoformat(), end.isoformat()),
            ).fetchall()
            return [row["user_id"] for row in rows]

    def report_exists(self, user_id: str, report_date: str) -> bool:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM daily_reports WHERE user_id = ? AND report_date = ? LIMIT 1",
                (user_id, report_date),
            ).fetchone()
            return row is not None

    def upsert_daily_report(
        self,
        *,
        user_id: str,
        report_date: str,
        total_analyzed_screenshots: int,
        category_breakdown: list[dict[str, Any]],
        top_tasks: list[dict[str, Any]],
        productivity_score: int,
        hourly_focus: list[dict[str, Any]],
        distraction_alerts: list[str],
        recommendations: list[str],
        report_markdown: str,
    ) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO daily_reports (
                  user_id, report_date, generated_at, total_analyzed_screenshots,
                  category_breakdown_json, top_tasks_json, productivity_score,
                  hourly_focus_json, distraction_alerts_json, recommendations_json,
                  report_markdown
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, report_date) DO UPDATE SET
                  generated_at = excluded.generated_at,
                  total_analyzed_screenshots = excluded.total_analyzed_screenshots,
                  category_breakdown_json = excluded.category_breakdown_json,
                  top_tasks_json = excluded.top_tasks_json,
                  productivity_score = excluded.productivity_score,
                  hourly_focus_json = excluded.hourly_focus_json,
                  distraction_alerts_json = excluded.distraction_alerts_json,
                  recommendations_json = excluded.recommendations_json,
                  report_markdown = excluded.report_markdown
                """,
                (
                    user_id,
                    report_date,
                    datetime.now(timezone.utc).isoformat(),
                    total_analyzed_screenshots,
                    json.dumps(category_breakdown, ensure_ascii=True),
                    json.dumps(top_tasks, ensure_ascii=True),
                    productivity_score,
                    json.dumps(hourly_focus, ensure_ascii=True),
                    json.dumps(distraction_alerts, ensure_ascii=True),
                    json.dumps(recommendations, ensure_ascii=True),
                    report_markdown,
                ),
            )

    # ── Analyzer State (key/value) ──────────────────────────────────────

    def get_state(self, key: str, default: str = "") -> str:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT value FROM analyzer_state WHERE key = ?", (key,)
            ).fetchone()
            return row["value"] if row else default

    def set_state(self, key: str, value: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO analyzer_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def get_last_processed_id(self) -> str:
        """Get the last processed screenshot ID (cursor for polling)."""
        return self.get_state("last_processed_id", "")

    def set_last_processed_id(self, id_val: str) -> None:
        """Store the last processed screenshot ID (cursor for polling)."""
        self.set_state("last_processed_id", id_val)

    # ── Periodic Summaries ──────────────────────────────────────────────

    def get_org_config(self, key: str, default: str = "") -> str:
        with self.connect() as conn:
            row = conn.execute("SELECT value FROM org_config WHERE key = ?", (key,)).fetchone()
            return row["value"] if row else default

    def set_org_config(self, key: str, value: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO org_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def periodic_summary_exists(self, user_id: str, start_iso: str) -> bool:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM periodic_summaries WHERE user_id = ? AND start_iso = ? LIMIT 1",
                (user_id, start_iso),
            ).fetchone()
            return row is not None

    def insert_periodic_summary(
        self,
        *,
        user_id: str,
        start_iso: str,
        end_iso: str,
        summary_json: dict[str, Any],
        screenshot_count: int,
        productivity_score: int,
        interval_minutes: int,
    ) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO periodic_summaries (
                  user_id, start_iso, end_iso, summary_json, screenshot_count,
                  productivity_score, generated_at, interval_minutes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    start_iso,
                    end_iso,
                    json.dumps(summary_json, ensure_ascii=True),
                    screenshot_count,
                    productivity_score,
                    datetime.now(timezone.utc).isoformat(),
                    interval_minutes,
                ),
            )

    def list_periodic_summaries(
        self, user_ids: list[str] | None, start_iso: str, end_iso: str
    ) -> list[sqlite3.Row]:
        with self.connect() as conn:
            args: list[Any] = [start_iso, end_iso]
            query = """
                SELECT * FROM periodic_summaries
                WHERE start_iso >= ? AND end_iso <= ?
            """
            if user_ids:
                placeholders = ",".join("?" for _ in user_ids)
                query += f" AND user_id IN ({placeholders})"
                args.extend(user_ids)
            query += " ORDER BY user_id ASC, start_iso ASC"
            return list(conn.execute(query, args))

    def get_latest_periodic_summary(self, user_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM periodic_summaries
                WHERE user_id = ?
                ORDER BY generated_at DESC
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()
            return dict(row) if row else None

    def get_all_latest_periodic_summaries(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT p.*
                FROM periodic_summaries p
                INNER JOIN (
                    SELECT user_id, MAX(generated_at) AS max_gen
                    FROM periodic_summaries
                    GROUP BY user_id
                ) latest ON p.user_id = latest.user_id AND p.generated_at = latest.max_gen
                ORDER BY p.generated_at DESC
                """,
            ).fetchall()
            return [dict(row) for row in rows]
