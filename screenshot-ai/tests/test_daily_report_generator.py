from datetime import datetime, timedelta, timezone

from daily_report_generator import DailyReportGenerator
from database_manager import DatabaseManager


def insert_success(db, screenshot_id, captured_at, category, focus, task):
    db.insert_analysis(
        screenshot_id=screenshot_id,
        user_id="user-1",
        session_id="session-1",
        file_path=f"{screenshot_id}.png",
        captured_at=captured_at.isoformat(),
        image_sha256=screenshot_id,
        application_name="VS Code",
        task=task,
        category=category,
        focus_level=focus,
        visible_text="",
        confidence=0.8,
        raw_json={"metadata": {"application_name_hint": "VS Code", "window_title_hint": task}},
        status="success",
    )


def test_daily_report_generation(tmp_path):
    db = DatabaseManager(tmp_path / "ai.sqlite3")
    start = datetime(2026, 6, 2, 9, 0, tzinfo=timezone.utc)
    insert_success(db, "shot-1", start, "Work", "Deep Work", "coding Go API")
    insert_success(db, "shot-2", start + timedelta(minutes=5), "Communication", "Medium", "replying Slack")
    insert_success(db, "shot-3", start + timedelta(minutes=10), "Leisure", "Distraction", "watching YouTube")

    generator = DailyReportGenerator(db, tmp_path / "reports")
    markdown = generator.generate_for_user("user-1", "2026-06-02")

    assert markdown is not None
    assert "Productivity score:" in markdown
    assert "coding Go API" in markdown
    assert "What Work Was Actually Done" in markdown
    assert "Detailed Activity Timeline" in markdown
    assert "VS Code - coding Go API" in markdown
    assert (tmp_path / "reports" / "2026-06-02" / "user-1.md").exists()
