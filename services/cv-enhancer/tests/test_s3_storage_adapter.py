from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from infrastructure.storage.s3_storage import S3StorageAdapter


@pytest.fixture
def settings():
    return SimpleNamespace(
        aws_region="us-east-1",
        aws_access_key_id="ak",
        aws_secret_access_key="sk",
        aws_session_token=None,
        s3_bucket="radiance-bucket",
        s3_presigned_upload_expiration=900,
        s3_presigned_download_expiration=3600,
    )


def _client_error(code: str, message: str = "error") -> ClientError:
    return ClientError(
        error_response={"Error": {"Code": code, "Message": message}},
        operation_name="download_file",
    )


def test_init_creates_s3_client_without_session_token(settings, monkeypatch):
    client_mock = MagicMock()
    boto3_client_mock = MagicMock(return_value=client_mock)
    monkeypatch.setattr("infrastructure.storage.s3_storage.boto3.client", boto3_client_mock)

    adapter = S3StorageAdapter(settings)

    assert adapter._client is client_mock
    boto3_client_mock.assert_called_once_with(
        "s3",
        region_name="us-east-1",
        aws_access_key_id="ak",
        aws_secret_access_key="sk",
    )


def test_init_creates_s3_client_with_session_token(settings, monkeypatch):
    settings.aws_session_token = "token"
    boto3_client_mock = MagicMock(return_value=MagicMock())
    monkeypatch.setattr("infrastructure.storage.s3_storage.boto3.client", boto3_client_mock)

    S3StorageAdapter(settings)

    boto3_client_mock.assert_called_once_with(
        "s3",
        region_name="us-east-1",
        aws_access_key_id="ak",
        aws_secret_access_key="sk",
        aws_session_token="token",
    )


def test_generate_presigned_upload_url(settings, monkeypatch):
    client_mock = MagicMock()
    client_mock.generate_presigned_url.return_value = "https://upload"
    monkeypatch.setattr(
        "infrastructure.storage.s3_storage.boto3.client", MagicMock(return_value=client_mock)
    )
    adapter = S3StorageAdapter(settings)

    url = adapter.generate_presigned_upload_url("raw-pdf/cv.pdf", "application/pdf")

    assert url == "https://upload"
    client_mock.generate_presigned_url.assert_called_once_with(
        ClientMethod="put_object",
        Params={
            "Bucket": "radiance-bucket",
            "Key": "raw-pdf/cv.pdf",
            "ContentType": "application/pdf",
        },
        ExpiresIn=900,
    )


def test_generate_presigned_download_url(settings, monkeypatch):
    client_mock = MagicMock()
    client_mock.generate_presigned_url.return_value = "https://download"
    monkeypatch.setattr(
        "infrastructure.storage.s3_storage.boto3.client", MagicMock(return_value=client_mock)
    )
    adapter = S3StorageAdapter(settings)

    url = adapter.generate_presigned_download_url("enhanced-pdf/out.pdf")

    assert url == "https://download"
    client_mock.generate_presigned_url.assert_called_once_with(
        ClientMethod="get_object",
        Params={"Bucket": "radiance-bucket", "Key": "enhanced-pdf/out.pdf"},
        ExpiresIn=3600,
    )


def test_download_object_success(settings, monkeypatch):
    client_mock = MagicMock()
    monkeypatch.setattr(
        "infrastructure.storage.s3_storage.boto3.client", MagicMock(return_value=client_mock)
    )
    adapter = S3StorageAdapter(settings)

    adapter.download_object("raw-pdf/cv.pdf", "/tmp/cv.pdf")

    client_mock.download_file.assert_called_once_with(
        Bucket="radiance-bucket",
        Key="raw-pdf/cv.pdf",
        Filename="/tmp/cv.pdf",
    )


@pytest.mark.parametrize("error_code", ["404", "NoSuchKey"])
def test_download_object_maps_missing_key_to_file_not_found(settings, monkeypatch, error_code):
    client_mock = MagicMock()
    client_mock.download_file.side_effect = _client_error(error_code, "missing")
    monkeypatch.setattr(
        "infrastructure.storage.s3_storage.boto3.client", MagicMock(return_value=client_mock)
    )
    adapter = S3StorageAdapter(settings)

    with pytest.raises(FileNotFoundError):
        adapter.download_object("raw-pdf/missing.pdf", "/tmp/missing.pdf")


def test_download_object_reraises_non_missing_client_error(settings, monkeypatch):
    client_mock = MagicMock()
    client_mock.download_file.side_effect = _client_error("403", "forbidden")
    monkeypatch.setattr(
        "infrastructure.storage.s3_storage.boto3.client", MagicMock(return_value=client_mock)
    )
    adapter = S3StorageAdapter(settings)

    with pytest.raises(ClientError):
        adapter.download_object("raw-pdf/secret.pdf", "/tmp/secret.pdf")


def test_upload_file_uses_content_type_and_returns_key(settings, monkeypatch):
    client_mock = MagicMock()
    monkeypatch.setattr(
        "infrastructure.storage.s3_storage.boto3.client", MagicMock(return_value=client_mock)
    )
    adapter = S3StorageAdapter(settings)

    returned_key = adapter.upload_file(
        local_path="/tmp/rendered.pdf",
        object_key="enhanced-pdf/rendered.pdf",
        content_type="application/pdf",
    )

    assert returned_key == "enhanced-pdf/rendered.pdf"
    client_mock.upload_file.assert_called_once_with(
        Filename="/tmp/rendered.pdf",
        Bucket="radiance-bucket",
        Key="enhanced-pdf/rendered.pdf",
        ExtraArgs={"ContentType": "application/pdf"},
    )
