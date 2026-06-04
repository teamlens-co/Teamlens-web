from datetime import datetime, timezone

from database_manager import DatabaseManager


def test_database_migrations_are_idempotent(tmp_path):
    db_path = tmp_path / "ai.sqlite3"
    DatabaseManager(db_path)
    DatabaseManager(db_path)
    assert db_path.exists()


def test_insert_and_detect_screenshot(tmp_path):
    db = DatabaseManager(tmp_path / "ai.sqlite3")
    captured_at = datetime(2026, 6, 2, 10, 0, tzinfo=timezone.utc).isoformat()
    db.insert_analysis(
        screenshot_id="shot-1",
        user_id="user-1",
        session_id="session-1",
        file_path="screenshots/shot.png",
        captured_at=captured_at,
        image_sha256="abc",
        application_name="VS Code",
        task="coding Python",
        category="Work",
        focus_level="Deep Work",
        visible_text="main.py",
        confidence=0.9,
        raw_json={"metadata": {"application_name_hint": "VS Code", "window_title_hint": "main.py"}},
        status="success",
    )
    assert db.has_screenshot("shot-1")
    assert db.image_hash_exists("abc")
    assert db.has_recent_same_window("user-1", "session-1", "VS Code", "main.py", datetime(2026, 6, 2, 10, 3, tzinfo=timezone.utc), 5)


def test_reportable_rows_inherit_skipped_analysis(tmp_path):
    db = DatabaseManager(tmp_path / "ai.sqlite3")
    db.insert_analysis(
        screenshot_id="shot-1",
        user_id="user-1",
        session_id="session-1",
        file_path="screenshots/shot-1.png",
        captured_at="2026-06-03T09:00:00+00:00",
        image_sha256="hash-1",
        application_name="VS Code",
        task="coding mobile app",
        category="Work",
        focus_level="Deep Work",
        visible_text="mobile app code",
        confidence=0.9,
        raw_json={"metadata": {"application_name_hint": "VS Code"}},
        status="success",
    )
    db.insert_analysis(
        screenshot_id="shot-2",
        user_id="user-1",
        session_id="session-1",
        file_path="screenshots/shot-2.png",
        captured_at="2026-06-03T09:01:00+00:00",
        image_sha256="hash-2",
        application_name=None,
        task=None,
        category=None,
        focus_level=None,
        visible_text=None,
        confidence=0,
        raw_json={"skip_reason": "stable_window_sampling", "metadata": {"application_name_hint": "VS Code"}},
        status="skipped",
    )

    rows = db.list_reportable_analysis_for_users_between(
        ["user-1"],
        "2026-06-03T09:00:00+00:00",
        "2026-06-03T10:00:00+00:00",
    )

    assert len(rows) == 2
    assert rows[1]["task"] == "coding mobile app"
    assert rows[1]["category"] == "Work"
