from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import re
import time
from pathlib import Path
from typing import Any

import requests
from PIL import Image
from pydantic import BaseModel, Field, ValidationError, field_validator


ANALYSIS_PROMPT = """You are analyzing an employee productivity screenshot.

Return ONLY valid JSON. No markdown. No extra text.

Analyze the screenshot and infer:
- application_name: the main visible app, such as VS Code, Chrome, Word, Excel, Slack, Terminal, Unknown
- task: concise human-readable task, max 8 words
- category: one of Work, Learning, Communication, Leisure, Other
- focus_level: one of Deep Work, Medium, Distraction
- visible_text: only important readable text, max 300 characters
- confidence: number from 0 to 1
- reasoning_short: max 20 words

Rules:
- Do not identify private people.
- Do not transcribe secrets, passwords, tokens, financial numbers, or sensitive personal data. Replace such content with [REDACTED].
- If the screen is unclear, use Unknown and lower confidence.
- Classify coding, document writing, design, analytics, admin tools, and project management as Work.
- Classify tutorials, docs, courses, and technical articles as Learning.
- Classify email, chat, meetings, and messaging as Communication.
- Classify social media, entertainment, shopping, games, and non-work video as Leisure.
- Use Deep Work for focused creation/problem-solving, Medium for browsing/admin/mixed work, Distraction for leisure or unrelated activity.

Expected JSON shape:
{
  "application_name": "VS Code",
  "task": "coding Python API",
  "category": "Work",
  "focus_level": "Deep Work",
  "visible_text": "main important text only",
  "confidence": 0.86,
  "reasoning_short": "Editor with Python backend files visible"
}
"""

VALID_CATEGORIES = {"Work", "Learning", "Communication", "Leisure", "Other"}
VALID_FOCUS_LEVELS = {"Deep Work", "Medium", "Distraction"}


class ScreenshotAnalysis(BaseModel):
    application_name: str = "Unknown"
    task: str = "Unknown"
    category: str = "Other"
    focus_level: str = "Medium"
    visible_text: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reasoning_short: str = ""

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        return value if value in VALID_CATEGORIES else "Other"

    @field_validator("focus_level")
    @classmethod
    def validate_focus_level(cls, value: str) -> str:
        return value if value in VALID_FOCUS_LEVELS else "Medium"

    @field_validator("task")
    @classmethod
    def trim_task(cls, value: str) -> str:
        words = value.strip().split()
        return " ".join(words[:8]) if words else "Unknown"

    @field_validator("visible_text")
    @classmethod
    def trim_visible_text(cls, value: str) -> str:
        return value.strip()[:300]

    @field_validator("reasoning_short")
    @classmethod
    def trim_reasoning(cls, value: str) -> str:
        words = value.strip().split()
        return " ".join(words[:20])


def compute_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_image_data_url(path: Path, max_width: int, jpeg_quality: int) -> str:
    with Image.open(path) as image:
        image = image.convert("RGB")
        if image.width > max_width:
            ratio = max_width / float(image.width)
            new_height = max(1, int(image.height * ratio))
            image = image.resize((max_width, new_height), Image.LANCZOS)

        output = io.BytesIO()
        image.save(output, format="JPEG", quality=jpeg_quality, optimize=True)
        encoded = base64.b64encode(output.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"


def extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(cleaned[start : end + 1])


class KimiScreenshotAnalyzer:
    def __init__(
        self,
        api_mode: str,
        api_base_url: str,
        gateway_id: str,
        api_key: str,
        model: str,
        timeout_seconds: int,
        max_retries: int,
        max_tokens: int,
        max_image_width: int,
        jpeg_quality: int,
    ) -> None:
        self.api_mode = api_mode
        self.api_base_url = api_base_url.rstrip("/")
        self.gateway_id = gateway_id
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.max_retries = max(1, max_retries)
        self.max_tokens = max_tokens
        self.max_image_width = max_image_width
        self.jpeg_quality = jpeg_quality
        self.session = requests.Session()

    def analyze(self, image_path: Path) -> ScreenshotAnalysis:
        if not self.api_key:
            raise RuntimeError("KIMI_API_KEY is required")

        data_url = prepare_image_data_url(image_path, self.max_image_width, self.jpeg_quality)
        url, payload = self._build_request(data_url)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self.gateway_id:
            headers["cf-aig-gateway-id"] = self.gateway_id

        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.session.post(
                    url,
                    headers=headers,
                    json=payload,
                    timeout=self.timeout_seconds,
                )
                response.raise_for_status()
                body = response.json()
                content = self._extract_message_content(body)
                parsed = extract_json_object(content)
                return ScreenshotAnalysis.model_validate(parsed)
            except (requests.RequestException, KeyError, IndexError, json.JSONDecodeError, ValidationError) as error:
                last_error = error
                if attempt >= self.max_retries:
                    break
                sleep_seconds = min(2**attempt, 10)
                logging.warning("Kimi analysis failed; retrying", extra={"attempt": attempt, "sleep_seconds": sleep_seconds})
                time.sleep(sleep_seconds)

        raise RuntimeError(f"Kimi analysis failed after {self.max_retries} attempts: {last_error}")

    def _build_request(self, data_url: str) -> tuple[str, dict[str, Any]]:
        content = [
            {"type": "text", "text": ANALYSIS_PROMPT},
            {"type": "image_url", "image_url": {"url": data_url}},
        ]

        if self.api_mode == "openai":
            return (
                f"{self.api_base_url}/chat/completions",
                {
                    "model": self.model,
                    "temperature": 0,
                    "max_tokens": self.max_tokens,
                    "thinking": {"type": "disabled"},
                    "chat_template_kwargs": {"thinking": False},
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "user", "content": content}],
                },
            )

        return (
            self.api_base_url,
            {
                "messages": [{"role": "user", "content": content}],
                "temperature": 0,
                "max_tokens": self.max_tokens,
                "thinking": {"type": "disabled"},
                "chat_template_kwargs": {"thinking": False},
            },
        )

    def _extract_message_content(self, body: dict[str, Any]) -> str:
        if self.api_mode == "workers-ai":
            if not body.get("success", True):
                raise RuntimeError(f"Workers AI error: {body.get('errors') or body.get('messages')}")
            body = body.get("result", body)

        content = body["choices"][0]["message"].get("content")
        if not content:
            raise RuntimeError("Model response did not include message.content; increase KIMI_MAX_TOKENS")
        return content
