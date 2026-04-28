"""
Local SQS worker for dev/testing (no Lambda update / no ECR push).

This script:
- Polls SQS using `SQS_QUEUE_URL`
- Wraps each message into a Lambda-like `event` and calls
  `process_sqs_records()` from `[services/cv-enhancer/src/main.py]`
- Deletes the SQS message only when the corresponding DynamoDB job exists
  (to avoid deleting messages that reference jobs not created yet).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging

import boto3

from config import get_settings
from container import get_job_repository
from main import process_sqs_records

logger = logging.getLogger(__name__)


async def worker_loop(
    *,
    max_deleted_messages: int,
    max_loops: int,
    poll_wait_seconds: int,
) -> None:
    settings = get_settings()
    sqs = boto3.client(
        "sqs",
        region_name=settings.aws_region,
        endpoint_url=getattr(settings, "sqs_endpoint_url", None),
    )
    job_repo = get_job_repository()

    deleted = 0
    loops = 0

    while True:
        if max_deleted_messages > 0 and deleted >= max_deleted_messages:
            logger.info("Reached max_deleted_messages=%s, exiting.", max_deleted_messages)
            return

        if max_loops > 0 and loops >= max_loops:
            logger.info("Reached max_loops=%s, exiting.", max_loops)
            return

        loops += 1

        resp = sqs.receive_message(
            QueueUrl=settings.sqs_queue_url,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=poll_wait_seconds,
        )
        messages = resp.get("Messages") or []
        if not messages:
            continue

        for message in messages:
            receipt_handle = message.get("ReceiptHandle")
            body_str = message.get("Body") or ""

            try:
                payload = json.loads(body_str)
            except json.JSONDecodeError:
                logger.exception("Invalid JSON message body; not deleting message.")
                continue

            job_id = payload.get("job_id")
            if not job_id:
                logger.warning("Missing job_id in message body; not deleting message.")
                continue

            event = {"Records": [{"body": body_str}]}

            try:
                # Runs the full async pipeline (HTTP->SQS->Worker path).
                await process_sqs_records(event)
            except Exception:
                # Let the message retry (visibility timeout).
                logger.exception("Worker failed; not deleting message (job may retry).")
                continue

            # Delete only if the job exists in DynamoDB.
            try:
                job = await job_repo.get(str(job_id))
            except Exception:
                logger.exception("Could not read job from DynamoDB; not deleting message.")
                continue

            if job is None:
                logger.warning(
                    "Job '%s' not found in DynamoDB (dev mismatch?). Leaving message undeleted.",
                    job_id,
                )
                continue

            if not receipt_handle:
                logger.warning("Missing ReceiptHandle; cannot delete message.")
                continue

            sqs.delete_message(
                QueueUrl=settings.sqs_queue_url,
                ReceiptHandle=receipt_handle,
            )
            deleted += 1
            logger.info("Processed + deleted message for job '%s' (%s/%s).", job_id, deleted, max_deleted_messages)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local SQS worker (dev/testing).")
    parser.add_argument("--max-messages", type=int, default=1, help="Max deleted messages (0 = unlimited).")
    parser.add_argument("--max-loops", type=int, default=0, help="Max poll loops (0 = unlimited).")
    parser.add_argument("--poll-wait-seconds", type=int, default=10, help="Long polling wait seconds.")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    asyncio.run(
        worker_loop(
            max_deleted_messages=args.max_messages,
            max_loops=args.max_loops,
            poll_wait_seconds=args.poll_wait_seconds,
        )
    )


if __name__ == "__main__":
    main()

