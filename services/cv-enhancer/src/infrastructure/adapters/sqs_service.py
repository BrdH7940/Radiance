"""
AWS SQS implementation of the ISQSService port.
"""

import json
import logging
from typing import List

import boto3

from core.ports.sqs_port import ISQSService

logger = logging.getLogger(__name__)

_LEGACY_TYPE = "legacy_enhance"
_GALLERY_TYPE = "gallery_enhance"


class SQSService(ISQSService):
    """AWS SQS implementation of ISQSService."""

    def __init__(self, queue_url: str, region_name: str, endpoint_url: str | None = None):
        self.sqs = boto3.client("sqs", region_name=region_name, endpoint_url=endpoint_url)
        self.queue_url = queue_url

    def send_job(self, job_id: str, s3_key: str, jd_text: str) -> None:
        """Serialise and enqueue a legacy CV analysis job to SQS."""
        message = {
            "type": _LEGACY_TYPE,
            "job_id": job_id,
            "s3_key": s3_key,
            "jd_text": jd_text,
        }
        self.sqs.send_message(QueueUrl=self.queue_url, MessageBody=json.dumps(message))
        logger.info("Legacy job '%s' enqueued to SQS (key: '%s').", job_id, s3_key)

    def send_gallery_job(
        self,
        job_id: str,
        cv_text: str,
        jd_text: str,
        verified_projects: List[dict],
    ) -> None:
        """Serialise and enqueue a Strategic Gallery enhancement job to SQS."""
        message = {
            "type": _GALLERY_TYPE,
            "job_id": job_id,
            "cv_text": cv_text,
            "jd_text": jd_text,
            "verified_projects": verified_projects,
        }
        self.sqs.send_message(QueueUrl=self.queue_url, MessageBody=json.dumps(message))
        logger.info("Gallery job '%s' enqueued to SQS (%d projects).", job_id, len(verified_projects))
