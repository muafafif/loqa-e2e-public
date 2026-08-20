#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGROK_API="http://localhost:4040/api/tunnels"
PORT=8080
ENV_FILE="$SCRIPT_DIR/.env"

cleanup() {
  echo ""
  echo "Shutting down ngrok..."
  [ -n "$NGROK_PID" ] && kill "$NGROK_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting ngrok tunnel..."
ngrok http "$PORT" --log=stdout > /tmp/ngrok-loqa.log 2>&1 &
NGROK_PID=$!

echo "Waiting for ngrok..."
for i in $(seq 1 30); do
  NGROK_URL=$(curl -s "$NGROK_API" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for t in data.get('tunnels', []):
        if t.get('proto') == 'https':
            print(t['public_url'])
            break
except:
    pass
" 2>/dev/null)
  [ -n "$NGROK_URL" ] && break
  sleep 1
done

if [ -z "$NGROK_URL" ]; then
  echo "ERROR: Could not get ngrok URL."
  exit 1
fi

echo "Ngrok URL: $NGROK_URL"

XENDIT_API_KEY=$(grep -E '^XENDIT_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
if [ -n "$XENDIT_API_KEY" ]; then
  register_webhook() {
    local endpoint="$1"
    local url="$2"
    local label="$3"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      "https://api.xendit.co/callback_urls/$endpoint" \
      -u "$XENDIT_API_KEY:" \
      -H "Content-Type: application/json" \
      -d "{\"url\": \"$url\"}")
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
      echo "Xendit $label webhook registered: $url"
    else
      echo "WARNING: Xendit $label webhook registration failed (HTTP $STATUS)"
    fi
  }

  register_webhook "invoice" "$NGROK_URL/webhooks/xendit/invoice" "invoice"
  register_webhook "recurring" "$NGROK_URL/webhooks/xendit/recurring" "recurring"
else
  echo "WARNING: XENDIT_API_KEY not found in .env — skipping webhook registration"
fi

echo ""
echo "Ready. NGROK_URL = $NGROK_URL"
echo "Webhook endpoint: $NGROK_URL/webhooks/xendit/invoice"
echo "Press Ctrl+C to stop."
echo ""

wait "$NGROK_PID"
