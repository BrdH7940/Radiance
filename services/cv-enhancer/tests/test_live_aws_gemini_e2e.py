"""
Live E2E test (opt-in) for AWS + Gemini flow.

This test is skipped by default.
Set RUN_LIVE_AWS_GEMINI_TESTS=1 and required env vars to run it.
"""

import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import boto3
import pytest


_DEBUG_LOG_PATH = Path(
    os.getenv("LIVE_TEST_DEBUG_LOG_PATH", ".cursor/debug-e72581.log")
)
_DEBUG_SESSION_ID = "e72581"
_DEBUG_RUN_ID = f"live-e2e-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}"


def _debug_log(hypothesis_id: str, location: str, message: str, data: dict) -> None:
    payload = {
        "sessionId": _DEBUG_SESSION_ID,
        "runId": _DEBUG_RUN_ID,
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    _DEBUG_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _DEBUG_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=True) + "\n")


def _http_json(method: str, url: str, payload: dict | None = None) -> tuple[int, dict]:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    # region agent log
    _debug_log(
        "H4",
        "tests/test_live_aws_gemini_e2e.py:_http_json:before_urlopen",
        "Preparing HTTP request",
        {"method": method, "url": url, "has_payload": payload is not None},
    )
    # endregion
    req = urllib.request.Request(url=url, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:  # nosec B310
            body = resp.read().decode("utf-8")
            # region agent log
            _debug_log(
                "H4",
                "tests/test_live_aws_gemini_e2e.py:_http_json:after_urlopen",
                "HTTP response received",
                {"status": resp.status, "url": url},
            )
            # endregion
            return resp.status, json.loads(body)
    except Exception as exc:
        # region agent log
        _debug_log(
            "H5",
            "tests/test_live_aws_gemini_e2e.py:_http_json:exception",
            "HTTP request failed",
            {
                "url": url,
                "exception_type": type(exc).__name__,
                "exception": str(exc),
                "errno": getattr(getattr(exc, "reason", None), "errno", None),
            },
        )
        # endregion
        raise


@pytest.mark.skipif(
    os.getenv("RUN_LIVE_AWS_GEMINI_TESTS") != "1",
    reason="Set RUN_LIVE_AWS_GEMINI_TESTS=1 to run live AWS/Gemini E2E test.",
)
def test_live_flow_upload_analyze_and_poll_completion():
    base_url = os.environ["LIVE_TEST_BASE_URL"]  # ex: http://localhost:8000
    pdf_path = Path(os.environ["LIVE_TEST_CV_PDF_PATH"])
    bucket = os.environ["AWS_S3_BUCKET"]
    region = os.environ["AWS_REGION"]
    table_name = os.environ["DYNAMODB_ANALYSIS_TABLE_NAME"]
    parsed = urllib.parse.urlparse(base_url)

    # region agent log
    _debug_log(
        "H1",
        "tests/test_live_aws_gemini_e2e.py:test_live_flow_upload_analyze_and_poll_completion:base_config",
        "Loaded live test runtime config",
        {
            "base_url": base_url,
            "host": parsed.hostname,
            "port": parsed.port or (443 if parsed.scheme == "https" else 80),
            "scheme": parsed.scheme,
            "pdf_exists": pdf_path.exists(),
        },
    )
    # endregion

    # region agent log
    dns_ok = False
    dns_result_count = 0
    dns_error = None
    try:
        resolved = socket.getaddrinfo(parsed.hostname or "", parsed.port or 80, type=socket.SOCK_STREAM)
        dns_ok = True
        dns_result_count = len(resolved)
    except Exception as exc:
        dns_error = str(exc)
    _debug_log(
        "H2",
        "tests/test_live_aws_gemini_e2e.py:test_live_flow_upload_analyze_and_poll_completion:dns_check",
        "DNS resolution check",
        {
            "host": parsed.hostname,
            "dns_ok": dns_ok,
            "dns_result_count": dns_result_count,
            "dns_error": dns_error,
        },
    )
    # endregion

    # region agent log
    tcp_connect_code = None
    tcp_error = None
    try:
        host = parsed.hostname or ""
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(3)
            tcp_connect_code = s.connect_ex((host, port))
    except Exception as exc:
        tcp_error = str(exc)
    _debug_log(
        "H3",
        "tests/test_live_aws_gemini_e2e.py:test_live_flow_upload_analyze_and_poll_completion:tcp_check",
        "TCP connectivity check",
        {
            "host": parsed.hostname,
            "port": parsed.port or (443 if parsed.scheme == "https" else 80),
            "connect_ex_code": tcp_connect_code,
            "tcp_error": tcp_error,
        },
    )
    # endregion

    assert pdf_path.exists(), f"Missing PDF file: {pdf_path}"

    # Step 1: request presigned upload URL
    status, upload_resp = _http_json(
        "POST",
        f"{base_url}/api/v1/resumes/upload-urls",
        {"file_name": pdf_path.name, "content_type": "application/pdf"},
    )
    assert status == 201
    upload_url = upload_resp["upload_url"]
    s3_key = upload_resp["s3_key"]

    # Step 2: upload PDF to S3 via presigned URL
    with pdf_path.open("rb") as f:
        content = f.read()
    req = urllib.request.Request(
        url=upload_url,
        method="PUT",
        data=content,
        headers={"Content-Type": "application/pdf"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:  # nosec B310
        assert resp.status in (200, 201)

    # Step 3: verify raw file exists in S3
    s3 = boto3.client("s3", region_name=region)
    s3.head_object(Bucket=bucket, Key=s3_key)

    # Step 4: trigger analysis
    status, create_resp = _http_json(
        "POST",
        f"{base_url}/api/v1/analyses",
        {
            "s3_key": s3_key,
            "jd_text": "Senior Python backend engineer with AWS, FastAPI, DynamoDB, SQS, Lambda and CI/CD experience.",
        },
    )
    assert status == 202
    job_id = create_resp["id"]

    # Step 5: poll until completed/failed
    deadline = time.time() + 300
    last_payload = None
    while time.time() < deadline:
        _, payload = _http_json("GET", f"{base_url}/api/v1/analyses/{job_id}")
        last_payload = payload
        if payload["status"] in ("completed", "failed"):
            break
        time.sleep(5)

    assert last_payload is not None
    assert last_payload["status"] == "completed", f"Job failed: {last_payload}"
    assert last_payload["result"]["matching_score"] >= 0
    assert last_payload["result"]["pdf_url"]

    # Step 6: verify job persisted in DynamoDB
    dynamo = boto3.resource("dynamodb", region_name=region).Table(table_name)
    item = dynamo.get_item(Key={"id": job_id}).get("Item")
    assert item is not None
    assert item["status"] == "completed"
