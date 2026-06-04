# Screenshot AI Sidecar

This service passively analyzes TeamLens screenshots with a Kimi 2.6 multimodal model exposed through an OpenAI-compatible Cloudflare proxy. It reads screenshot metadata from TeamLens Postgres, reads image files from the backend upload directory, and stores AI analysis plus daily reports in local SQLite.

## Files

- `main.py`: polling worker and 6 PM daily report scheduler.
- `screenshot_analyzer.py`: Kimi API integration, image compression, prompt, JSON parsing, retries.
- `database_manager.py`: SQLite schema and persistence helpers.
- `daily_report_generator.py`: category totals, top tasks, focus breakdown, productivity score, Markdown reports.
- `config.py`: environment-based configuration.

## Setup

```bash
cd screenshot-ai
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env`:

```env
KIMI_API_BASE_URL=https://your-cloudflare-proxy.example.com/v1
KIMI_API_KEY=replace-me
KIMI_MODEL=kimi-2.6
DATABASE_URL=postgres://teamlens:teamlens@localhost:5433/teamlens
UPLOAD_DIR=../uploads
```

If the Go backend is running in Docker and DB paths look like `/app/uploads/...`, keep:

```env
DOCKER_UPLOAD_CONTAINER=teamlens-api-go
```

The sidecar will copy missing Docker-volume screenshots into `data/docker-screenshots/` before analysis.

For large desktop screenshots, keep `MAX_IMAGE_WIDTH=896`, `JPEG_QUALITY=60`, and `KIMI_TIMEOUT_SECONDS=120` unless you need more visual detail.

For Cloudflare Workers AI Gateway with screenshot/vision input, use Cloudflare's OpenAI-compatible Workers AI route:

```env
KIMI_API_MODE=openai
KIMI_API_BASE_URL=https://api.cloudflare.com/client/v4/accounts/<account-id>/ai/v1
KIMI_GATEWAY_ID=<gateway-name>
KIMI_API_KEY=<your-cloudflare-token>
KIMI_MODEL=@cf/moonshotai/kimi-k2.6
KIMI_MAX_TOKENS=4096
```

The direct Gateway model URL also works for text-only Workers AI calls, but the sidecar uses the OpenAI-compatible route because it supports the screenshot `image_url` payload reliably.

For another OpenAI-compatible proxy, use:

```env
KIMI_API_MODE=openai
KIMI_API_BASE_URL=https://your-proxy.example.com/v1
KIMI_GATEWAY_ID=
KIMI_MODEL=kimi-2.6
```

Start TeamLens Postgres/backend, then run:

```bash
python main.py
```

The worker will:

- Poll recent `screenshots` rows every `POLL_INTERVAL_SECONDS`.
- Skip already processed screenshots.
- Skip exact duplicate image hashes.
- Sample stable app/window screenshots using `ANALYSIS_SAMPLE_STABLE_MINUTES`.
- Generate reports daily at `REPORT_TIME_LOCAL`, default `18:00`.

Reports are stored in SQLite and written as Markdown under `REPORT_OUTPUT_DIR/YYYY-MM-DD/<user-id>.md`.

## Kimi Prompt

The exact per-screenshot prompt is stored as `ANALYSIS_PROMPT` in `screenshot_analyzer.py`. It requires strict JSON output, redacts sensitive text, and limits extracted visible text for privacy and cost control.

## Checks

```bash
python -m compileall .
pytest
```
