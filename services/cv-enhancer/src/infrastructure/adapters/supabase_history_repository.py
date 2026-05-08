"""
SupabaseHistoryRepository — implements IHistoryRepository via Supabase.

Uses the service_role Supabase client and applies explicit user_id filtering
on every query to enforce data ownership (service_role bypasses RLS).
"""

import logging
from typing import List, Optional
from uuid import UUID

from supabase import Client

from core.domain.cv_history import CVHistoryEntry, CVHistorySummary
from core.ports.history_repository_port import IHistoryRepository

logger = logging.getLogger(__name__)

_TABLE = "cv_history"

# Columns fetched for list views (excludes large JSON payload for performance).
_SUMMARY_COLUMNS = "id, job_title, company_name, matching_score, created_at"


class SupabaseHistoryRepository(IHistoryRepository):
    """Supabase-backed repository for the CV History feature."""

    def __init__(self, client: Client) -> None:
        self._client = client

    async def list(self, user_id: str) -> List[CVHistorySummary]:
        """Return lightweight summaries ordered newest-first."""
        try:
            response = (
                self._client.table(_TABLE)
                .select(_SUMMARY_COLUMNS)
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
            return [CVHistorySummary(**row) for row in response.data]
        except Exception as exc:
            logger.error("Failed to list history for user '%s': %s", user_id, exc)
            raise

    async def get_by_id(
        self, user_id: str, history_id: UUID
    ) -> Optional[CVHistoryEntry]:
        """Fetch a full history entry including the enhanced_cv_json payload."""
        try:
            response = (
                self._client.table(_TABLE)
                .select("*")
                .eq("id", str(history_id))
                .eq("user_id", user_id)
                .execute()
            )
            if not response.data:
                return None
            return CVHistoryEntry(**response.data[0])
        except Exception as exc:
            logger.error(
                "Failed to fetch history entry '%s' for user '%s': %s",
                history_id,
                user_id,
                exc,
            )
            raise

    async def save(self, entry: CVHistoryEntry) -> CVHistoryEntry:
        """Insert a new history record and return it with DB-generated id and created_at."""
        payload: dict = {
            "user_id": str(entry.user_id),
            "job_title": entry.job_title,
            "company_name": entry.company_name,
            "jd_text": entry.jd_text,
            "matching_score": entry.matching_score,
            "enhanced_cv_json": entry.enhanced_cv_json,
            "pdf_s3_key": entry.pdf_s3_key,
        }
        try:
            response = self._client.table(_TABLE).insert(payload).execute()
            return CVHistoryEntry(**response.data[0])
        except Exception as exc:
            logger.error(
                "Failed to save CV history for user '%s': %s", entry.user_id, exc
            )
            raise

    async def update(
        self,
        user_id: str,
        history_id: UUID,
        *,
        job_title: Optional[str] = None,
        company_name: Optional[str] = None,
    ) -> Optional[CVHistoryEntry]:
        """Update editable metadata (job_title / company_name) on an entry."""
        payload: dict = {}
        if job_title is not None:
            payload["job_title"] = job_title
        if company_name is not None:
            payload["company_name"] = company_name

        if not payload:
            # Nothing to update — fetch and return current state.
            return await self.get_by_id(user_id, history_id)

        try:
            response = (
                self._client.table(_TABLE)
                .update(payload)
                .eq("id", str(history_id))
                .eq("user_id", user_id)
                .execute()
            )
            if not response.data:
                return None
            return CVHistoryEntry(**response.data[0])
        except Exception as exc:
            logger.error(
                "Failed to update history entry '%s' for user '%s': %s",
                history_id,
                user_id,
                exc,
            )
            raise

    async def delete(self, user_id: str, history_id: UUID) -> bool:
        """Delete a history row owned by the given user. Returns True on success."""
        try:
            response = (
                self._client.table(_TABLE)
                .delete()
                .eq("id", str(history_id))
                .eq("user_id", user_id)
                .execute()
            )
            return bool(response.data)
        except Exception as exc:
            logger.error(
                "Failed to delete history entry '%s' for user '%s': %s",
                history_id,
                user_id,
                exc,
            )
            raise
