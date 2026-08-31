#!/usr/bin/env bash
# Verify WhatsApp/Facebook link preview pipeline.
# Usage: ./scripts/verify-share-previews.sh [slug]

set -euo pipefail

SLUG="${1:-how-to-cook-pilau-properly}"
WEB="${PUBLIC_WEB_URL:-https://video-monetization-platform-chi.vercel.app}"
API="${SERVER_PUBLIC_URL:-https://video-monetization-platform-production.up.railway.app}"

echo "=== 1. OG HTML (all user agents must match) ==="
for UA in \
  "WhatsApp/2.23.20.0 A" \
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" \
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"; do
  echo "--- UA: $UA"
  curl -sS -A "$UA" "${WEB}/watch/${SLUG}" | grep -E 'og:(title|image|description)' || true
done

echo ""
echo "=== 2. Share meta JSON ==="
curl -sS "${API}/api/public/videos/${SLUG}/share-meta" | head -c 500
echo ""

META=$(curl -sS "${API}/api/public/videos/${SLUG}/share-meta")
CARD_URL=$(echo "$META" | grep -o '"cardUrl":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "cardUrl=$CARD_URL"

echo ""
echo "=== 3. Image headers ==="
if [ -n "$CARD_URL" ]; then
  curl -sSI "$CARD_URL" | grep -iE 'HTTP/|content-type|content-length|cache-control|x-share-card|location'
fi

echo ""
echo "=== 4. HTML latency (3 runs) ==="
for i in 1 2 3; do
  curl -so /dev/null -w "html %{time_total}s\n" -A "WhatsApp/2.23.20.0 A" "${WEB}/watch/${SLUG}"
done

echo ""
echo "=== 5. Generic og:title check (should be 0) ==="
curl -sS "${WEB}/watch/${SLUG}" | grep -c 'property="og:title" content="MTONYO+"' || true
