import boto3
import json
import os


class SQSService:
    def __init__(self):
        self.sqs = boto3.client("sqs")
        self.queue_url = os.getenv("SQS_QUEUE_URL")

    def send_job(self, job_id: str, s3_key: str, jd_text: str):
        message = {"job_id": job_id, "s3_key": s3_key, "jd_text": jd_text}
        self.sqs.send_message(QueueUrl=self.queue_url, MessageBody=json.dumps(message))
