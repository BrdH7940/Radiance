"""
Backward-compatibility re-exports.

The canonical locations are now:
  - ``core.ports.document_parser_port.IDocumentParser``
  - ``core.ports.storage_port.IStorageService``

This module is kept as a shim so that existing external imports continue
to work during the transition. Prefer importing directly from ``core``.
"""

from core.ports.document_parser_port import IDocumentParser
from core.ports.storage_port import IStorageService

__all__ = ["IDocumentParser", "IStorageService"]
