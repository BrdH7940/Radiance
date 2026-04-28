"""
ISQSService — abstract port for queuing analysis jobs.
"""

from abc import ABC, abstractmethod
from typing import List


class ISQSService(ABC):
    """Port for sending CV analysis jobs to a message queue.

    Example implementations: SQSService (AWS SQS), InMemorySQSService (testing).
    """

    @abstractmethod
    def send_job(self, job_id: str, s3_key: str, jd_text: str) -> None:
        """Enqueue a legacy CV analysis job for async processing.

        Args:
            job_id: Unique identifier of the pre-created AnalysisJob.
            s3_key: S3 object key of the raw CV PDF.
            jd_text: Job description text to match the CV against.
        """
        ...

    @abstractmethod
    def send_gallery_job(
        self,
        job_id: str,
        cv_text: str,
        jd_text: str,
        verified_projects: List[dict],
    ) -> None:
        """Enqueue a Strategic Gallery enhancement job for async processing.

        The `verified_projects` list must have already been validated against
        Supabase by the presentation layer — never call this with raw frontend data.

        Args:
            job_id: Unique identifier of the pre-created AnalysisJob.
            cv_text: Extracted plain text of the candidate's CV.
            jd_text: Full job description text.
            verified_projects: List of serialised ProjectItem dicts (source-of-truth).
        """
        ...
