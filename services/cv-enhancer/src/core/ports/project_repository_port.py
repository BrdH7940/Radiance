"""
IProjectRepository — abstract port for managing Project Gallery entries.

Concrete adapters (e.g. SupabaseProjectRepository) implement this interface,
keeping use cases and routers decoupled from database technology.
"""

from abc import ABC, abstractmethod
from typing import List
from uuid import UUID

from core.domain.project import CreateProjectRequest, Project


class IProjectRepository(ABC):
    """CRUD port for Project Gallery entities."""

    @abstractmethod
    async def list(self, user_id: str) -> List[Project]:
        """Return all active projects owned by the given user.

        Args:
            user_id: Supabase auth user UUID as a string.
        """
        ...

    @abstractmethod
    async def create(self, user_id: str, request: CreateProjectRequest) -> Project:
        """Persist a new project and return the created record.

        Args:
            user_id: Owning user's UUID string.
            request: Validated creation payload.
        """
        ...

    @abstractmethod
    async def delete(self, user_id: str, project_id: UUID) -> bool:
        """Soft-delete a project (sets is_active = False).

        Args:
            user_id: Owning user's UUID string (prevents cross-user deletion).
            project_id: UUID of the project to deactivate.

        Returns:
            True if a record was updated, False if not found.
        """
        ...

    @abstractmethod
    async def verify_selected(self, user_id: str, selected_ids: List[str]) -> List[Project]:
        """Verify that all selected_ids belong to the user and are active.

        Fetches the source-of-truth from the database.  Any ID that does not
        exist or does not belong to user_id causes a ValueError to be raised,
        which the presentation layer converts to a 403 Forbidden response.

        Args:
            user_id: Owning user's UUID string.
            selected_ids: Project UUIDs as strings from the frontend payload.

        Returns:
            List of verified Project domain objects — safe to pass to the LLM.

        Raises:
            ValueError: If any ID is invalid or does not belong to user_id.
        """
        ...
