from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from database_manager import DatabaseManager


CATEGORIES = ("Work", "Learning", "Communication", "Leisure", "Other")
FOCUS_WEIGHT = {"Deep Work": 1.0, "Medium": 0.65, "Distraction": 0.0}
CATEGORY_WEIGHT = {"Work": 1.0, "Learning": 0.85, "Communication": 0.7, "Other": 0.45, "Leisure": 0.0}


def format_duration(seconds: int) -> str:
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours:
        return f"{hours}h {minutes:02d}m"
    return f"{minutes}m"


def dominant_focus(levels: list[str]) -> str:
    if not levels:
        return "Medium"
    counts = Counter(levels)
    return counts.most_common(1)[0][0]


class DailyReportGenerator:
    def __init__(self, db: DatabaseManager, output_dir: Path) -> None:
        self.db = db
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_for_user(self, user_id: str, report_date: str) -> str | None:
        rows = self.db.list_successful_analysis_for_date(user_id, report_date)
        if not rows:
            return None

        summary = self.build_summary(rows, report_date, "Daily Productivity Report")
        report_markdown = summary["markdown"]

        self.db.upsert_daily_report(
            user_id=user_id,
            report_date=report_date,
            total_analyzed_screenshots=summary["total_analyzed_screenshots"],
            category_breakdown=summary["category_breakdown"],
            top_tasks=summary["top_tasks"],
            productivity_score=summary["productivity_score"],
            hourly_focus=summary["hourly_focus"],
            distraction_alerts=summary["distraction_alerts"],
            recommendations=summary["recommendations"],
            report_markdown=report_markdown,
        )
        self._write_markdown(user_id, report_date, report_markdown)
        return report_markdown

    def build_summary(self, rows: list[Any], report_date: str, title: str, range_label: str | None = None) -> dict[str, Any]:
        if not rows:
            return {
                "title": title,
                "report_date": report_date,
                "total_analyzed_screenshots": 0,
                "total_seconds": 0,
                "total_duration": "0m",
                "productivity_score": 0,
                "executive_summary": "No clear work pattern could be inferred from the analyzed screenshots.",
                "category_breakdown": [],
                "top_tasks": [],
                "hourly_focus": [],
                "distraction_alerts": [],
                "recommendations": ["Collect more screenshots before generating a summary."],
                "markdown": f"# {title} - {report_date}\n\nNot enough analyzed screenshots yet.\n",
            }

        durations = self._durations(rows)
        total_seconds = max(1, sum(durations))
        category_seconds: dict[str, int] = {category: 0 for category in CATEGORIES}
        task_seconds: Counter[str] = Counter()
        hourly_focus_values: dict[int, list[str]] = defaultdict(list)
        distraction_alerts: list[str] = []
        activity_timeline = self._activity_timeline(rows, durations)
        task_details = self._task_details(rows, durations)

        score_points = 0.0
        for row, seconds in zip(rows, durations):
            category = row["category"] or "Other"
            focus = row["focus_level"] or "Medium"
            task = row["task"] or "Unknown"
            captured = datetime.fromisoformat(row["captured_at"])
            category_seconds[category] = category_seconds.get(category, 0) + seconds
            task_seconds[task] += seconds
            hourly_focus_values[captured.hour].append(focus)
            score_points += seconds * ((CATEGORY_WEIGHT.get(category, 0.45) * 0.65) + (FOCUS_WEIGHT.get(focus, 0.65) * 0.35))
            if category == "Leisure" or focus == "Distraction":
                distraction_alerts.append(f"{captured.strftime('%H:%M')}: {task} detected.")

        productivity_score = max(0, min(100, round((score_points / total_seconds) * 100)))
        category_breakdown = [
            {
                "category": category,
                "duration_seconds": seconds,
                "duration": format_duration(seconds),
                "percentage": round((seconds / total_seconds) * 100),
            }
            for category, seconds in category_seconds.items()
        ]
        top_tasks = [
            {"task": task, "duration_seconds": seconds, "duration": format_duration(seconds)}
            for task, seconds in task_seconds.most_common(5)
        ]
        hourly_focus = [
            {"hour": f"{hour:02d}:00", "focus_level": dominant_focus(levels)}
            for hour, levels in sorted(hourly_focus_values.items())
        ]
        recommendations = self._recommendations(category_seconds, hourly_focus, productivity_score)
        executive_summary = self._executive_summary(
            analyzed_count=len(rows),
            total_seconds=total_seconds,
            productivity_score=productivity_score,
            category_breakdown=category_breakdown,
            task_details=task_details,
        )
        report_markdown = self._render_markdown(
            title,
            report_date,
            range_label,
            len(rows),
            total_seconds,
            productivity_score,
            executive_summary,
            category_breakdown,
            top_tasks,
            hourly_focus,
            distraction_alerts[:10],
            recommendations,
            activity_timeline,
            task_details,
        )
        return {
            "title": title,
            "report_date": report_date,
            "total_analyzed_screenshots": len(rows),
            "total_seconds": total_seconds,
            "total_duration": format_duration(total_seconds),
            "productivity_score": productivity_score,
            "executive_summary": executive_summary,
            "category_breakdown": category_breakdown,
            "top_tasks": top_tasks,
            "hourly_focus": hourly_focus,
            "distraction_alerts": distraction_alerts[:10],
            "recommendations": recommendations,
            "activity_timeline": activity_timeline,
            "task_details": task_details,
            "markdown": report_markdown,
        }

    def generate_for_date(self, report_date: str, only_missing: bool = False) -> int:
        generated = 0
        for user_id in self.db.list_users_with_analysis_for_date(report_date):
            if only_missing and self.db.report_exists(user_id, report_date):
                continue
            if self.generate_for_user(user_id, report_date):
                generated += 1
        return generated

    def _durations(self, rows: list[Any]) -> list[int]:
        durations: list[int] = []
        for index, row in enumerate(rows):
            current = datetime.fromisoformat(row["captured_at"])
            if index + 1 < len(rows):
                next_row = rows[index + 1]
                if next_row["user_id"] == row["user_id"] and next_row["session_id"] == row["session_id"]:
                    next_time = datetime.fromisoformat(next_row["captured_at"])
                    seconds = int((next_time - current).total_seconds())
                    durations.append(max(30, min(seconds, 5 * 60)))
                else:
                    durations.append(30)
            else:
                durations.append(30)
        return durations

    def _recommendations(self, category_seconds: dict[str, int], hourly_focus: list[dict[str, str]], score: int) -> list[str]:
        recommendations: list[str] = []
        if score < 70:
            recommendations.append("Protect one deep-work block early in the day.")
        if category_seconds.get("Communication", 0) > 90 * 60:
            recommendations.append("Batch communication into two or three planned windows.")
        if category_seconds.get("Leisure", 0) > 20 * 60:
            recommendations.append("Move leisure browsing outside clocked work time.")
        deep_hours = [item["hour"] for item in hourly_focus if item["focus_level"] == "Deep Work"]
        if deep_hours:
            recommendations.append(f"Repeat deep-work patterns around {', '.join(deep_hours[:2])}.")
        if not recommendations:
            recommendations.append("Keep the current work rhythm and review distractions after lunch.")
        return recommendations[:4]

    def _executive_summary(
        self,
        *,
        analyzed_count: int,
        total_seconds: int,
        productivity_score: int,
        category_breakdown: list[dict[str, Any]],
        task_details: list[dict[str, Any]],
    ) -> str:
        primary_category = max(category_breakdown, key=lambda item: item["duration_seconds"], default={"category": "Other", "percentage": 0})
        main_task = task_details[0] if task_details else None
        if not main_task:
            return "No clear work pattern could be inferred from the analyzed screenshots."

        apps = ", ".join(main_task["applications"]) or "unknown apps"
        return (
            f"Across {analyzed_count} analyzed screenshots ({format_duration(total_seconds)}), activity was mostly "
            f"{primary_category['category']} ({primary_category['percentage']}%). The main work pattern was "
            f"{main_task['task']} in {apps}, with {main_task['primary_focus']} focus. "
            f"Overall productivity score is {productivity_score}/100."
        )

    def _activity_timeline(self, rows: list[Any], durations: list[int]) -> list[dict[str, Any]]:
        timeline: list[dict[str, Any]] = []
        for row, seconds in zip(rows, durations):
            captured = datetime.fromisoformat(row["captured_at"])
            metadata = self._metadata(row)
            app_name = row["application_name"] or metadata.get("application_name_hint") or "Unknown"
            evidence = self._compact_text(row["visible_text"] or metadata.get("window_title_hint") or "")
            timeline.append(
                {
                    "time": captured.strftime("%H:%M"),
                    "user_id": row["user_id"],
                    "duration_seconds": seconds,
                    "duration": format_duration(seconds),
                    "application_name": app_name,
                    "task": row["task"] or "Unknown activity",
                    "category": row["category"] or "Other",
                    "focus_level": row["focus_level"] or "Medium",
                    "evidence": evidence,
                    "confidence": row["confidence"] or 0,
                }
            )
        return timeline

    def _task_details(self, rows: list[Any], durations: list[int]) -> list[dict[str, Any]]:
        grouped: dict[str, dict[str, Any]] = {}
        for row, seconds in zip(rows, durations):
            task = row["task"] or "Unknown activity"
            captured = datetime.fromisoformat(row["captured_at"])
            metadata = self._metadata(row)
            app_name = row["application_name"] or metadata.get("application_name_hint") or "Unknown"
            evidence = self._compact_text(row["visible_text"] or metadata.get("window_title_hint") or "")
            item = grouped.setdefault(
                task,
                {
                    "task": task,
                    "duration_seconds": 0,
                    "applications": Counter(),
                    "categories": Counter(),
                    "focus_levels": Counter(),
                    "evidence": [],
                    "first_seen": captured,
                    "last_seen": captured,
                },
            )
            item["duration_seconds"] += seconds
            item["applications"][app_name] += 1
            item["categories"][row["category"] or "Other"] += 1
            item["focus_levels"][row["focus_level"] or "Medium"] += 1
            item["first_seen"] = min(item["first_seen"], captured)
            item["last_seen"] = max(item["last_seen"], captured)
            if evidence and evidence not in item["evidence"]:
                item["evidence"].append(evidence)

        details: list[dict[str, Any]] = []
        for item in grouped.values():
            details.append(
                {
                    "task": item["task"],
                    "duration_seconds": item["duration_seconds"],
                    "duration": format_duration(item["duration_seconds"]),
                    "time_range": f"{item['first_seen'].strftime('%H:%M')} - {item['last_seen'].strftime('%H:%M')}",
                    "applications": [name for name, _count in item["applications"].most_common(3)],
                    "primary_category": item["categories"].most_common(1)[0][0],
                    "primary_focus": item["focus_levels"].most_common(1)[0][0],
                    "evidence": item["evidence"][:3],
                }
            )
        return sorted(details, key=lambda item: item["duration_seconds"], reverse=True)[:8]

    def _metadata(self, row: Any) -> dict[str, str]:
        try:
            raw_json = json.loads(row["raw_json"] or "{}")
        except (TypeError, json.JSONDecodeError):
            return {}
        metadata = raw_json.get("metadata", {})
        if not isinstance(metadata, dict):
            return {}
        return {str(key): str(value) for key, value in metadata.items() if value}

    @staticmethod
    def _compact_text(value: str, limit: int = 160) -> str:
        text = " ".join(value.split())
        text = re.sub(r"(?i)(password|passwd|pwd)\s*[:=]?\s*[^\s,;]+", r"\1 [REDACTED]", text)
        text = re.sub(r"(?i)(api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+", r"\1=[REDACTED]", text)
        text = re.sub(r"cfut_[A-Za-z0-9_-]+", "[REDACTED]", text)
        if len(text) <= limit:
            return text
        return text[: limit - 3].rstrip() + "..."

    def _render_markdown(
        self,
        title: str,
        report_date: str,
        range_label: str | None,
        analyzed_count: int,
        total_seconds: int,
        productivity_score: int,
        executive_summary: str,
        category_breakdown: list[dict[str, Any]],
        top_tasks: list[dict[str, Any]],
        hourly_focus: list[dict[str, str]],
        distraction_alerts: list[str],
        recommendations: list[str],
        activity_timeline: list[dict[str, Any]],
        task_details: list[dict[str, Any]],
    ) -> str:
        lines = [
            f"# {title} - {report_date}",
            "",
            "## Summary",
        ]
        if range_label:
            lines.append(f"Time range: {range_label}")
        lines.extend(
            [
                f"Analyzed screenshots: {analyzed_count}",
                f"Total analyzed time: {format_duration(total_seconds)}",
                f"Productivity score: {productivity_score}/100",
                "",
                "## Plain English Summary",
                executive_summary,
                "",
                "## Category Breakdown",
            ]
        )
        lines.extend(
            f"- {item['category']}: {item['duration']}, {item['percentage']}%"
            for item in category_breakdown
        )
        lines.extend(["", "## Top 5 Tasks"])
        lines.extend(
            f"{index}. {item['task']} ({item['duration']})"
            for index, item in enumerate(top_tasks, start=1)
        )
        lines.extend(["", "## What Work Was Actually Done"])
        for index, item in enumerate(task_details, start=1):
            apps = ", ".join(item["applications"]) or "Unknown app"
            lines.append(f"{index}. {item['task']} - {item['duration']} ({item['time_range']})")
            lines.append(f"   - Apps: {apps}")
            lines.append(f"   - Focus/category: {item['primary_focus']} / {item['primary_category']}")
            for evidence in item["evidence"]:
                lines.append(f"   - Evidence: {evidence}")

        lines.extend(["", "## Detailed Activity Timeline"])
        has_multiple_users = len({item["user_id"] for item in activity_timeline}) > 1
        for item in activity_timeline[:25]:
            user_part = f" [{item['user_id']}]" if has_multiple_users else ""
            evidence = f" - {item['evidence']}" if item["evidence"] else ""
            lines.append(
                f"- {item['time']}{user_part}: {item['application_name']} - {item['task']} "
                f"({item['duration']}, {item['focus_level']}, {item['category']}){evidence}"
            )
        if len(activity_timeline) > 25:
            lines.append(f"- ... {len(activity_timeline) - 25} more analyzed screenshots in this range.")
        lines.extend(["", "## Hourly Focus"])
        lines.extend(f"- {item['hour']}: {item['focus_level']}" for item in hourly_focus)
        lines.extend(["", "## Distraction Alerts"])
        lines.extend(f"- {alert}" for alert in (distraction_alerts or ["No significant distractions detected."]))
        lines.extend(["", "## Recommendations For Tomorrow"])
        lines.extend(f"- {item}" for item in recommendations)
        return "\n".join(lines) + "\n"

    def _write_markdown(self, user_id: str, report_date: str, markdown: str) -> None:
        report_dir = self.output_dir / report_date
        report_dir.mkdir(parents=True, exist_ok=True)
        (report_dir / f"{user_id}.md").write_text(markdown, encoding="utf-8")
