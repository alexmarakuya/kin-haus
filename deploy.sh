#!/bin/bash
# Deploy kin-haus to VPS
# Usage: ./deploy.sh

set -e

VPS="root@5.223.42.90"
APP_DIR="/var/www/kin-haus"

echo "==> Backing up runtime data on VPS..."
ssh $VPS "cd $APP_DIR && mkdir -p /tmp/kin-haus-backup && cp data/overrides.json /tmp/kin-haus-backup/ 2>/dev/null; cp data/bookings.json /tmp/kin-haus-backup/ 2>/dev/null; cp data/inquiries.json /tmp/kin-haus-backup/ 2>/dev/null; cp data/discount-codes.json /tmp/kin-haus-backup/ 2>/dev/null; echo 'Backed up data files'"

echo "==> Pulling latest code..."
ssh $VPS "cd $APP_DIR && git fetch origin main && git reset --hard origin/main && git clean -fd -e data/"

echo "==> Restoring runtime data..."
ssh $VPS "cp /tmp/kin-haus-backup/overrides.json $APP_DIR/data/ 2>/dev/null; cp /tmp/kin-haus-backup/bookings.json $APP_DIR/data/ 2>/dev/null; cp /tmp/kin-haus-backup/inquiries.json $APP_DIR/data/ 2>/dev/null; cp /tmp/kin-haus-backup/discount-codes.json $APP_DIR/data/ 2>/dev/null; echo 'Restored data files'"

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
