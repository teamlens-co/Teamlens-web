import json

import pytest

from screenshot_analyzer import KimiScreenshotAnalyzer, ScreenshotAnalysis, extract_json_object


def test_extract_json_object_accepts_plain_json():
    parsed = extract_json_object('{"application_name":"VS Code","category":"Work"}')
    assert parsed["application_name"] == "VS Code"


def test_extract_json_object_accepts_markdown_fence():
    parsed = extract_json_object("""```json
{"application_name":"Chrome","focus_level":"Medium"}
```""")
    assert parsed["application_name"] == "Chrome"


def test_extract_json_object_accepts_extra_text():
    parsed = extract_json_object('Here is the result: {"task":"coding Python","confidence":0.9} done')
    assert parsed["task"] == "coding Python"


def test_extract_json_object_rejects_malformed_text():
    with pytest.raises(json.JSONDecodeError):
        extract_json_object("not json")


def test_analysis_validation_normalizes_invalid_values():
    analysis = ScreenshotAnalysis.model_validate(
        {
            "application_name": "Browser",
            "task": "one two three four five six seven eight nine",
            "category": "Bad",
            "focus_level": "Invalid",
            "visible_text": "x" * 350,
            "confidence": 0.4,
            "reasoning_short": " ".join(str(i) for i in range(30)),
        }
    )
    assert analysis.category == "Other"
    assert analysis.focus_level == "Medium"
    assert len(analysis.task.split()) == 8
    assert len(analysis.visible_text) == 300
    assert len(analysis.reasoning_short.split()) == 20


def test_workers_ai_response_wrapper_is_supported():
    analyzer = KimiScreenshotAnalyzer(
        api_mode="workers-ai",
        api_base_url="https://gateway.example/workers-ai/@cf/moonshotai/kimi-k2.6",
        gateway_id="",
        api_key="test",
        model="@cf/moonshotai/kimi-k2.6",
        timeout_seconds=10,
        max_retries=1,
        max_tokens=1200,
        max_image_width=1280,
        jpeg_quality=70,
    )
    content = analyzer._extract_message_content(
        {
            "success": True,
            "result": {
                "choices": [
                    {
                        "message": {
                            "content": '{"status":"ok"}',
                            "reasoning_content": "thinking",
                        }
                    }
                ]
            },
        }
    )
    assert content == '{"status":"ok"}'
