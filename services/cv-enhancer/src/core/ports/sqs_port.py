"""
ISQSService — abstract port for queuing analysis jobs.
"""

from abc import ABC, abstractmethod


class ISQSService(ABC):
    """Port for sending CV analysis jobs to a message queue.

    Example implementations: SQSService (AWS SQS), InMemorySQSService (testing).
    """

    @abstractmethod
    def send_job(self, job_id: str, s3_key: str, jd_text: str) -> None:
        """Enqueue a CV analysis job for async processing.

        Args:
            job_id: Unique identifier of the pre-created AnalysisJob.
            s3_key: S3 object key of the raw CV PDF.
            jd_text: Job description text to match the CV against.
        """
        ...
