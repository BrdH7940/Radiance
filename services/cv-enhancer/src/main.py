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
app.include_router(analyses_router)  # POST   /api/v1/analyses  |  GET /api/v1/analyses/{id}
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


async def process_sqs_records(event: dict) -> None:
    """Xử lý danh sách các tin nhắn từ SQS."""
    from container import get_analyze_cv_use_case

    use_case = get_analyze_cv_use_case()

    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            job_id = body.get("job_id")
            s3_key = body.get("s3_key")
            jd_text = body.get("jd_text")

            logger.info("Worker processing Job ID: %s", job_id)

            # Best-effort X-Ray subsegment per record/job.
            try:
                from observability.xray import annotate_kv, with_subsegment

                annotate_kv("event_source", "sqs")
                annotate_kv("job_id", job_id)
                annotate_kv("s3_key", s3_key)
                with with_subsegment("sqs_record"):
                    await use_case.execute(
                        job_id=job_id,
                        s3_key=s3_key,
                        jd_text=jd_text,
                    )
            except Exception:
                await use_case.execute(
                    job_id=job_id,
                    s3_key=s3_key,
                    jd_text=jd_text,
                )

            logger.info("Successfully processed Job ID: %s", job_id)
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Error processing SQS record: %s", str(exc), exc_info=True
            )
            # Ném exception để SQS hiểu là fail và tự retry theo policy.
            raise


def handler(event, context):
    """
    AWS Lambda Entry Point.
    Phân loại event để điều hướng sang FastAPI (HTTP) hoặc SQS Processor.
    """
    # Nếu event chứa key "Records", đó là sự kiện từ SQS.
    if isinstance(event, dict) and "Records" in event:
        # Vì Lambda handler là đồng bộ, ta dùng loop để chạy async logic.
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(process_sqs_records(event))

    # Ngược lại, đó là HTTP request (API Gateway hoặc Lambda Function URL).
    return mangum_handler(event, context)


# ---------------------------------------------------------------------------
# Local development entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    import uvicorn  # Local dev only; Lambda handler does not need uvicorn.
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
