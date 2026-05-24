#!/usr/bin/env bash
# check-privacy-routes.sh — verifica che inbox/ e attached_assets/ non siano
# raggiungibili tramite nessun endpoint pubblico dell'API server.
#
# Usage:
#   bash scripts/check-privacy-routes.sh
#   bash scripts/check-privacy-routes.sh --base-url http://localhost:80
#
# Exit code: 0 = tutto OK, 1 = almeno un path è esposto.

BASE_URL="${BASE_URL:-http://localhost:80}"
for arg in "$@"; do
  if [[ "$arg" == "--base-url" ]]; then shift; BASE_URL="$1"; fi
  shift 2>/dev/null || true
done

FAIL=0

check() {
  local label="$1"
  local url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  if [[ "$code" == "200" ]]; then
    echo "FAIL  $label  ($url) → $code (exposed!)"
    FAIL=1
  else
    echo "OK    $label  ($url) → $code"
  fi
}

echo "=== Privacy route regression check ==="
echo "Base URL: $BASE_URL"
echo ""

# inbox/ — must NOT return 200 from any API path
check "inbox via root"              "$BASE_URL/inbox/bikerlink-archived-tasks.json"
check "inbox via /api prefix"       "$BASE_URL/api/inbox/bikerlink-archived-tasks.json"
check "inbox clusters"              "$BASE_URL/inbox/clusters-merged-by-day.md"
check "inbox chat"                  "$BASE_URL/inbox/bikerlink-chat-latest.md"

# attached_assets/ — must NOT return 200
check "attached_assets via root"    "$BASE_URL/attached_assets/test.txt"
check "attached_assets via /api"    "$BASE_URL/api/attached_assets/test.txt"

# Sanity: /api/posts must return 200
label="sanity: /api/posts"
url="$BASE_URL/api/posts"
code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
if [[ "$code" == "200" ]]; then
  echo "OK    $label  ($url) → $code"
else
  echo "WARN  $label  ($url) → $code (API may be down)"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "All checks passed."
else
  echo "One or more paths are exposed. Review API route config."
fi

exit $FAIL
