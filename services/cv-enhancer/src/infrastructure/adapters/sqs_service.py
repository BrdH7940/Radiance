import boto3
import json


class SQSService:
    def __init__(self, queue_url: str):
        self.sqs = boto3.client("sqs")
        self.queue_url = queue_url

    def send_job(self, job_id: str, s3_key: str, jd_text: str):
        message = {"job_id": job_id, "s3_key": s3_key, "jd_text": jd_text}
        self.sqs.send_message(QueueUrl=self.queue_url, MessageBody=json.dumps(message))
