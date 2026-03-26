import json
from unittest.mock import MagicMock

from infrastructure.adapters.sqs_service import SQSService


def test_init_creates_sqs_client_with_expected_args(monkeypatch):
    client_mock = MagicMock()
    boto3_client_mock = MagicMock(return_value=client_mock)
    monkeypatch.setattr("infrastructure.adapters.sqs_service.boto3.client", boto3_client_mock)

    service = SQSService(
        queue_url="https://sqs.us-east-1.amazonaws.com/123/queue",
        region_name="us-east-1",
        endpoint_url="http://localhost:4566",
    )

    assert service.sqs is client_mock
    assert service.queue_url == "https://sqs.us-east-1.amazonaws.com/123/queue"
    boto3_client_mock.assert_called_once_with(
        "sqs",
        region_name="us-east-1",
        endpoint_url="http://localhost:4566",
    )


def test_send_job_pushes_serialized_message(monkeypatch):
    client_mock = MagicMock()
    monkeypatch.setattr(
        "infrastructure.adapters.sqs_service.boto3.client", MagicMock(return_value=client_mock)
    )
    service = SQSService(
        queue_url="https://sqs.us-east-1.amazonaws.com/123/queue",
        region_name="us-east-1",
    )

    service.send_job(job_id="job-1", s3_key="raw-pdf/cv.pdf", jd_text="Python backend role")

    client_mock.send_message.assert_called_once()
    kwargs = client_mock.send_message.call_args.kwargs
    assert kwargs["QueueUrl"] == "https://sqs.us-east-1.amazonaws.com/123/queue"
    assert json.loads(kwargs["MessageBody"]) == {
        "job_id": "job-1",
        "s3_key": "raw-pdf/cv.pdf",
        "jd_text": "Python backend role",
    }
