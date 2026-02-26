"""
In-memory implementation of IJobRepository.

Uses a module-level dictionary (JOBS_DB) as the backing store. This adapter
is suitable for local development and single-instance deployments.

Migration path
--------------
Replace this adapter with a DynamoDB adapter by implementing IJobRepository
in a new ``DynamoDBJobRepository`` class and swapping the binding in container.py.
The rest of the codebase remains unchanged.
"""

import asyncio
import logging
from typing import Dict, Optional

from core.domain.analysis_job import AnalysisJob
from core.ports.job_repository_port import IJobRepository

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level store — the single source of truth for all job states.
# In a multi-instance deployment, replace this with a shared store (DynamoDB,
# Redis, etc.) via a new IJobRepository adapter.
# ---------------------------------------------------------------------------
JOBS_DB: Dict[str, AnalysisJob] = {}

# Asyncio lock — guards concurrent writes to JOBS_DB from background tasks.
_DB_LOCK: asyncio.Lock = asyncio.Lock()


class InMemoryJobRepository(IJobRepository):
    """Thread-safe, in-memory IJobRepository backed by a module-level dict."""

    async def save(self, job: AnalysisJob) -> None:
        """Persist a new job.

        Raises:
            ValueError: If a job with the same id already exists.
        """
        async with _DB_LOCK:
            if job.id in JOBS_DB:
                raise ValueError(
                    f"Job '{job.id}' already exists. Use update() to modify existing jobs."
                )
            JOBS_DB[job.id] = job
            logger.debug("Job '%s' saved (status: %s).", job.id, job.status)

    async def get(self, job_id: str) -> Optional[AnalysisJob]:
        """Return the job if it exists, or None."""
        return JOBS_DB.get(job_id)

    async def update(self, job: AnalysisJob) -> None:
        """Replace the stored state of an existing job.

        Raises:
            KeyError: If no job with ``job.id`` exists.
        """
        async with _DB_LOCK:
            if job.id not in JOBS_DB:
                raise KeyError(
                    f"Cannot update job '{job.id}': not found in repository."
                )
            JOBS_DB[job.id] = job
            logger.debug("Job '%s' updated (status: %s).", job.id, job.status)
