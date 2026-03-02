"""
Domain models for asynchronous CV analysis jobs.

These are the canonical data structures for the async CV analysis pipeline.
"""

from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from domain.models import SkillGap  # Reuse the validated SkillGap from core domain.


class JobStatus(str, Enum):
    """Lifecycle states of a background analysis job."""

    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class RedFlag(BaseModel):
    """A structural or content issue in the CV that may harm the candidate's application."""

    title: str = Field(
        description="Short, scannable label for the issue (e.g. 'Employment Gap 2021-2022')."
    )
    description: str = Field(
        description="A clear, recruiter-perspective explanation of why this is a concern."
    )
    severity: Literal["low", "medium", "high"] = Field(
        description=(
            "'high' = likely causes an instant rejection, "
            "'medium' = notable concern that weakens the application, "
            "'low' = minor polish issue."
        )
    )


class AnalysisResult(BaseModel):
    """The complete, persisted outcome of a successful analysis job.

    Populated once the background pipeline finishes successfully and stored
    inside the corresponding AnalysisJob.
    """

    matching_score: int = Field(ge=0, le=100, description="ATS fit score from 0 to 100.")
    missing_skills: List[SkillGap] = Field(
        description="Skills present in the JD that are absent or weak in the CV."
    )
    red_flags: List[RedFlag] = Field(
        description="Structural or content issues a recruiter would flag immediately."
    )
    latex_code: str = Field(
        description="Full, compilable LaTeX source of the enhanced CV document."
    )
    pdf_url: str = Field(
        description="Presigned S3 URL for the compiled enhanced-CV PDF."
    )


class AnalysisJob(BaseModel):
    """The complete state of one async CV analysis request.

    Stored in IJobRepository. Status transitions:
        QUEUED → PROCESSING → COMPLETED
                           ↘ FAILED
    """

    id: str = Field(description="Unique job identifier (UUID hex).")
    status: JobStatus = Field(default=JobStatus.QUEUED)
    s3_key: str = Field(
        description="S3 object key for the raw CV PDF in the raw-pdf/ prefix."
    )
    jd_text: str = Field(description="Job description text provided by the user.")
    created_at: datetime = Field(description="UTC timestamp when the job was created.")
    updated_at: datetime = Field(description="UTC timestamp of the last status update.")
    result: Optional[AnalysisResult] = Field(
        default=None,
        description="Populated once status == COMPLETED.",
    )
    error: Optional[str] = Field(
        default=None,
        description="Error message populated when status == FAILED.",
    )
