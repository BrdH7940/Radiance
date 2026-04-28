"""
FastAPI router for the asynchronous CV analysis endpoints.

Endpoints
---------
POST /api/v1/analyses
    Accepts an S3 key + JD text, creates an AnalysisJob, enqueues it to SQS,
    and returns 202 Accepted immediately. Requires Bearer token + rate limit.

GET /api/v1/analyses/{id}
    Polling endpoint: returns the current status of a job. When status ==
    'completed', the full AnalysisResult (score, gaps, red_flags, JSON, PDF URL)
    is included in the response. Requires Bearer token.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from container import get_job_repository, get_project_repository, get_sqs_service
from core.domain.analysis_job import AnalysisJob, AnalysisResult, JobStatus
from core.domain.gallery_schemas import ClientAIResult, EnhanceFromGalleryRequest, ProjectItem
from core.ports.job_repository_port import IJobRepository
from core.ports.project_repository_port import IProjectRepository
from core.ports.sqs_port import ISQSService
from presentation.dependencies.auth import get_current_user_id
from presentation.dependencies.rate_limiter import check_analysis_rate_limit

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request / Response DTOs
# ---------------------------------------------------------------------------


class CreateAnalysisRequest(BaseModel):
    """Input for triggering an async CV analysis job via SQS."""

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
    job_title: Optional[str] = Field(
        default=None, description="Target job title (stored in history)."
    )
    company_name: Optional[str] = Field(
        default=None, description="Target company name (stored in history)."
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
        "Creates a new analysis job, persists it to DynamoDB, "
        "and enqueues a message to Amazon SQS for a separate worker Lambda "
        "to process. Returns 202 Accepted with a job ID immediately. "
        "Poll GET /api/v1/analyses/{id} to check progress."
    ),
)
async def create_analysis(
    payload: CreateAnalysisRequest,
    user_id: str = Depends(get_current_user_id),
    _rate_check: None = Depends(check_analysis_rate_limit),
    sqs_service: ISQSService = Depends(get_sqs_service),
    job_repo: IJobRepository = Depends(get_job_repository),
) -> CreateAnalysisResponse:
    """Queue a new CV analysis job and immediately return the job ID."""

    job_id = uuid4().hex

    job = AnalysisJob(
        id=job_id,
        user_id=user_id,
        status=JobStatus.QUEUED,
        s3_key=payload.s3_key,
        jd_text=payload.jd_text,
        job_title=payload.job_title,
        company_name=payload.company_name,
        created_at=datetime.now(tz=timezone.utc),
        updated_at=datetime.now(tz=timezone.utc),
    )
    await job_repo.save(job)

    sqs_service.send_job(job_id, payload.s3_key, payload.jd_text)

    logger.info(
        "Analysis job '%s' queued for user '%s', S3 key '%s'.",
        job_id,
        user_id,
        payload.s3_key,
    )
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
    user_id: str = Depends(get_current_user_id),
    job_repo: IJobRepository = Depends(get_job_repository),
) -> AnalysisStatusResponse:
    """Return the current state of a queued or finished analysis job."""

    job: AnalysisJob | None = await job_repo.get(job_id)

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No analysis job found with id '{job_id}'.",
        )

    # Ownership guard — return 404 (not 403) to avoid confirming job existence
    # to users who don't own it.
    if job.user_id and job.user_id != user_id:
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


@router.post(
    "/enhance-from-gallery",
    response_model=CreateAnalysisResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger Strategic Gallery-based CV enhancement",
    description=(
        "Receives client-side AI rankings, re-verifies all project IDs against Supabase "
        "(security validation), then enqueues a gallery enhancement job to SQS. "
        "Returns 202 Accepted with a job ID. Poll GET /api/v1/analyses/{id} for results."
    ),
    responses={
        403: {"description": "One or more project IDs are invalid or do not belong to the user."},
    },
)
async def enhance_from_gallery(
    payload: EnhanceFromGalleryRequest,
    user_id: str = Depends(get_current_user_id),
    _rate_check: None = Depends(check_analysis_rate_limit),
    sqs_service: ISQSService = Depends(get_sqs_service),
    job_repo: IJobRepository = Depends(get_job_repository),
    project_repo: IProjectRepository = Depends(get_project_repository),
) -> CreateAnalysisResponse:
    """Security-validate selected projects, then queue a strategic enhancement job."""

    selected_ids = [r.project_id for r in payload.client_results]

    # ── Security: re-fetch projects from Supabase — never trust the frontend payload ──
    try:
        verified_projects = await project_repo.verify_selected(user_id, selected_ids)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    # Build trusted project dicts for the SQS message (from source-of-truth only)
    trusted_project_dicts = [
        ProjectItem.from_project(p).model_dump() for p in verified_projects
    ]

    job_id = uuid4().hex
    job = AnalysisJob(
        id=job_id,
        user_id=user_id,
        status=JobStatus.QUEUED,
        s3_key="",
        jd_text=payload.jd_text,
        created_at=datetime.now(tz=timezone.utc),
        updated_at=datetime.now(tz=timezone.utc),
    )
    await job_repo.save(job)

    sqs_service.send_gallery_job(
        job_id=job_id,
        cv_text=payload.cv_text,
        jd_text=payload.jd_text,
        verified_projects=trusted_project_dicts,
    )

    logger.info(
        "Gallery enhancement job '%s' queued for user '%s' with %d verified projects.",
        job_id,
        user_id,
        len(verified_projects),
    )
    return CreateAnalysisResponse(id=job_id, status=JobStatus.QUEUED)
