#!/bin/bash
# Deploy kin-haus to VPS
# Usage: ./deploy.sh [staging]
#   ./deploy.sh           → production (kinhaus.space, port 3004)
#   ./deploy.sh staging   → staging (staging.kinhaus.space, port 3002)

set -e

VPS="root@5.223.42.90"
DATA_FILES="bookings.json overrides.json inquiries.json discount-codes.json pricing.json guests.json housekeepers.json housekeeping.json airbnb-archive.json chat-session.json expenses.json incomes.json admin-tasks.json"

ENV="${1:-production}"

if [ "$ENV" = "staging" ]; then
  APP_DIR="/var/www/kin-haus-staging"
  PORT=3002
  BACKUP_DIR="/tmp/kin-haus-staging-backup"
  LABEL="STAGING"
  APP_NAME="kin-haus-staging"
else
  APP_DIR="/var/www/kin-haus"
  PORT=3004
  BACKUP_DIR="/tmp/kin-haus-backup"
  LABEL="PRODUCTION"
  APP_NAME="kin-haus"
fi

echo "==> Deploying to $LABEL ($APP_DIR, port $PORT)"

echo "==> Backing up runtime data..."
ssh $VPS "cd $APP_DIR && mkdir -p $BACKUP_DIR && for f in $DATA_FILES; do [ -f data/\$f ] && cp data/\$f $BACKUP_DIR/\$f && echo \"  backed up \$f\"; done; [ -d data/receipts ] && cp -r data/receipts $BACKUP_DIR/receipts && echo '  backed up receipts/'; echo 'Backup complete'"

echo "==> Pulling latest code..."
ssh $VPS "cd $APP_DIR && git fetch origin main && git reset --hard origin/main && git clean -fd -e data/"

echo "==> Ensuring data/ directory exists..."
ssh $VPS "mkdir -p $APP_DIR/data"

echo "==> Restoring runtime data..."
ssh $VPS "for f in $DATA_FILES; do [ -f $BACKUP_DIR/\$f ] && cp $BACKUP_DIR/\$f $APP_DIR/data/\$f && echo \"  restored \$f\"; done; [ -d $BACKUP_DIR/receipts ] && rm -rf $APP_DIR/data/receipts && cp -r $BACKUP_DIR/receipts $APP_DIR/data/receipts && echo '  restored receipts/'; echo 'Restore complete'"

echo "==> Verifying data files exist..."
ssh $VPS "cd $APP_DIR && for f in $DATA_FILES; do [ -f data/\$f ] && echo \"  OK: data/\$f\" || echo \"  MISSING: data/\$f (will be created at runtime)\"; done"

echo "==> Installing dependencies..."
ssh $VPS "cd $APP_DIR && npm install 2>&1 | tail -1"

echo "==> Building..."
ssh $VPS "cd $APP_DIR && npm run build 2>&1 | tail -1"

echo "==> Restarting server via systemd..."
ssh $VPS "systemctl restart $APP_NAME && echo '  systemctl restart complete'"

echo "==> Verifying (up to 5 attempts)..."
for i in 1 2 3 4 5; do
  sleep 3
  STATUS=$(ssh $VPS "curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/")
  if [ "$STATUS" = "200" ]; then
    echo "$LABEL deploy complete! Server responding with 200 on port $PORT."
    exit 0
  fi
  echo "  Attempt $i: got $STATUS, retrying..."
done

# All attempts failed — print logs and exit non-zero so the caller knows
echo ""
echo "ERROR: $LABEL server did not come up after 5 attempts (last status: $STATUS)"
echo "--- Last 30 lines of PM2 error log ---"
ssh $VPS "pm2 logs $APP_NAME --lines 30 --nostream --err 2>/dev/null || cat /var/log/${APP_NAME}-error.log 2>/dev/null | tail -30 || echo '(no logs found)'"
exit 1
