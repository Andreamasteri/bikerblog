#!/bin/sh
# Stage the 33 approved BikerBlog media files in the isolated R2 bucket.
# Requires: CLOUDFLARE_API_TOKEN with R2 object edit scope.
set -eu
: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN in your shell; never commit it}"
: "${CLOUDFLARE_ACCOUNT_ID:=d116d3d97b133c543d02934be4bc98d2}"
BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MANIFEST="$BASE_DIR/editorial-media-manifest.json"
MEDIA_DIR="${BIKERBLOG_MEDIA_DIR:-$BASE_DIR/media/editorial}"
if [ ! -d "$MEDIA_DIR" ]; then
  echo "Media files not found at $MEDIA_DIR (unpack bikerblog_media_cloudflare_20261118.zip)." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then echo 'curl required' >&2; exit 1; fi
n=0
for file in "$MEDIA_DIR"/*.webp; do
  [ -f "$file" ] || { echo 'No WebP files found' >&2; exit 1; }
  name=$(basename "$file")
  printf 'Uploading %s...\n' "$name"
  curl --fail --silent --show-error --retry 3 --retry-delay 2 \
    --request PUT \
    --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    --header 'Content-Type: image/webp' \
    --data-binary @"$file" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/bikerblog-media/objects/editorial/$name" > /dev/null
  n=$((n + 1))
done
echo "$n media objects uploaded. Verify the bucket keys before enabling covers."
