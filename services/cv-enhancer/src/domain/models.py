"""
Domain models for the CV Enhancer service.
"""

from typing import List, Literal
from pydantic import BaseModel, Field


class SkillGap(BaseModel):
    """Skill or qualification present in the JD but absent/weak in the CV."""

    skill: str = Field(
        description="The concrete name of the missing skill, technology, or qualification."
    )
    importance: Literal["critical", "recommended", "nice-to-have"] = Field(
        description=(
            "How critical this gap is for the role: "
            "'critical' = deal-breaker, "
            "'recommended' = strongly preferred, "
            "'nice-to-have' = bonus."
        )
    )


class EnhancedCV(BaseModel):
    """AI-rewritten CV content in Markdown format."""

    content: str = Field(
        description=(
            "The complete, enhanced CV in Markdown. "
            "Experience bullet points are rewritten using the STAR method "
            "(Situation, Task, Action, Result) with quantifiable metrics."
        )
    )


class AnalysisReport(BaseModel):
    """The complete CV analysis and enhancement report."""

    matching_score: int = Field(
        ge=0,
        le=100,
        description=(
            "A score from 0 to 100 reflecting how well the CV matches the Job Description. "
            "Weights: technical skills (40%), experience level (30%), "
            "domain fit (20%), education/certs (10%)."
        ),
    )
    missing_skills: List[SkillGap] = Field(
        description="Concrete skills/technologies present in the JD but missing or weak in the CV."
    )
    enhanced_cv: EnhancedCV = Field(
        description="The AI-rewritten CV tailored to match the Job Description."
    )
