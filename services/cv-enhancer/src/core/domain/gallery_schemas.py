"""
Gallery-flow data contracts for the Strategic Career Consulting pipeline.

These schemas are separate from cv_resume_schema.py to keep the legacy
enhance flow untouched.  They are used by:
  - The fallback/client-ai endpoint (server-side project ranking).
  - The enhance-from-gallery endpoint (security-validated gallery enhancement).
  - The LangGraph strategic pipeline (verified project injection).
"""

from typing import List, Optional

from pydantic import BaseModel, Field


class ProjectItem(BaseModel):
    """
    Adapter view of a Project Gallery entry for AI consumption.

    Maps the Supabase `project_gallery` row to the shape expected by the
    WebWorker and Gemini fallback — omitting internal fields (user_id,
    is_active, created_at) and renaming `technologies` → `tech_stack` to
    match the frontend Transformers.js worker protocol.
    """

    id: str = Field(description="Project UUID as a string.")
    title: str = Field(description="Project title.")
    description: Optional[str] = Field(
        default=None, description="Brief description of the project."
    )
    tech_stack: List[str] = Field(
        default_factory=list,
        description="Technologies used (mapped from `technologies` column).",
    )

    @classmethod
    def from_project(cls, project: object) -> "ProjectItem":
        """Construct from a core.domain.project.Project instance."""
        return cls(
            id=str(project.id),  # type: ignore[attr-defined]
            title=project.title,  # type: ignore[attr-defined]
            description=project.description,  # type: ignore[attr-defined]
            tech_stack=project.technologies,  # type: ignore[attr-defined]
        )


class ClientAIResult(BaseModel):
    """
    A single project ranking result produced by the client-side WebWorker
    (or by the Gemini fallback endpoint).
    """

    project_id: str = Field(description="UUID of the ranked project.")
    fit_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Cosine similarity score in [0, 1]. 1.0 = perfect semantic match.",
    )
    client_reasoning: str = Field(
        description="One-sentence explanation of why this project fits the JD."
    )


class FallbackClientAIRequest(BaseModel):
    """
    Input for POST /api/v1/fallback/client-ai.

    Sent by the frontend when the WebWorker fails to load (OOM, no WebGPU).
    The backend performs the same ranking/reasoning task via Gemini 2.5 Flash.
    """

    jd_text: str = Field(description="Full job description text.")
    project_gallery: List[ProjectItem] = Field(
        description="The user's complete project gallery to rank."
    )


class EnhanceFromGalleryRequest(BaseModel):
    """
    Input for POST /api/v1/analyses/enhance-from-gallery.

    The `client_results` list comes from the WebWorker (or fallback API).
    The backend MUST re-verify all project_ids against Supabase before
    passing any data to the LLM — never trust the frontend payload directly.
    """

    cv_text: str = Field(description="Raw CV text extracted from the uploaded PDF.")
    jd_text: str = Field(description="Full job description text.")
    client_results: List[ClientAIResult] = Field(
        description=(
            "Projects selected by the user after reviewing AI suggestions. "
            "Only project_ids are trusted here — all other fields are re-fetched "
            "from Supabase by verify_selected() before LLM use."
        )
    )
