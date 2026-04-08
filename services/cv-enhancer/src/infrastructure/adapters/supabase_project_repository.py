"""
SupabaseProjectRepository — implements IProjectRepository via Supabase.

Uses the service_role Supabase client and applies explicit user_id filtering
on every query to enforce data ownership (service_role bypasses RLS).
"""

import logging
from typing import List
from uuid import UUID

from supabase import Client

from core.domain.project import CreateProjectRequest, Project
from core.ports.project_repository_port import IProjectRepository

logger = logging.getLogger(__name__)

_TABLE = "project_gallery"


class SupabaseProjectRepository(IProjectRepository):
    """Supabase-backed repository for the Project Gallery."""

    def __init__(self, client: Client) -> None:
        self._client = client

    async def list(self, user_id: str) -> List[Project]:
        """Return all active projects owned by user_id, ordered by creation date."""
        try:
            response = (
                self._client.table(_TABLE)
                .select("*")
                .eq("user_id", user_id)
                .eq("is_active", True)
                .order("created_at", desc=True)
                .execute()
            )
            return [Project(**row) for row in response.data]
        except Exception as exc:
            logger.error("Failed to list projects for user '%s': %s", user_id, exc)
            raise

    async def create(self, user_id: str, request: CreateProjectRequest) -> Project:
        """Insert a new project row and return the created record."""
        payload = {
            "user_id": user_id,
            "title": request.title,
            "description": request.description,
            "technologies": request.technologies,
        }
        try:
            response = self._client.table(_TABLE).insert(payload).execute()
            return Project(**response.data[0])
        except Exception as exc:
            logger.error("Failed to create project for user '%s': %s", user_id, exc)
            raise

    async def delete(self, user_id: str, project_id: UUID) -> bool:
        """Soft-delete by setting is_active = False.  Returns True if a row was affected."""
        try:
            response = (
                self._client.table(_TABLE)
                .update({"is_active": False})
                .eq("id", str(project_id))
                .eq("user_id", user_id)
                .execute()
            )
            return len(response.data) > 0
        except Exception as exc:
            logger.error(
                "Failed to delete project '%s' for user '%s': %s",
                project_id,
                user_id,
                exc,
            )
            raise
