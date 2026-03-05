#!/usr/bin/env bash
# Deploy script - two-step deployment with confirmation
# Requires ENABLE_WRITE=1 and human confirmation

source scripts/lib/guard.sh

echo "
═══════════════════════════════════════════════════════════════
DEPLOYMENT: $ORG
═══════════════════════════════════════════════════════════════"

# Step 1: Dry-run (always safe)
echo "
Step 1: Running dry-run validation..."
sf project deploy start -o "$ORG" \
  --dry-run \
  --source-dir force-app \
  --verbose \
  --wait 10

if [ $? -ne 0 ]; then
    echo "
❌ Dry-run failed. Fix issues before deploying.
"
    exit 1
fi

echo "
✅ Dry-run successful!"

# Step 2: Check write permission
if [[ "${ENABLE_WRITE}" != "1" ]]; then
    echo "
🔒 Refusing to deploy: ENABLE_WRITE=0
   To deploy, set: export ENABLE_WRITE=1
"
    exit 2
fi

# Step 3: Human confirmation
echo "
⚠️  READY TO DEPLOY TO: $ORG

This will deploy:
• Source directory: force-app
• Test level: RunLocalTests
• Target org: $ORG
• API version: $API_VERSION
"

read -r -p "Type CONFIRM to deploy to $ORG: " ACK
if [[ "$ACK" != "CONFIRM" ]]; then
    echo "
Deployment cancelled.
"
    exit 3
fi

# Step 4: Create pre-deployment backup
echo "
Creating pre-deployment backup..."
./scripts/backup.sh

# Step 5: Actual deployment
echo "
Deploying to $ORG..."
sf project deploy start -o "$ORG" \
  --source-dir force-app \
  --test-level RunLocalTests \
  --wait 30 \
  --verbose

if [ $? -eq 0 ]; then
    echo "
✅ Deployment successful!
"
else
    echo "
❌ Deployment failed. Rollback available in backups/
"
    exit 4
fi

echo "
═══════════════════════════════════════════════════════════════
"