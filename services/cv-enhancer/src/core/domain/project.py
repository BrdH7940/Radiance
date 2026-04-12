"""
Domain models for the Project Gallery feature.

Users can store their technical projects here for AI-assisted matching
against job descriptions during the CV enhancement pipeline.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CreateProjectRequest(BaseModel):
    """Input payload for creating a new project in the gallery."""

    title: str = Field(..., min_length=1, max_length=255, description="Project title.")
    description: Optional[str] = Field(
        default=None, description="Brief description of the project."
    )
    technologies: List[str] = Field(
        default_factory=list,
        description="List of technologies / tools used (e.g. ['Python', 'FastAPI']).",
    )


class Project(BaseModel):
    """A project entry as stored in and returned from the repository."""

    id: UUID = Field(description="Auto-generated UUID primary key.")
    user_id: UUID = Field(description="Owner's Supabase auth user UUID.")
    title: str
    description: Optional[str] = None
    technologies: List[str] = Field(default_factory=list)
    is_active: bool = Field(default=True)
    created_at: datetime
