#!/usr/bin/env bash
# Lightweight packager for simple (interpreted) Lambda services.
# Usage: ./scripts/package_lambda.sh <service-dir> <output-zip>
# - Includes files in the service directory (preserves subdirs)
# - Installs requirements.txt into package if present (Python)

set -euo pipefail
service_dir=${1:-}
out_zip=${2:-}
if [ -z "$service_dir" ] || [ -z "$out_zip" ]; then
  echo "Usage: $0 <service-dir> <output-zip>" >&2
  exit 2
fi
if [ ! -d "$service_dir" ]; then
  echo "Service dir not found: $service_dir" >&2
  exit 3
fi
rm -rf ./.lambda_build || true
mkdir -p ./.lambda_build
cp -r "$service_dir"/* ./.lambda_build/ 2>/dev/null || true
# If Python requirements exist, install into build dir
if [ -f "$service_dir/requirements.txt" ]; then
  python -m pip install -r "$service_dir/requirements.txt" -t ./.lambda_build >/dev/null
fi
# Create zip
mkdir -p "$(dirname "$out_zip")"
( cd ./.lambda_build && zip -r9 "../$(basename "$out_zip")" . )
mv "./$(basename "$out_zip")" "$out_zip"
rm -rf ./.lambda_build
echo "Packaged $service_dir -> $out_zip"