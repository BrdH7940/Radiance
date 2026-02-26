"""
IJobRepository — abstract port for persisting and retrieving analysis jobs.

The in-memory adapter is used today; a DynamoDB adapter can be swapped in
without touching any code outside the infrastructure layer.
"""

from abc import ABC, abstractmethod
from typing import Optional

from core.domain.analysis_job import AnalysisJob


class IJobRepository(ABC):
    """Async CRUD port for AnalysisJob entities.
    """

    @abstractmethod
    async def save(self, job: AnalysisJob) -> None:
        """Persist a new job.

        Args:
            job: The AnalysisJob to save. Its ``id`` must be unique.

        Raises:
            ValueError: If a job with the same id already exists.
        """
        ...

    @abstractmethod
    async def get(self, job_id: str) -> Optional[AnalysisJob]:
        """Retrieve a job by its ID.

        Args:
            job_id: Unique identifier of the job.

        Returns:
            The AnalysisJob if found, or ``None`` if no such job exists.
        """
        ...

    @abstractmethod
    async def update(self, job: AnalysisJob) -> None:
        """Replace the stored state of an existing job.

        Args:
            job: Updated AnalysisJob — must already exist (identified by ``id``).

        Raises:
            KeyError: If no job with ``job.id`` exists in the repository.
        """
        ...
