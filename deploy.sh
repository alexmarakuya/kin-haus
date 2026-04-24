#!/bin/bash
# Deploy kin-haus to VPS
# Usage: ./deploy.sh [staging]
#   ./deploy.sh           → production (kinhaus.space, port 3004)
#   ./deploy.sh staging   → staging (staging.kinhaus.space, port 3002)

set -e

VPS="root@5.223.42.90"
DATA_FILES="bookings.json overrides.json inquiries.json discount-codes.json pricing.json guests.json housekeepers.json housekeeping.json airbnb-archive.json chat-session.json expenses.json incomes.json"

ENV="${1:-production}"

if [ "$ENV" = "staging" ]; then
  APP_DIR="/var/www/kin-haus-staging"
  PORT=3002
  LOG="/var/log/kin-haus-staging.log"
  BACKUP_DIR="/tmp/kin-haus-staging-backup"
  LABEL="STAGING"
else
  APP_DIR="/var/www/kin-haus"
  PORT=3004
  LOG="/var/log/kin-haus.log"
  BACKUP_DIR="/tmp/kin-haus-backup"
  LABEL="PRODUCTION"
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

echo "==> Restarting server via PM2..."
ssh $VPS "
  cd $APP_DIR
  APP_NAME=$( [ '$ENV' = 'staging' ] && echo 'kin-haus-staging' || echo 'kin-haus' )
  if pm2 describe \$APP_NAME > /dev/null 2>&1; then
    pm2 reload ecosystem.config.cjs --only \$APP_NAME --update-env
    echo '  PM2 reload complete'
  else
    pm2 start ecosystem.config.cjs --only \$APP_NAME
    pm2 save
    echo '  PM2 start complete (first run)'
  fi
"

sleep 3

echo "==> Verifying..."
STATUS=$(ssh $VPS "curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/")
if [ "$STATUS" = "200" ]; then
  echo "$LABEL deploy complete! Server responding with 200 on port $PORT."
else
  echo "WARNING: $LABEL server returned $STATUS (check: pm2 logs kin-haus)"
fi
