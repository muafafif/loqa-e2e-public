#!/bin/bash
# Usage:
#   ./start.sh             → start shell launcher (port 3001)
#   ./start.sh personal    → start personal app (backend:8000 + frontend:3000)
#   ./start.sh business    → start business app (backend:8001 + frontend:3002)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-shell}"

cleanup() {
  echo ""
  echo "Stopping KnowledgeAI..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

if [ "$MODE" = "personal" ]; then
  BACKEND_DIR="$SCRIPT_DIR/apps/personal/backend"
  FRONTEND_DIR="$SCRIPT_DIR/apps/personal/frontend"
  VENV="$BACKEND_DIR/.venv/bin/python"
  BACKEND_PORT=8000
  FRONTEND_PORT=3000
  LABEL="Personal"

elif [ "$MODE" = "business" ]; then
  BACKEND_DIR="$SCRIPT_DIR/apps/business/backend"
  FRONTEND_DIR="$SCRIPT_DIR/apps/business/frontend"
  VENV="$BACKEND_DIR/.venv/bin/python"
  BACKEND_PORT=8001
  FRONTEND_PORT=3002
  LABEL="Business"

else
  # Shell launcher
  SHELL_DIR="$SCRIPT_DIR/shell/frontend"
  echo "Starting KnowledgeAI Shell..."
  (cd "$SHELL_DIR" && npm run dev -- --port 3001) &
  echo "Waiting for shell..."
  for i in $(seq 1 30); do
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
      echo "KnowledgeAI Shell is running at http://localhost:3001"
      open "http://localhost:3001"
      break
    fi
    sleep 1
  done
  wait
  exit 0
fi

echo "Starting $LABEL backend on port $BACKEND_PORT..."
(cd "$BACKEND_DIR" && "$VENV" -m uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT --log-level error) &

echo "Starting $LABEL frontend on port $FRONTEND_PORT..."
(cd "$FRONTEND_DIR" && npm run dev -- --port $FRONTEND_PORT) &

echo "Waiting for $LABEL app..."
for i in $(seq 1 30); do
  if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
    echo "KnowledgeAI $LABEL is running at http://localhost:$FRONTEND_PORT"
    open "http://localhost:$FRONTEND_PORT"
    break
  fi
  sleep 1
done

wait
