from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class AppConfig:
    kimi_api_mode: str
    kimi_api_base_url: str
    kimi_gateway_id: str
    kimi_api_key: str
    kimi_model: str
    kimi_timeout_seconds: int
    kimi_max_retries: int
    kimi_max_tokens: int
    database_url: str
    upload_dir: Path
    docker_upload_container: str
    sqlite_path: Path
    report_output_dir: Path
    summary_http_host: str
    summary_http_port: int
    summary_min_screenshots: int
    poll_interval_seconds: int
    report_time_local: str
    analysis_sample_stable_minutes: int
    screenshot_lookback_hours: int
    screenshot_batch_limit: int
    max_image_width: int
    jpeg_quality: int
    log_level: str


def load_config() -> AppConfig:
    load_dotenv()

    base_dir = Path(__file__).resolve().parent

    def path_env(name: str, default: str) -> Path:
        value = os.getenv(name, default)
        path = Path(value)
        if not path.is_absolute():
            path = base_dir / path
        return path.resolve()

    return AppConfig(
        kimi_api_mode=os.getenv("KIMI_API_MODE", "workers-ai").strip().lower(),
        kimi_api_base_url=os.getenv("KIMI_API_BASE_URL", "https://your-cloudflare-proxy.example.com/v1").rstrip("/"),
        kimi_gateway_id=os.getenv("KIMI_GATEWAY_ID", ""),
        kimi_api_key=os.getenv("KIMI_API_KEY", ""),
        kimi_model=os.getenv("KIMI_MODEL", "kimi-2.6"),
        kimi_timeout_seconds=_int_env("KIMI_TIMEOUT_SECONDS", 45),
        kimi_max_retries=_int_env("KIMI_MAX_RETRIES", 3),
        kimi_max_tokens=_int_env("KIMI_MAX_TOKENS", 1200),
        database_url=os.getenv("DATABASE_URL", "postgres://teamlens:teamlens@localhost:5433/teamlens"),
        upload_dir=path_env("UPLOAD_DIR", "../uploads"),
        docker_upload_container=os.getenv("DOCKER_UPLOAD_CONTAINER", "teamlens-api-go").strip(),
        sqlite_path=path_env("SQLITE_PATH", "./data/screenshot_ai.sqlite3"),
        report_output_dir=path_env("REPORT_OUTPUT_DIR", "./reports"),
        summary_http_host=os.getenv("SUMMARY_HTTP_HOST", "127.0.0.1"),
        summary_http_port=_int_env("SUMMARY_HTTP_PORT", 5055),
        summary_min_screenshots=_int_env("SUMMARY_MIN_SCREENSHOTS", 10),
        poll_interval_seconds=_int_env("POLL_INTERVAL_SECONDS", 60),
        report_time_local=os.getenv("REPORT_TIME_LOCAL", "18:00"),
        analysis_sample_stable_minutes=_int_env("ANALYSIS_SAMPLE_STABLE_MINUTES", 5),
        screenshot_lookback_hours=_int_env("SCREENSHOT_LOOKBACK_HOURS", 24),
        screenshot_batch_limit=_int_env("SCREENSHOT_BATCH_LIMIT", 200),
        max_image_width=_int_env("MAX_IMAGE_WIDTH", 1280),
        jpeg_quality=_int_env("JPEG_QUALITY", 70),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )
