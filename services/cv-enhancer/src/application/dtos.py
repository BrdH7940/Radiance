"""
Data Transfer Objects for the CV Enhancer.
"""

from typing import List
from pydantic import BaseModel, Field


class EnhanceCVRequestDTO(BaseModel):
    """Input DTO for the CV enhancement use case."""

    cv_file_path: str = Field(
        description=(
            "Absolute or relative local filesystem path to the candidate's CV (PDF). "
            "In production this represents a file downloaded from S3."
        )
    )
    jd_text: str = Field(
        min_length=50,
        description="The complete text of the Job Description to match the CV against.",
    )


class SkillGapDTO(BaseModel):
    """DTO for a single identified skill gap."""

    skill: str = Field(description="Name of the missing skill or qualification.")
    importance: str = Field(
        description="Importance level: 'critical', 'recommended', or 'nice-to-have'."
    )


class EnhanceCVResponseDTO(BaseModel):
    """Output DTO returned by the EnhanceCVUseCase and serialised by the API."""

    matching_score: int = Field(
        ge=0,
        le=100,
        description="A 0–100 score indicating how well the CV matches the JD.",
    )
    missing_skills: List[SkillGapDTO] = Field(
        description="Skills present in the JD but missing or insufficient in the CV."
    )
    enhanced_cv_content: str = Field(
        description=(
            "The complete rewritten CV in Markdown format, "
            "with experience sections enhanced using the STAR method."
        )
    )
