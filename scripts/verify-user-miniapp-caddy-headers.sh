#!/usr/bin/env bash
# =============================================================================
# PayEase User Mini App  Caddy Header Acceptance Probe (Bash, curl-based)
# Usage on Linux / macOS VPS operator:
#   bash scripts/verify-user-miniapp-caddy-headers.sh app.payease-example.kh
#
# All 8 checks MUST pass.  Any FAIL = do NOT flip production DNS.
# COMPAT: GNU bash 4.4+ (strict mode).  Passes `bash -n` syntax check.
# =============================================================================
set -u

HOST="${1:?Usage: $0 <mini-app-hostname>}"
BASE_URL="https://${HOST}/"
UA="PayEase-Caddy-Acceptance/1.0 (+https://${HOST}/security.txt)"
TMP_HEAD="$(mktemp)"
TMP_BODY="$(mktemp)"
FAIL=0

pass() { printf '\033[32m[PASS]\033[0m %s\n  %s\n' "$1" "${2:-}"; }
fail() { printf '\033[31m[FAIL]\033[0m %s\n  %s\n' "$1" "${2:-}"; FAIL=$((FAIL+1)); }

check() {
  local name="$1"
  local cond="$2"
  local d_ok="$3"
  local d_fail="$4"
  if eval "$cond"; then
    pass "$name" "$d_ok"
  else
    fail "$name" "$d_fail"
  fi
}

# Helper: trim leading/trailing whitespace
trim() {
  local s="$1"
  # remove leading
  s="${s#"${s%%[![:space:]]*}"}"
  # remove trailing
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# Helper: lower-case
to_lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

echo "== PayEase User Mini App Caddy Header Acceptance =="
echo "   Target: $BASE_URL"
echo "   UA    : $UA"
echo ""

# Fetch headers (follow redirects; we expect HSTS redirect chain to land on HTTPS 200)
curl -sS -I -L -o "$TMP_HEAD" -A "$UA" --max-time 20 "$BASE_URL"
STATUS_LAST=$(awk '/^HTTP\/[0-9.]+/ { s=$2 } END { print s }' "$TMP_HEAD")

check "01. HTTP status is 200 OK on / (SPA fallback)" \
    '[ "$STATUS_LAST" = "200" ]' \
    "Got $STATUS_LAST" \
    "Expected 200, got $STATUS_LAST"

# Normalize headers: fold continuation lines, lowercase names, one header per line
HDR=$(tr -d '\r' < "$TMP_HEAD" | awk '
  BEGIN { name = ""; value = "" }
  /^[^ \t]/ && /:/ {
    if (name != "") print name ": " value
    n = split($0, a, ":")
    name = tolower(a[1])
    value = a[2]
    for (i = 3; i <= n; i++) value = value ":" a[i]
    sub(/^ /, "", value)
    next
  }
  /^[ \t]/ { sub(/^[ \t]+/, " "); value = value $0 }
  END { if (name != "") print name ": " value }
')

get_header() {
  local key
  key=$(to_lower "$1")
  printf '%s\n' "$HDR" | awk -F': ' -v k="$key" '
    { n=tolower($1); if (n==k) { print substr($0, length(k)+3); exit } }
  '
}

XFO="$(get_header x-frame-options)"
check "02. X-Frame-Options header is NOT present (CSP frame-ancestors governs)" \
    '[ -z "$XFO" ]' \
    "Correctly absent" \
    "Present with value: $XFO"

CSP="$(get_header content-security-policy)"
check "03a. Content-Security-Policy header is PRESENT (HTTP, not meta only)" \
    '[ -n "$CSP" ]' \
    "Length: ${#CSP}" \
    "MISSING"

if [ -n "$CSP" ]; then
  # frame-ancestors extraction  iterate over semicolon-separated directives
  FA=""
  OLD_IFS=$IFS
  IFS=';'
  # shellcheck disable=SC2206
  set -- $CSP
  IFS=$OLD_IFS
  for piece in "$@"; do
    piece=$(trim "$piece")
    dname=$(printf '%s' "$piece" | awk '{print tolower($1)}')
    if [ "$dname" = "frame-ancestors" ]; then
      FA=$(printf '%s' "$piece" | awk '{ $1=""; sub(/^ +/, ""); print }')
      break
    fi
  done

  check "03b. CSP frame-ancestors has NO 'self' / NO 'none'" \
      '[ -n "$FA" ] && case " $FA " in *" '"'"'self'"'"' "*) false;; *" '"'"'none'"'"' "*) false;; *) true;; esac' \
      "frame-ancestors = $FA" \
      "frame-ancestors = ${FA:-MISSING} (must not contain 'self' or 'none')"

  # img-src extraction + EXACT-MATCH check:
  #   MUST contain ALL of  'self'  data:  https://t.me  https://www.t.me
  #   MUST NOT contain any other tokens.
  #   Fail on either side (missing tokens / extra tokens).
  IMG=""
  OLD_IFS=$IFS
  IFS=';'
  # shellcheck disable=SC2206
  set -- $CSP
  IFS=$OLD_IFS
  for piece in "$@"; do
    piece=$(trim "$piece")
    dname=$(printf '%s' "$piece" | awk '{print tolower($1)}')
    if [ "$dname" = "img-src" ]; then
      IMG=$(printf '%s' "$piece" | awk '{ $1=""; sub(/^ +/, ""); print }')
      break
    fi
  done

  IMG_MISSING=""
  IMG_BAD=""
  if [ -n "$IMG" ]; then
    # check required tokens presence
    for req in "'self'" data: https://t.me https://www.t.me; do
      found=0
      for tok in $IMG; do
        if [ "$tok" = "$req" ]; then found=1; break; fi
      done
      if [ "$found" -eq 0 ]; then IMG_MISSING="$IMG_MISSING $req"; fi
    done
    # check for extra tokens outside the required set
    for tok in $IMG; do
      case "$tok" in
        "'self'"|data:|https://t.me|https://www.t.me) ;;
        *) IMG_BAD="$IMG_BAD $tok" ;;
      esac
    done
  else
    # directive missing: all four tokens are missing
    IMG_MISSING=" 'self' data: https://t.me https://www.t.me"
  fi
  IMG_MISSING=$(trim "$IMG_MISSING")
  IMG_BAD=$(trim "$IMG_BAD")

  IMG_OK_DETAIL="img-src = $IMG"
  IMG_BAD_DETAIL="img-src = ${IMG:-MISSING}"
  if [ -n "$IMG_MISSING" ]; then
    IMG_OK_DETAIL="$IMG_OK_DETAIL  MISSING TOKENS: $IMG_MISSING"
    IMG_BAD_DETAIL="$IMG_BAD_DETAIL  MISSING TOKENS: $IMG_MISSING"
  fi
  if [ -n "$IMG_BAD" ]; then
    IMG_OK_DETAIL="$IMG_OK_DETAIL  UNEXPECTED TOKENS: $IMG_BAD"
    IMG_BAD_DETAIL="$IMG_BAD_DETAIL  UNEXPECTED TOKENS: $IMG_BAD"
  fi

  check "03c. CSP img-src contains EXACTLY ('self' data: https://t.me https://www.t.me) — all four, no extras" \
      '[ -n "$IMG" ] && [ -z "$IMG_MISSING" ] && [ -z "$IMG_BAD" ]' \
      "$IMG_OK_DETAIL" \
      "$IMG_BAD_DETAIL"

  # frame-ancestors origins shape check (no path, no trailing slash, no query)
  if [ -n "$FA" ]; then
    BAD_ORIGIN=""
    FA_COUNT=0
    for o in $FA; do
      case "$o" in
        http*)
          FA_COUNT=$((FA_COUNT+1))
          # strip scheme, check remainder contains only host[:port]
          rest="${o#http://}"
          rest="${rest#https://}"
          case "$rest" in
            */* | *\?* ) BAD_ORIGIN="$BAD_ORIGIN $o" ;;
          esac
          ;;
      esac
    done
    BAD_ORIGIN=$(trim "$BAD_ORIGIN")
    check "03d. frame-ancestors values are bare origins (no path, no trailing slash)" \
        '[ -z "$BAD_ORIGIN" ]' \
        "All OK (count=$FA_COUNT)" \
        "Bad entries: $BAD_ORIGIN"
  fi
fi

HSTS="$(get_header strict-transport-security)"
check "04. HSTS present with max-age>=1yr and includeSubDomains" \
    '[ -n "$HSTS" ] && [[ "$HSTS" =~ max-age=[0-9]{5,} ]] && [[ "$HSTS" =~ includeSubDomains ]]' \
    "$HSTS" \
    "${HSTS:-MISSING}"

XCTO="$(get_header x-content-type-options)"
XCTO_LC=$(to_lower "$XCTO")
check "05. X-Content-Type-Options = nosniff" \
    '[ "$XCTO_LC" = "nosniff" ]' \
    "$XCTO" \
    "${XCTO:-MISSING}"

PP="$(get_header permissions-policy)"
check "06. Permissions-Policy disables geolocation=() payment=()" \
    '[ -n "$PP" ] && [[ "$PP" == *"geolocation=()"* ]] && [[ "$PP" == *"payment=()"* ]]' \
    "$PP" \
    "${PP:-MISSING}"

RP="$(get_header referrer-policy)"
RP_LC=$(to_lower "$RP")
case "$RP_LC" in
  no-referrer|strict-origin-when-cross-origin|strict-origin) RP_OK=1 ;;
  *) RP_OK=0 ;;
esac
check "07. Referrer-Policy is strict (no-referrer / strict-origin / strict-origin-when-cross-origin)" \
    '[ "$RP_OK" = "1" ]' \
    "$RP" \
    "${RP:-MISSING}"

# ENV probe: ONLY 403 OR 404 counts as PASS.
# Timeout, connection refused, 000 status, or any other code (including
# 200 from SPA try_files fallback to index.html) -> FAIL.
ENV_STATUS=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" -A "$UA" --max-time 10 -I "https://${HOST}/.env" 2>/dev/null || echo "000")
# strip CR/LF if any
ENV_STATUS=$(printf '%s' "$ENV_STATUS" | tr -d '\r\n')
case "$ENV_STATUS" in
  403|404)
    ENV_OK=1
    ENV_DETAIL="HTTP $ENV_STATUS  (blocked correctly)"
    ;;
  000|'')
    ENV_OK=0
    ENV_DETAIL="NETWORK ERROR ($ENV_STATUS) — timeout / connection refused / DNS.  Does NOT count as secure."
    ;;
  *)
    ENV_OK=0
    ENV_DETAIL="HTTP $ENV_STATUS  (expected 403 or 404 only; 200 = SPA fallback leak)"
    ;;
esac
check "08. Hidden-file probe /.env returns HTTP 403 or 404 (no 200 fallback to SPA index.html)" \
    '[ "$ENV_OK" = "1" ]' \
    "$ENV_DETAIL" \
    "$ENV_DETAIL"

rm -f "$TMP_HEAD" "$TMP_BODY"

echo ""
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32mALL 8 CHECKS PASSED  Mini App Caddy boundary is production-ready.\033[0m\n'
  printf '\033[33m(Manual follow-up: Telegram Android/iOS/Web iframe probe of frame-ancestors list)\033[0m\n'
  exit 0
else
  printf '\033[31m%d CHECK(S) FAILED  DO NOT deploy this Caddy config to production.\033[0m\n' "$FAIL"
  exit 1
fi
