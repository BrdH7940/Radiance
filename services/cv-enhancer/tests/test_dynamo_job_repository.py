from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from core.domain.analysis_job import AnalysisJob, JobStatus
from infrastructure.adapters.dynamo_job_repository import DynamoJobRepository


def _client_error(operation_name: str = "put_item") -> ClientError:
    return ClientError(
        error_response={"Error": {"Code": "ValidationException", "Message": "invalid"}},
        operation_name=operation_name,
    )


def _job() -> AnalysisJob:
    now = datetime.now(timezone.utc)
    return AnalysisJob(
        id="job-123",
        status=JobStatus.QUEUED,
        s3_key="raw-pdf/cv.pdf",
        jd_text="JD",
        created_at=now,
        updated_at=now,
    )


def _build_repo(monkeypatch, describe_table_response=None):
    table_mock = MagicMock()
    resource_mock = MagicMock()
    resource_mock.Table.return_value = table_mock

    client_mock = MagicMock()
    if isinstance(describe_table_response, Exception):
        client_mock.describe_table.side_effect = describe_table_response
    else:
        client_mock.describe_table.return_value = describe_table_response or {
            "Table": {
                "KeySchema": [
                    {"AttributeName": "UserId", "KeyType": "HASH"},
                    {"AttributeName": "JobId", "KeyType": "RANGE"},
                ]
            }
        }

    monkeypatch.setattr(
        "infrastructure.adapters.dynamo_job_repository.boto3.resource",
        MagicMock(return_value=resource_mock),
    )
    monkeypatch.setattr(
        "infrastructure.adapters.dynamo_job_repository.boto3.client",
        MagicMock(return_value=client_mock),
    )

    repo = DynamoJobRepository("tbl", "us-east-1", endpoint_url="http://localhost:8000", user_id="u1")
    return SimpleNamespace(repo=repo, table=table_mock)


@pytest.mark.asyncio
async def test_save_puts_item_with_detected_keys(monkeypatch):
    built = _build_repo(monkeypatch)
    job = _job()

    await built.repo.save(job)

    built.table.put_item.assert_called_once()
    item = built.table.put_item.call_args.kwargs["Item"]
    assert item["UserId"] == "u1"
    assert item["JobId"] == "job-123"
    assert item["id"] == "job-123"


@pytest.mark.asyncio
async def test_get_returns_analysis_job_when_item_exists(monkeypatch):
    built = _build_repo(monkeypatch)
    job = _job()
    payload = job.model_dump(mode="json")
    payload["UserId"] = "u1"
    payload["JobId"] = "job-123"
    built.table.get_item.return_value = {"Item": payload}

    result = await built.repo.get("job-123")

    assert isinstance(result, AnalysisJob)
    assert result.id == "job-123"
    built.table.get_item.assert_called_once_with(Key={"UserId": "u1", "JobId": "job-123"})


@pytest.mark.asyncio
async def test_get_returns_none_when_item_missing(monkeypatch):
    built = _build_repo(monkeypatch)
    built.table.get_item.return_value = {}

    result = await built.repo.get("missing")

    assert result is None


@pytest.mark.asyncio
async def test_update_puts_item(monkeypatch):
    built = _build_repo(monkeypatch)
    job = _job()
    job = job.model_copy(update={"status": JobStatus.PROCESSING})

    await built.repo.update(job)

    built.table.put_item.assert_called_once()
    item = built.table.put_item.call_args.kwargs["Item"]
    assert item["status"] == JobStatus.PROCESSING.value
    assert item["UserId"] == "u1"
    assert item["JobId"] == "job-123"


@pytest.mark.asyncio
async def test_init_falls_back_to_default_schema_when_describe_table_forbidden(monkeypatch):
    err = ClientError(
        error_response={"Error": {"Code": "AccessDeniedException", "Message": "denied"}},
        operation_name="describe_table",
    )
    built = _build_repo(monkeypatch, describe_table_response=err)
    job = _job()

    await built.repo.save(job)

    item = built.table.put_item.call_args.kwargs["Item"]
    assert item["UserId"] == "u1"
    assert item["id"] == "job-123"


@pytest.mark.asyncio
async def test_get_falls_back_to_query_on_get_item_validation_exception(monkeypatch):
    # Simulate DescribeTable being forbidden, causing DynamoJobRepository to keep
    # its default (potentially incorrect) sort-key fallback.
    describe_table_err = ClientError(
        error_response={"Error": {"Code": "AccessDeniedException", "Message": "denied"}},
        operation_name="describe_table",
    )
    built = _build_repo(monkeypatch, describe_table_response=describe_table_err)

    job = _job()
    payload = job.model_dump(mode="json")
    payload["UserId"] = "u1"

    built.table.get_item.side_effect = _client_error(operation_name="get_item")
    built.table.query.return_value = {"Items": [payload]}

    result = await built.repo.get(job.id)

    assert isinstance(result, AnalysisJob)
    assert result.id == job.id
    built.table.get_item.assert_called_once()
    built.table.query.assert_called_once()


@pytest.mark.asyncio
async def test_get_uses_query_when_table_has_only_partition_key(monkeypatch):
    table_mock = MagicMock()
    table_mock.query.return_value = {"Items": []}
    resource_mock = MagicMock()
    resource_mock.Table.return_value = table_mock

    client_mock = MagicMock()
    client_mock.describe_table.return_value = {
        "Table": {"KeySchema": [{"AttributeName": "TenantId", "KeyType": "HASH"}]}
    }

    monkeypatch.setattr(
        "infrastructure.adapters.dynamo_job_repository.boto3.resource",
        MagicMock(return_value=resource_mock),
    )
    monkeypatch.setattr(
        "infrastructure.adapters.dynamo_job_repository.boto3.client",
        MagicMock(return_value=client_mock),
    )

    repo = DynamoJobRepository("tbl", "us-east-1", user_id="u1")
    result = await repo.get("job-999")

    assert result is None
    table_mock.query.assert_called_once()
    assert table_mock.get_item.call_count == 0


@pytest.mark.asyncio
async def test_dynamo_errors_are_reraised(monkeypatch):
    built = _build_repo(monkeypatch)
    built.table.put_item.side_effect = _client_error()

    with pytest.raises(ClientError):
        await built.repo.save(_job())
