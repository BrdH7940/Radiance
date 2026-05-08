"""
FastAPI application entry point for the CV Enhancer microservice.
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from config import cors_allowed_origins_from_env

from presentation.analyses import router as analyses_router
from presentation.editor import router as editor_router
from presentation.fallback import router as fallback_router
from presentation.history import router as history_router
from presentation.projects import router as projects_router
from presentation.resumes import router as resumes_router

# Best-effort observability bootstrap (never breaks local dev / CI).
try:
    from observability.langsmith import init_langsmith
    from observability.xray import init_xray, instrument_fastapi

    init_langsmith()
    init_xray()
except Exception:
    # Observability must never prevent the app from importing.
    pass

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — keep startup light for Lambda HTTP (CORS OPTIONS runs first)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Log startup/shutdown only.

    Do not eagerly warm container singletons here: the first HTTP request after a
    cold start is often a CORS OPTIONS preflight. Initialising WeasyPrint, S3,
    DynamoDB, Supabase, etc. during startup can raise and turn that preflight
    into a 500. Real routes already lazy-init via Depends(get_*).
    """
    logger.info("Radiance CV Enhancer service starting up…")
    yield
    logger.info("Radiance CV Enhancer service shutting down.")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Radiance — CV Enhancer",
    description=(
        "AI-powered CV enhancement microservice for the Radiance Career Assistant. "
        "Parses a candidate's CV (PDF), compares it to a Job Description, "
        "calculates an ATS matching score, identifies skill gaps and red flags, "
        "and rewrites the experience section using the STAR method — "
        "powered by Gemini 1.5 Flash. "
        "Upload CV to S3, trigger analysis, then poll for results (async workflow)."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # Origins come from the CORS_ALLOWED_ORIGINS env var (comma-separated).
    # Wildcards are incompatible with allow_credentials=True per the CORS spec —
    # browsers reject credentialed requests to wildcard origins.
    # Read env only here — do not call get_settings() at import time (breaks pytest/CI).
    allow_origins=cors_allowed_origins_from_env(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach X-Ray middleware (best-effort).
try:
    instrument_fastapi(app)
except Exception:
    pass

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(resumes_router)   # POST   /api/v1/resumes/upload-urls
app.include_router(analyses_router)  # POST   /api/v1/analyses  |  POST /api/v1/analyses/enhance-from-gallery  |  GET /api/v1/analyses/{id}
app.include_router(fallback_router)  # POST   /api/v1/fallback/client-ai
app.include_router(editor_router)    # POST   /api/v1/editor/renders
app.include_router(projects_router)  # CRUD   /api/v1/projects
app.include_router(history_router)   # GET    /api/v1/history  |  /history/{id}


# ---------------------------------------------------------------------------
# Health probe
# ---------------------------------------------------------------------------


@app.get("/health", tags=["Health"], summary="Liveness probe")
async def health_check() -> dict:
    return {"status": "healthy", "service": "cv-enhancer", "version": "2.0.0"}


# ---------------------------------------------------------------------------
# AWS Lambda Integration
# ---------------------------------------------------------------------------

# Mangum handler dành cho HTTP requests.
# lifespan="on" giúp Mangum gọi hàm lifespan của FastAPI khi Lambda khởi động.
mangum_handler = Mangum(app, lifespan="on")


async def _process_legacy_record(body: dict, use_case) -> None:
    """Run the legacy S3-based CV enhancement pipeline."""
    job_id = body.get("job_id")
    s3_key = body.get("s3_key")
    jd_text = body.get("jd_text")
    logger.info("Worker processing legacy Job ID: %s", job_id)

    # Best-effort X-Ray annotations — failure must never prevent or duplicate execute().
    try:
        from observability.xray import annotate_kv
        annotate_kv("event_source", "sqs")
        annotate_kv("job_id", job_id)
        annotate_kv("s3_key", s3_key)
    except Exception:
        pass

    await use_case.execute(job_id=job_id, s3_key=s3_key, jd_text=jd_text)


async def _process_gallery_record(body: dict) -> None:
    """Run the Strategic Gallery enhancement pipeline."""
    from container import get_job_repository, get_llm_service
    from core.domain.gallery_schemas import ProjectItem
    from datetime import datetime, timezone
    from core.domain.analysis_job import AnalysisResult, JobStatus

    job_id = body.get("job_id")
    cv_text = body.get("cv_text", "")
    jd_text = body.get("jd_text", "")
    raw_projects = body.get("verified_projects", [])

    logger.info("Worker processing gallery Job ID: %s (%d projects)", job_id, len(raw_projects))

    job_repo = get_job_repository()
    llm_service = get_llm_service()

    projects = [ProjectItem(**p) for p in raw_projects]

    job = await job_repo.get(job_id)
    if job is None:
        logger.error("Gallery job '%s' not found in job store — skipping.", job_id)
        return

    try:
        enhanced_cv = await llm_service.enhance_from_gallery(
            cv_text=cv_text,
            jd_text=jd_text,
            verified_projects=projects,
        )

        # Gallery jobs do not produce a matching_score/missing_skills/red_flags
        # in the legacy sense; use neutral defaults so the polling DTO is valid.
        result = AnalysisResult(
            matching_score=0,
            missing_skills=[],
            red_flags=[],
            enhanced_cv_json=enhanced_cv,
            pdf_url="",
        )
        job.status = JobStatus.COMPLETED
        job.result = result
        job.updated_at = datetime.now(tz=timezone.utc)
    except Exception as exc:
        logger.error("Gallery job '%s' failed: %s", job_id, exc, exc_info=True)
        job.status = JobStatus.FAILED
        job.error = str(exc)
        job.updated_at = datetime.now(tz=timezone.utc)

    await job_repo.update(job)


async def process_sqs_records(event: dict) -> None:
    """Dispatch SQS records to the appropriate pipeline based on message type."""
    from container import get_analyze_cv_use_case

    use_case = get_analyze_cv_use_case()

    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            msg_type = body.get("type", "legacy_enhance")

            if msg_type == "gallery_enhance":
                await _process_gallery_record(body)
            else:
                await _process_legacy_record(body, use_case)

            logger.info("Successfully processed SQS record (type: %s).", msg_type)
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Error processing SQS record: %s", str(exc), exc_info=True
            )
            # Re-raise so SQS retries according to the queue's redrive policy.
            raise


def handler(event, context):
    """
    AWS Lambda Entry Point.
    Phân loại event để điều hướng sang FastAPI (HTTP) hoặc SQS Processor.
    """
    # Nếu event chứa key "Records", đó là sự kiện từ SQS.
    if isinstance(event, dict) and "Records" in event:
        return asyncio.run(process_sqs_records(event))

    # Ngược lại, đó là HTTP request (API Gateway hoặc Lambda Function URL).
    return mangum_handler(event, context)


# ---------------------------------------------------------------------------
# Local development entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    import uvicorn  # Local dev only; Lambda handler does not need uvicorn.
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
