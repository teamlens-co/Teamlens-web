from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from database_manager import DatabaseManager


CATEGORIES = ("Work", "Learning", "Communication", "Leisure", "Other")
FOCUS_WEIGHT = {"Deep Work": 1.0, "Medium": 0.35, "Distraction": 0.0}
CATEGORY_WEIGHT = {"Work": 1.0, "Learning": 0.85, "Communication": 0.4, "Other": 0.1, "Leisure": 0.0}


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
            app = row["application_name"] or ""
            captured = datetime.fromisoformat(row["captured_at"])
            # Blank/unidentifiable screenshots (no app, no text, blank screen) → treat as idle
            if not app.strip() and (not row.get("visible_text") or not row["visible_text"].strip()):
                category = "Other"
                focus = "Distraction"
                task = "Idle / Blank screen"
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
            distraction_count=len(distraction_alerts),
        )
        report_markdown = self._render_markdown(
            title,
            report_date,
            range_label,
            len(rows),
            total_seconds,
            productivity_score,
            executive_summary["summary_text"],
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
            "rating": executive_summary["rating"],
            "executive_summary": executive_summary["summary_text"],
            "score_explanation": executive_summary["score_explanation"],
            "top_issue": executive_summary["top_issue"] or "No major issues.",
            "distraction_summary": executive_summary["distraction_summary"],
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
        distraction_count: int = 0,
    ) -> dict:
        primary_category = max(category_breakdown, key=lambda item: item["duration_seconds"], default={"category": "Other", "percentage": 0})
        main_task = task_details[0] if task_details else None
        if not main_task:
            return "No clear work pattern could be inferred from the analyzed screenshots."

        apps = ", ".join(main_task["applications"]) or "unknown apps"

        # Build a detailed breakdown string
        cat_lines = []
        for cat in sorted(category_breakdown, key=lambda c: c["percentage"], reverse=True):
            cat_lines.append(f"{cat['category']}: {cat['duration']} ({cat['percentage']}%)")

        # Top tasks summary
        task_lines = []
        for task in task_details[:4]:
            task_lines.append(f"  - {task['task']}: {task['duration']} in {', '.join(task['applications'][:2])}")

        # Find distractions/unnecessary activities
        distractions = [t for t in task_details if t["primary_category"] == "Leisure"]
        distraction_lines = []
        for d in distractions:
            distraction_lines.append(f"  - {d['task']}: {d['duration']} (unnecessary)")

        duration_str = format_duration(total_seconds)

        # Score interpretation
        if productivity_score >= 90:
            score_assessment = "Excellent productivity"
            rating = "excellent"
        elif productivity_score >= 75:
            score_assessment = "Good productivity"
            rating = "good"
        elif productivity_score >= 60:
            score_assessment = "Average productivity — some improvements needed"
            rating = "average"
        elif productivity_score >= 40:
            score_assessment = "Below average productivity — significant room for improvement"
            rating = "below_average"
        else:
            score_assessment = "Poor productivity — major focus issues detected"
            rating = "poor"

        # Score explanation — WHY the score is what it is
        work_pct = next((c["percentage"] for c in category_breakdown if c["category"] == "Work"), 0)
        learn_pct = next((c["percentage"] for c in category_breakdown if c["category"] == "Learning"), 0)
        comm_pct = next((c["percentage"] for c in category_breakdown if c["category"] == "Communication"), 0)
        leisure_pct = next((c["percentage"] for c in category_breakdown if c["category"] == "Leisure"), 0)
        other_pct = next((c["percentage"] for c in category_breakdown if c["category"] == "Other"), 0)

        score_parts = []
        if work_pct > 0:
            score_parts.append(f"**{work_pct}%** Work")
        if learn_pct > 0:
            score_parts.append(f"**{learn_pct}%** Learning")
        if comm_pct > 0:
            score_parts.append(f"**{comm_pct}%** Communication")
        if leisure_pct > 0:
            score_parts.append(f"**{leisure_pct}%** Leisure (⚠️ unproductive)")
        if other_pct > 0:
            score_parts.append(f"**{other_pct}%** Other")

        breakdown_str = " | ".join(score_parts)

        # Determine what caused low score
        low_score_reasons = []
        if leisure_pct >= 20:
            low_score_reasons.append(f"⚠️ **{leisure_pct}%** time spent on Leisure activities (non-work)")
        if other_pct >= 30:
            low_score_reasons.append(f"⚠️ **{other_pct}%** time spent on unclassified/Other activities")
        if work_pct < 30 and comm_pct > 50:
            low_score_reasons.append(f"⚡ Too much time ({comm_pct}%) in Communication — emails/chats instead of actual work")
        if work_pct < 20:
            low_score_reasons.append(f"⚡ Very little time ({work_pct}%) spent on core work tasks")
        if productivity_score < 60 and not low_score_reasons:
            low_score_reasons.append("Mixed focus across tasks — no single deep work block detected")

        top_issue = low_score_reasons[0] if low_score_reasons else None

        score_explanation = f"Score {productivity_score} — {score_assessment}. Breakdown: {breakdown_str}."
        if low_score_reasons:
            score_explanation += f"\n\n**Why score is {productivity_score}:**"
            for reason in low_score_reasons:
                score_explanation += f"\n• {reason}"

        # Distraction summary
        dist_count = distraction_count
        if dist_count > 0:
            distraction_summary = f"⚠️ **{dist_count} distraction(s) detected** in this period. The employee was browsing non-work content."
        else:
            distraction_summary = "✅ No distractions detected in this period."

        lines = [
            f"**{score_assessment}** ({productivity_score}/100). Analyzed {analyzed_count} screenshots over {duration_str}.",
            f"Primary activity: **{primary_category['category']}** ({primary_category['percentage']}%) — {main_task['task']} in {apps}.",
            "",
            "**Category Breakdown:**",
        ]
        lines.extend(f"  • {cl}" for cl in cat_lines)
        lines.append("")
        lines.append("**Top Tasks Completed:**")
        lines.extend(task_lines)

        if distraction_lines:
            lines.append("")
            lines.append("**⚠️ Distractions / Unnecessary Activities:**")
            lines.extend(distraction_lines)

        lines.append("")
        lines.append(f"**Focus Level:** {main_task['primary_focus']}")
        if top_issue:
            lines.append(f"**⚠️ Key Issue:** {top_issue}")

        return {
            "summary_text": "\n".join(lines),
            "rating": rating,
            "score_explanation": score_explanation,
            "top_issue": top_issue,
            "distraction_summary": distraction_summary,
        }

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
