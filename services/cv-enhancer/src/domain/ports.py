"""
Abstract interfaces for the CV Enhancer service.
"""

from abc import ABC, abstractmethod


class IDocumentParser(ABC):
    """Interface for parsing documents into plain text.
    
    Example: Docling, PDFplumber, etc.
    """

    @abstractmethod
    async def parse_pdf(self, file_path: str) -> str:
        """Parse a PDF file and return its content as Markdown or plain text.

        Args:
            file_path: The local filesystem path to the PDF file.

        Returns:
            Extracted text content as a string (Markdown preferred).

        Raises:
            FileNotFoundError: If no file exists at the given path.
            ValueError: If the file cannot be processed as a PDF.
        """
        ...


class IStorageService(ABC):
    """Interface for object storage operations used by the CV Enhancer service.

    Example: AWS S3, GCS, etc.
    """

    @abstractmethod
    def generate_presigned_upload_url(self, object_key: str, content_type: str) -> str:
        """Generate a time-limited URL for uploading an object via HTTP PUT.

        Args:
            object_key: Fully-qualified object key inside the bucket.
            content_type: MIME type of the file to be uploaded.

        Returns:
            A presigned HTTPS URL that accepts HTTP PUT requests.
        """
        ...

    @abstractmethod
    def download_object(self, object_key: str, local_path: str) -> None:
        """Download an object from storage to a local file.

        Args:
            object_key: Fully-qualified key of the object to download.
            local_path: Absolute local filesystem path to write the file to.

        Raises:
            FileNotFoundError: If the object does not exist in the bucket.
        """
        ...

    @abstractmethod
    def upload_file(
        self,
        local_path: str,
        object_key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload a local file to object storage.

        Args:
            local_path: Absolute path to the file to upload.
            object_key: Destination key in the bucket.
            content_type: MIME type of the uploaded file.

        Returns:
            The object_key of the uploaded object (for chaining).
        """
        ...

    @abstractmethod
    def generate_presigned_download_url(self, object_key: str) -> str:
        """Generate a time-limited URL for downloading an object.

        Args:
            object_key: Fully-qualified key of the object.

        Returns:
            A presigned HTTPS URL that allows HTTP GET access to the object.
        """
        ...
