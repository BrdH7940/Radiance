"""
IJobNotifier — abstract port for broadcasting job status to connected clients.

Concrete adapters (e.g. SupabaseRealtimeNotifier) implement this interface,
keeping the analysis pipeline decoupled from the real-time notification layer.
"""

from abc import ABC, abstractmethod


class IJobNotifier(ABC):
    """Fire-and-forget port: notify subscribers that a job changed status."""

    @abstractmethod
    async def notify(self, job_id: str, status: str) -> None:
        """Broadcast the job status to all subscribers of this job's channel.

        This call must never raise — implementations must swallow all errors
        so that a notification failure never fails the analysis pipeline.

        Args:
            job_id: The unique job identifier (used to derive the channel name).
            status: The new job status string, e.g. ``"completed"`` or ``"failed"``.
        """
        ...
