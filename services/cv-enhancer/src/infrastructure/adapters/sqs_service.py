import boto3
import json


class SQSService:
    def __init__(self, queue_url: str, region_name: str, endpoint_url: str | None = None):
        self.sqs = boto3.client("sqs", region_name=region_name, endpoint_url=endpoint_url)
        self.queue_url = queue_url

    def send_job(self, job_id: str, s3_key: str, jd_text: str):
        message = {"job_id": job_id, "s3_key": s3_key, "jd_text": jd_text}
        self.sqs.send_message(QueueUrl=self.queue_url, MessageBody=json.dumps(message))
