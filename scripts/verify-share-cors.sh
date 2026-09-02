#!/usr/bin/env bash
# D1 + CORS — every published video, eight checks each, against production.
#
# The eight are the ones that decide whether a link renders as a card:
#   1 the crawler gets the crawler document
#   2 it carries a per-video og:title (not the site's generic one)
#   3 og:image is absolute https
#   4 the image is image/jpeg
#   5 the image is under WhatsApp's 300 KB ceiling
#   6 neither the document nor the image redirects
#   7 the GET is readable cross-origin        (Access-Control-Allow-Origin)
#   8 the PREFLIGHT is answerable             (Access-Control-Allow-Methods)
#
# 7 and 8 are the reason this file exists. A browser-side link preview — which
# is what a Mac makes — is a cross-origin fetch: it preflights first, and a
# preflight with no Allow-Methods is rejected before the GET is ever sent. The
# native Android and Windows clients do no CORS at all, which is why they showed
# the card throughout and a Mac showed a bare URL.
#
#   bash scripts/verify-share-cors.sh
set -uo pipefail

WEB="${WEB:-https://video-monetization-platform-chi.vercel.app}"
API="${API:-https://video-monetization-platform-production.up.railway.app}"
WA_UA="${WA_UA:-WhatsApp/2.24.15.78 N}"   # the macOS client, from our own telemetry
ORIGIN="https://web.whatsapp.com"

pass=0; fail=0
ok () { if [ "$1" = "1" ]; then pass=$((pass+1)); printf '    ok   %s\n' "$2"; else fail=$((fail+1)); printf '    FAIL %s\n' "$2"; fi; }

slugs=$(curl -s "$API/api/videos?limit=50" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);(j.videos||[]).forEach(v=>console.log(v.slug))})")

echo ""
echo "D1 + CORS · $(echo "$slugs" | grep -c .) published videos · $WEB"
echo ""

for slug in $slugs; do
  [ -z "$slug" ] && continue
  echo "  $slug"
  doc=$(mktemp); hdr=$(mktemp)
  curl -sD "$hdr" -o "$doc" -A "$WA_UA" "$WEB/watch/$slug"

  xdoc=$(tr -d '\r' < "$hdr" | awk 'tolower($1)=="x-doc:"{print $2}')
  [ "$xdoc" = "crawler" ] && ok 1 "1 crawler document" || ok 0 "1 crawler document (got '${xdoc:-none}')"

  title=$(grep -o 'property="og:title" content="[^"]*"' "$doc" | head -1 | sed 's/.*content="//;s/"$//')
  if [ -n "$title" ] && [ "$title" != "MTONYO+" ]; then ok 1 "2 per-video og:title — $title"; else ok 0 "2 per-video og:title (got '${title:-none}')"; fi

  img=$(grep -o 'property="og:image" content="[^"]*"' "$doc" | head -1 | sed 's/.*content="//;s/"$//')
  case "$img" in https://*) ok 1 "3 og:image absolute https" ;; *) ok 0 "3 og:image absolute https (got '${img:-none}')" ;; esac

  acao=$(tr -d '\r' < "$hdr" | grep -ci '^access-control-allow-origin')
  [ "$acao" -ge 1 ] && ok 1 "7 document readable cross-origin" || ok 0 "7 document readable cross-origin"

  if [ -n "$img" ]; then
    ihdr=$(mktemp)
    curl -sD "$ihdr" -o /dev/null -H "Origin: $ORIGIN" "$img"
    ct=$(tr -d '\r' < "$ihdr" | awk 'tolower($1)=="content-type:"{print $2}')
    len=$(tr -d '\r' < "$ihdr" | awk 'tolower($1)=="content-length:"{print $2}')
    iacao=$(tr -d '\r' < "$ihdr" | grep -ci '^access-control-allow-origin')
    case "$ct" in image/jpeg*) ok 1 "4 image/jpeg" ;; *) ok 0 "4 image/jpeg (got '${ct:-none}')" ;; esac
    if [ -n "$len" ] && [ "$len" -lt 307200 ]; then ok 1 "5 image ${len} B < 300 KB"; else ok 0 "5 image size (${len:-?} B)"; fi
    [ "$iacao" -ge 1 ] && ok 1 "7b image readable cross-origin" || ok 0 "7b image readable cross-origin"
    rd=$(curl -sL -o /dev/null -w '%{num_redirects}' "$img")
    [ "$rd" = "0" ] && ok 1 "6b image does not redirect" || ok 0 "6b image redirects ($rd)"
    rm -f "$ihdr"
  else
    ok 0 "4 image/jpeg (no og:image)"; ok 0 "5 image size"; ok 0 "7b image cross-origin"; ok 0 "6b image redirect"
  fi

  rd=$(curl -sL -o /dev/null -w '%{num_redirects}' -A "$WA_UA" "$WEB/watch/$slug")
  [ "$rd" = "0" ] && ok 1 "6 document does not redirect" || ok 0 "6 document redirects ($rd)"

  pm=$(curl -sD - -o /dev/null -X OPTIONS -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: GET' "$WEB/watch/$slug" \
       | tr -d '\r' | grep -i '^access-control-allow-methods' | grep -ci GET)
  [ "$pm" = "1" ] && ok 1 "8 preflight answers Allow-Methods: GET" || ok 0 "8 preflight answers Allow-Methods: GET"

  rm -f "$doc" "$hdr"
done

echo ""
echo "  $pass passed · $fail failed"
[ "$fail" = "0" ] || exit 1
