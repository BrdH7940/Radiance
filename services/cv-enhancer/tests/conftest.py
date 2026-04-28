import sys
from pathlib import Path


# Make both service root and `src` importable for tests.
#
# - Service root allows imports like `src.core...`
# - `src` path preserves compatibility for modules that still import
#   top-level packages such as `presentation`, `container`, etc.
SERVICE_ROOT = Path(__file__).resolve().parents[1]
SRC_PATH = SERVICE_ROOT / "src"

if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))
