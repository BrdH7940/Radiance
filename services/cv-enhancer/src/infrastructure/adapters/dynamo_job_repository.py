import boto3
from botocore.exceptions import ClientError
from core.domain.analysis_job import AnalysisJob
from core.ports.job_repository_port import IJobRepository


class DynamoJobRepository(IJobRepository):
    def __init__(self, table_name: str):
        self.table = boto3.resource("dynamodb").Table(table_name)

    async def save(self, job: AnalysisJob):
        # Chuyển đổi Pydantic/Domain model sang Dict để lưu vào Dynamo
        item = job.model_dump(mode="json")
        try:
            self.table.put_item(Item=item)
        except ClientError as e:
            print(f"Error saving to DynamoDB: {e.response['Error']['Message']}")
            raise

    async def get(self, job_id: str) -> AnalysisJob | None:
        try:
            response = self.table.get_item(Key={"id": job_id})
            item = response.get("Item")
            if not item:
                return None
            return AnalysisJob.model_validate(item)
        except ClientError as e:
            print(f"Error getting from DynamoDB: {e.response['Error']['Message']}")
            raise
