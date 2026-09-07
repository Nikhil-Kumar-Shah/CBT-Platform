from abc import ABC, abstractmethod
from typing import Optional
from backend.app.core.config import settings
from backend.app.core.logging import logger


class StorageProvider(ABC):
    @abstractmethod
    def save_file(self, content: bytes, storage_key: str, content_type: str) -> str:
        """Save file content and return the access URL."""
        pass

    @abstractmethod
    def get_file(self, storage_key: str) -> bytes:
        """Retrieve raw file content by storage key."""
        pass

    @abstractmethod
    def delete_file(self, storage_key: str) -> bool:
        """Delete a file by storage key."""
        pass

    @abstractmethod
    def get_url(self, storage_key: str) -> str:
        """Get the URL to access the file."""
        pass


class AzureBlobStorageProvider(StorageProvider):
    def __init__(self, connection_string: str, container_name: str = "cbt"):
        from azure.storage.blob import BlobServiceClient, ContentSettings
        from azure.core.exceptions import AzureError, ResourceNotFoundError

        self.AzureError = AzureError
        self.ResourceNotFoundError = ResourceNotFoundError
        self.ContentSettings = ContentSettings
        self.container_name = container_name or "cbt"

        if not connection_string or not connection_string.strip():
            raise RuntimeError(
                "CRITICAL CONFIGURATION ERROR: Azure Blob Storage connection string is missing or empty. "
                "Local storage fallback is disabled."
            )

        try:
            self.service_client = BlobServiceClient.from_connection_string(connection_string)
            container_client = self.service_client.get_container_client(self.container_name)
            if not container_client.exists():
                container_client.create_container()
                logger.info("Created missing Azure Blob Storage container '%s'", self.container_name)
            # Verify container is reachable
            container_client.get_container_properties()
        except Exception as e:
            logger.error("Failed to initialize Azure Blob Storage client for container '%s': %s", self.container_name, e)
            raise RuntimeError(f"Azure Blob Storage initialization error: {e}") from e

    def save_file(self, content: bytes, storage_key: str, content_type: str) -> str:
        try:
            clean_key = storage_key.replace("\\", "/").strip("/")
            blob_client = self.service_client.get_blob_client(
                container=self.container_name,
                blob=clean_key,
            )
            content_settings = self.ContentSettings(
                content_type=content_type,
                cache_control="public, max-age=86400",
            )
            blob_client.upload_blob(content, overwrite=True, content_settings=content_settings)
            logger.info("Successfully uploaded blob to Azure: container=%s, blob=%s (%d bytes)", self.container_name, clean_key, len(content))
            return self.get_url(clean_key)
        except Exception as e:
            logger.error("Azure Blob upload failure for %s: %s", storage_key, e)
            raise RuntimeError(f"Cloud storage upload failed: {e}") from e

    def get_file(self, storage_key: str) -> bytes:
        try:
            clean_key = storage_key.replace("\\", "/").strip("/")
            blob_client = self.service_client.get_blob_client(
                container=self.container_name,
                blob=clean_key,
            )
            stream = blob_client.download_blob()
            return stream.readall()
        except self.ResourceNotFoundError:
            raise FileNotFoundError(f"Blob not found in Azure: {storage_key}")
        except Exception as e:
            logger.error("Azure Blob download failure for %s: %s", storage_key, e)
            raise RuntimeError(f"Cloud storage download failed: {e}") from e

    def delete_file(self, storage_key: str) -> bool:
        try:
            clean_key = storage_key.replace("\\", "/").strip("/")
            blob_client = self.service_client.get_blob_client(
                container=self.container_name,
                blob=clean_key,
            )
            blob_client.delete_blob()
            logger.info("Deleted blob from Azure: %s", clean_key)
            return True
        except self.ResourceNotFoundError:
            logger.warning("Blob %s not found for deletion in Azure", storage_key)
            return False
        except Exception as e:
            logger.error("Failed to delete blob %s from Azure: %s", storage_key, e)
            raise RuntimeError(f"Azure Blob deletion error: {e}") from e

    def get_url(self, storage_key: str) -> str:
        # Route via server-side media stream endpoint to keep anonymous public access disabled on cloud container
        clean_key = storage_key.replace("\\", "/").strip("/")
        return f"/api/v1/media/file/{clean_key}"


_storage_provider_instance: Optional[StorageProvider] = None


def get_storage_provider() -> StorageProvider:
    """Factory to return Azure Blob Storage provider as the sole storage backend.

    There is NO local storage fallback.
    """
    global _storage_provider_instance
    if _storage_provider_instance is not None:
        return _storage_provider_instance

    if not settings.AZURE_STORAGE_CONNECTION_STRING or not settings.AZURE_STORAGE_CONNECTION_STRING.strip():
        raise RuntimeError(
            "CRITICAL: Azure Blob Storage is the sole storage backend, but "
            "AZURE_STORAGE_CONNECTION_STRING is not configured. Local fallback is disabled."
        )

    _storage_provider_instance = AzureBlobStorageProvider(
        connection_string=settings.AZURE_STORAGE_CONNECTION_STRING,
        container_name=settings.AZURE_STORAGE_CONTAINER_NAME,
    )
    return _storage_provider_instance
