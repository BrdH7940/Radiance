"""
SkillGap — core domain model for missing skill analysis.
"""

from typing import Literal

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
