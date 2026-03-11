"""
FastAPI router for the asynchronous CV analysis endpoints.

Endpoints
---------
POST /api/v1/analyses
    Accepts an S3 key + JD text, creates an AnalysisJob, fires a BackgroundTask,
    and returns 202 Accepted immediately.

GET /api/v1/analyses/{id}
    Polling endpoint: returns the current status of a job. When status ==
    'completed', the full AnalysisResult (score, gaps, red_flags, LaTeX, PDF URL)
    is included in the response.
"""

import logging
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field

from container import get_analyze_cv_use_case, get_job_repository, get_sqs_service
from core.domain.analysis_job import AnalysisJob, AnalysisResult, JobStatus, RedFlag
from core.ports.job_repository_port import IJobRepository
from core.use_cases.analyze_cv_use_case import AnalyzeCVUseCase
from domain.models import SkillGap
from infrastructure.adapters.sqs_service import SQSService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request / Response DTOs
# ---------------------------------------------------------------------------


class CreateAnalysisRequest(BaseModel):
    """Input for triggering an async CV analysis job."""

    s3_key: str = Field(
        ...,
        description=(
            "S3 object key of the raw CV PDF uploaded by the frontend "
            "(must be under the configured raw-pdf/ prefix)."
        ),
    )
    jd_text: str = Field(
        ...,
        min_length=50,
        description="Full text of the Job Description to match the CV against.",
    )


class CreateAnalysisResponse(BaseModel):
    """Returned immediately after a job is queued (HTTP 202)."""

    id: str = Field(..., description="Unique job ID — use this for polling.")
    status: JobStatus = Field(..., description="Initial job status ('queued').")


# ── Polling response schema (mirrors AnalysisResult for the API layer) ────────


class SkillGapDTO(BaseModel):
    skill: str
    importance: str


class RedFlagDTO(BaseModel):
    title: str
    description: str
    severity: str


class AnalysisResultDTO(BaseModel):
    matching_score: int
    missing_skills: list[SkillGapDTO]
    red_flags: list[RedFlagDTO]
    enhanced_cv_json: dict
    pdf_url: str


class AnalysisStatusResponse(BaseModel):
    """Polling response — result is populated only when status == 'completed'."""

    id: str
    status: JobStatus
    error: str | None = Field(
        default=None, description="Error message when status == 'failed'."
    )
    result: AnalysisResultDTO | None = Field(
        default=None, description="Populated when status == 'completed'."
    )


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1/analyses", tags=["Analyses"])


@router.post(
    "",
    response_model=CreateAnalysisResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger an async CV analysis and enhancement job",
    description=(
        "Creates a new analysis job and dispatches it as a FastAPI BackgroundTask. "
        "Returns 202 Accepted with a job ID immediately. "
        "Poll GET /api/v1/analyses/{id} to check progress."
    ),
)
async def create_analysis(
    payload: CreateAnalysisRequest,
    sqs_service: SQSService = Depends(get_sqs_service),
    job_repo: IJobRepository = Depends(get_job_repository),
) -> CreateAnalysisResponse:
    """Queue a new CV analysis job and immediately return the job ID."""

    job_id = uuid4().hex

    job = AnalysisJob(
        id=job_id,
        status=JobStatus.QUEUED,
        s3_key=payload.s3_key,
        jd_text=payload.jd_text,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await job_repo.save(job)

    sqs_service.send_job(job_id, payload.s3_key, payload.jd_text)

    logger.info("Analysis job '%s' queued for S3 key '%s'.", job_id, payload.s3_key)
    return CreateAnalysisResponse(id=job_id, status=JobStatus.QUEUED)


@router.get(
    "/{job_id}",
    response_model=AnalysisStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Poll the status of an analysis job",
    description=(
        "Returns the current status of the job. "
        "When status == 'completed', the full result (score, gaps, red_flags, "
        "enhanced_cv_json, pdf_url) is included. "
        "When status == 'failed', an error message is provided."
    ),
    responses={
        404: {"description": "No job found for the given ID."},
    },
)
async def get_analysis_status(
    job_id: str,
    job_repo: IJobRepository = Depends(get_job_repository),
) -> AnalysisStatusResponse:
    """Return the current state of a queued or finished analysis job."""

    job: AnalysisJob | None = await job_repo.get(job_id)

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No analysis job found with id '{job_id}'.",
        )

    result_dto: AnalysisResultDTO | None = None
    if job.status == JobStatus.COMPLETED and job.result is not None:
        r: AnalysisResult = job.result
        result_dto = AnalysisResultDTO(
            matching_score=r.matching_score,
            missing_skills=[
                SkillGapDTO(skill=g.skill, importance=g.importance)
                for g in r.missing_skills
            ],
            red_flags=[
                RedFlagDTO(
                    title=rf.title,
                    description=rf.description,
                    severity=rf.severity,
                )
                for rf in r.red_flags
            ],
            enhanced_cv_json=r.enhanced_cv_json.model_dump(mode="json"),
            pdf_url=r.pdf_url,
        )

    return AnalysisStatusResponse(
        id=job.id,
        status=job.status,
        error=job.error,
        result=result_dto,
    )
