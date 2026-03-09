#!/bin/bash
# Deploy kin-haus to VPS
# Usage: ./deploy.sh

set -e

VPS="root@5.223.42.90"
APP_DIR="/var/www/kin-haus"
DATA_FILES="bookings.json overrides.json inquiries.json discount-codes.json pricing.json"

echo "==> Backing up runtime data on VPS..."
ssh $VPS "cd $APP_DIR && mkdir -p /tmp/kin-haus-backup && for f in $DATA_FILES; do [ -f data/\$f ] && cp data/\$f /tmp/kin-haus-backup/\$f && echo \"  backed up \$f\"; done; echo 'Backup complete'"

echo "==> Pulling latest code..."
ssh $VPS "cd $APP_DIR && git fetch origin main && git reset --hard origin/main && git clean -fd -e data/"

echo "==> Ensuring data/ directory exists..."
ssh $VPS "mkdir -p $APP_DIR/data"

echo "==> Restoring runtime data..."
ssh $VPS "for f in $DATA_FILES; do [ -f /tmp/kin-haus-backup/\$f ] && cp /tmp/kin-haus-backup/\$f $APP_DIR/data/\$f && echo \"  restored \$f\"; done; echo 'Restore complete'"

echo "==> Verifying data files exist..."
ssh $VPS "cd $APP_DIR && for f in $DATA_FILES; do [ -f data/\$f ] && echo \"  OK: data/\$f\" || echo \"  MISSING: data/\$f (will be created at runtime)\"; done"

echo "==> Installing dependencies..."
ssh $VPS "cd $APP_DIR && npm install 2>&1 | tail -1"

echo "==> Building..."
ssh $VPS "cd $APP_DIR && npm run build 2>&1 | tail -1"

echo "==> Restarting server..."
ssh $VPS "kill \$(pgrep -f 'entry.mjs') 2>/dev/null; sleep 2; cd $APP_DIR && HOST=0.0.0.0 PORT=3001 nohup node dist/server/entry.mjs > /var/log/kin-haus.log 2>&1 &" || true

sleep 3

echo "==> Verifying..."
STATUS=$(ssh $VPS "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/")
if [ "$STATUS" = "200" ]; then
  echo "Deploy complete! Server responding with 200."
else
  echo "WARNING: Server returned $STATUS"
fi
