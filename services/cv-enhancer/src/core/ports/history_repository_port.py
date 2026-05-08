"""
IHistoryRepository — abstract port for managing CV History records.

Concrete adapters (e.g. SupabaseHistoryRepository) implement this interface,
keeping the analysis pipeline decoupled from database technology.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from core.domain.cv_history import CVHistoryEntry, CVHistorySummary


class IHistoryRepository(ABC):
    """Read/write port for CV History entities."""

    @abstractmethod
    async def list(self, user_id: str) -> List[CVHistorySummary]:
        """Return lightweight history summaries for a user, newest first.

        Args:
            user_id: Supabase auth user UUID as a string.
        """
        ...

    @abstractmethod
    async def get_by_id(
        self, user_id: str, history_id: UUID
    ) -> Optional[CVHistoryEntry]:
        """Fetch a full history entry including the enhanced CV JSON.

        Args:
            user_id: Owning user's UUID string (enforces ownership check).
            history_id: UUID of the history record.

        Returns:
            The full CVHistoryEntry, or None if not found / not owned by user.
        """
        ...

    @abstractmethod
    async def save(self, entry: CVHistoryEntry) -> CVHistoryEntry:
        """Persist a new history entry and return the record with DB-generated fields.

        Args:
            entry: CVHistoryEntry to insert (id and created_at may be None; DB assigns them).
        """
        ...

    @abstractmethod
    async def update(
        self,
        user_id: str,
        history_id: UUID,
        *,
        job_title: Optional[str] = None,
        company_name: Optional[str] = None,
    ) -> Optional[CVHistoryEntry]:
        """Update editable metadata fields on an existing history entry.

        Only the fields that are not None are written. Returns the updated entry,
        or None when the row does not exist or is not owned by the user.
        """
        ...

    @abstractmethod
    async def delete(self, user_id: str, history_id: UUID) -> bool:
        """Delete a history entry owned by the given user.

        Returns:
            True when a row was deleted, False when no row was found / not owned.
        """
        ...
