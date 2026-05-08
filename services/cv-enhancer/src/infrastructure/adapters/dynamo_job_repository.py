import logging
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key as DynamoKey
from botocore.exceptions import ClientError

from core.domain.analysis_job import AnalysisJob, JobStatus
from core.ports.job_repository_port import IJobRepository

logger = logging.getLogger(__name__)


class DynamoJobRepository(IJobRepository):
    def __init__(
        self,
        table_name: str,
        region_name: str,
        endpoint_url: str | None = None,
        user_id: str = "local",
    ):
        self._dynamodb = boto3.resource(
            "dynamodb",
            region_name=region_name,
            endpoint_url=endpoint_url,
        )
        self.table = self._dynamodb.Table(table_name)
        self.user_id = user_id
        self._init_key_schema(table_name, region_name=region_name, endpoint_url=endpoint_url)

    def _init_key_schema(self, table_name: str, region_name: str, endpoint_url: str | None) -> None:
        """
        Discover the table's key schema so we can read/write items using the
        *actual* partition/sort key attribute names (e.g. 'UserId' + 'JobId').
        """
        # Defaults that match common Amplify/AppSync schemas.
        self._pk_name: str | None = "UserId"
        self._sk_name: str | None = "id"

        client = boto3.client("dynamodb", region_name=region_name, endpoint_url=endpoint_url)
        try:
            desc = client.describe_table(TableName=table_name)["Table"]
        except ClientError:
            # If DescribeTable isn't allowed, keep defaults and rely on runtime errors
            # to reveal mismatches.
            return

        key_schema = desc.get("KeySchema", [])
        pk: str | None = None
        sk: str | None = None
        for k in key_schema:
            if k.get("KeyType") == "HASH":
                pk = k.get("AttributeName")
            elif k.get("KeyType") == "RANGE":
                sk = k.get("AttributeName")

        if pk:
            self._pk_name = pk
        self._sk_name = sk

    async def save(self, job: AnalysisJob):
        # Chuyển đổi Pydantic/Domain model sang Dict để lưu vào Dynamo
        item = job.model_dump(mode="json")
        # Ensure required key attributes exist using the table's real schema.
        item[self._pk_name] = self.user_id
        if self._sk_name:
            item[self._sk_name] = job.id
        try:
            self.table.put_item(Item=item)
        except ClientError as e:
            logger.error("Error saving to DynamoDB: %s", e.response["Error"]["Message"])
            raise

    async def get(self, job_id: str) -> AnalysisJob | None:
        try:
            if self._sk_name:
                try:
                    # Fast path when we believe the table has a sort key.
                    response = self.table.get_item(
                        Key={self._pk_name: self.user_id, self._sk_name: job_id}
                    )
                    item = response.get("Item")
                except ClientError as e:
                    # Common live failure mode:
                    # - describe_table is forbidden for the Lambda role
                    # - _sk_name fallback becomes incorrect (e.g. "id" but table has no sort key)
                    # DynamoDB raises ValidationException for key-schema mismatch.
                    if e.response.get("Error", {}).get("Code") == "ValidationException":
                        # Fallback: query within partition and filter by our logical id attribute.
                        resp = self.table.query(
                            KeyConditionExpression=DynamoKey(self._pk_name).eq(self.user_id),
                            FilterExpression=Attr("id").eq(job_id),
                            Limit=1,
                        )
                        items = resp.get("Items", [])
                        item = items[0] if items else None
                    else:
                        raise
            else:
                # No sort key: query within partition and filter by our logical id.
                resp = self.table.query(
                    KeyConditionExpression=DynamoKey(self._pk_name).eq(self.user_id),
                    FilterExpression=Attr("id").eq(job_id),
                    Limit=1,
                )
                items = resp.get("Items", [])
                item = items[0] if items else None
            if not item:
                return None
            return AnalysisJob.model_validate(item)
        except ClientError as e:
            logger.error("Error getting from DynamoDB: %s", e.response["Error"]["Message"])
            raise

    async def update(self, job: AnalysisJob) -> None:
        """Persist a job update.

        Uses ``update_item`` for lightweight status-only transitions
        (PROCESSING, FAILED) to avoid rewriting the entire record — especially
        important because the COMPLETED record can carry a large
        ``enhanced_cv_json`` payload. Falls back to ``put_item`` for COMPLETED
        jobs where the full result must be written atomically.
        """
        if job.status == JobStatus.COMPLETED:
            # Full upsert: must write the result payload (enhanced_cv_json, pdf_url…).
            item = job.model_dump(mode="json")
            item[self._pk_name] = self.user_id
            if self._sk_name:
                item[self._sk_name] = job.id
            try:
                self.table.put_item(Item=item)
            except ClientError as e:
                logger.error("Error updating DynamoDB (put_item): %s", e.response["Error"]["Message"])
                raise
        else:
            # Status-only update (PROCESSING / FAILED): use update_item to
            # avoid rewriting immutable fields and avoid overwriting the result
            # payload that may already exist in a race condition.
            key: dict = {self._pk_name: self.user_id}
            if self._sk_name:
                key[self._sk_name] = job.id

            update_expr = "SET #st = :status, updated_at = :ts"
            expr_names: dict = {"#st": "status"}
            expr_values: dict = {
                ":status": job.status.value,
                ":ts": job.updated_at.isoformat(),
            }

            if job.error is not None:
                update_expr += ", #err = :error"
                expr_names["#err"] = "error"
                expr_values[":error"] = job.error

            try:
                self.table.update_item(
                    Key=key,
                    UpdateExpression=update_expr,
                    ExpressionAttributeNames=expr_names,
                    ExpressionAttributeValues=expr_values,
                )
            except ClientError as e:
                logger.error(
                    "Error updating DynamoDB (update_item): %s",
                    e.response["Error"]["Message"],
                )
                raise
