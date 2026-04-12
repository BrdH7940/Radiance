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
