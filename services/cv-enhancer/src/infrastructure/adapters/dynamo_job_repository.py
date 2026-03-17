import boto3
from botocore.exceptions import ClientError
from core.domain.analysis_job import AnalysisJob
from core.ports.job_repository_port import IJobRepository
from boto3.dynamodb.conditions import Attr, Key as DynamoKey


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
            print(f"Error saving to DynamoDB: {e.response['Error']['Message']}")
            raise

    async def get(self, job_id: str) -> AnalysisJob | None:
        try:
            if self._sk_name:
                response = self.table.get_item(
                    Key={self._pk_name: self.user_id, self._sk_name: job_id}
                )
                item = response.get("Item")
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
            print(f"Error getting from DynamoDB: {e.response['Error']['Message']}")
            raise

    async def update(self, job: AnalysisJob) -> None:
        # Ghi đè (upsert) toàn bộ record theo id.
        item = job.model_dump(mode="json")
        item[self._pk_name] = self.user_id
        if self._sk_name:
            item[self._sk_name] = job.id
        try:
            self.table.put_item(Item=item)
        except ClientError as e:
            print(f"Error updating DynamoDB: {e.response['Error']['Message']}")
            raise
