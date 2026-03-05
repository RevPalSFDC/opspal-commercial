#!/bin/bash
set -e

echo "🧹 OpsPal Repository Cleanup Script"
echo "===================================="
echo ""
echo "This will remove:"
echo "  • 231MB+ of Salesforce backup data"
echo "  • Temporary directories (.temp, .profiler, merge-temp)"
echo "  • Execution/validation logs"
echo "  • Instance-specific data"
echo "  • Development reflection JSONs"
echo ""
echo "A backup will be created at: /tmp/opspal-cleanup-backup-$(date +%Y%m%d-%H%M%S)"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted."
    exit 1
fi

# Create backup
BACKUP_DIR="/tmp/opspal-cleanup-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo ""
echo "📦 Creating backup..."

# Backup large/important data before deletion
echo "   Backing up: salesforce-plugin backups..."
cp -r .claude-plugins/salesforce-plugin/scripts/lib/backups/ "$BACKUP_DIR/sfdc-backups" 2>/dev/null || echo "   (no lib backups)"
cp -r .claude-plugins/salesforce-plugin/backups/ "$BACKUP_DIR/sfdc-backups-root" 2>/dev/null || echo "   (no root backups)"

echo "   Backing up: salesforce-plugin instances..."
cp -r .claude-plugins/salesforce-plugin/instances/ "$BACKUP_DIR/instances" 2>/dev/null || echo "   (no instances)"

echo "   Backing up: logs and reports..."
cp -r execution-logs/ "$BACKUP_DIR/execution-logs" 2>/dev/null || echo "   (no execution-logs)"
cp -r rollback-logs/ "$BACKUP_DIR/rollback-logs" 2>/dev/null || echo "   (no rollback-logs)"
cp -r field-importance-reports/ "$BACKUP_DIR/field-importance-reports" 2>/dev/null || echo "   (no field reports)"

BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | awk '{print $1}')
echo "   ✅ Backup created: $BACKUP_SIZE"
echo ""

# Start cleanup
echo "🗑️  Starting cleanup..."
echo ""

# 1. Large data files (CRITICAL)
echo "1️⃣  Removing large Salesforce backup data..."
rm -rf .claude-plugins/salesforce-plugin/scripts/lib/backups/ 2>/dev/null && echo "   ✅ Removed scripts/lib/backups/" || echo "   (already removed)"
rm -rf .claude-plugins/salesforce-plugin/backups/ 2>/dev/null && echo "   ✅ Removed backups/" || echo "   (already removed)"

# 2. Temporary directories
echo ""
echo "2️⃣  Removing temporary directories..."
find .claude-plugins -type d -name ".temp" -exec rm -rf {} + 2>/dev/null && echo "   ✅ Removed .temp directories" || echo "   (no .temp dirs)"
find .claude-plugins -type d -name ".profiler" -exec rm -rf {} + 2>/dev/null && echo "   ✅ Removed .profiler directories" || echo "   (no .profiler dirs)"
rm -rf .claude-plugins/salesforce-plugin/merge-temp/ 2>/dev/null && echo "   ✅ Removed merge-temp/" || echo "   (already removed)"
rm -rf .claude-plugins/cross-platform-plugin/.temp/ 2>/dev/null && echo "   ✅ Removed cross-platform .temp/" || echo "   (already removed)"

# 3. Execution logs and reports
echo ""
echo "3️⃣  Removing execution logs and reports..."
rm -rf execution-logs/ 2>/dev/null && echo "   ✅ Removed execution-logs/" || echo "   (already removed)"
rm -rf rollback-logs/ 2>/dev/null && echo "   ✅ Removed rollback-logs/" || echo "   (already removed)"
rm -rf field-importance-reports/ 2>/dev/null && echo "   ✅ Removed field-importance-reports/" || echo "   (already removed)"
rm -rf .claude-plugins/salesforce-plugin/execution-logs/ 2>/dev/null && echo "   ✅ Removed sfdc execution-logs/" || echo "   (already removed)"
rm -rf .claude-plugins/salesforce-plugin/validation-reports/ 2>/dev/null && echo "   ✅ Removed sfdc validation-reports/" || echo "   (already removed)"
rm -rf .claude-plugins/salesforce-plugin/field-importance-reports/ 2>/dev/null && echo "   ✅ Removed sfdc field-importance-reports/" || echo "   (already removed)"

# 4. Instance-specific data
echo ""
echo "4️⃣  Removing instance-specific data..."
rm -rf .claude-plugins/salesforce-plugin/instances/ 2>/dev/null && echo "   ✅ Removed instances/" || echo "   (already removed)"

# 5. Development files
echo ""
echo "5️⃣  Removing development files..."
rm -f .claude-plugins/salesforce-plugin/DEV_REFLECTION_*.json 2>/dev/null && echo "   ✅ Removed DEV_REFLECTION_*.json" || echo "   (already removed)"
rm -f .claude-plugins/salesforce-plugin/scripts/lib/test-duplicate-pairs.* 2>/dev/null && echo "   ✅ Removed test-duplicate-pairs.*" || echo "   (already removed)"

# 6. Archive implementation docs
echo ""
echo "6️⃣  Archiving implementation completion docs..."
mkdir -p docs/archive/implementation-history
ARCHIVED=0

for doc in CENTRALIZATION_IMPLEMENTATION_COMPLETE.md ASKUSERQUESTION_IMPLEMENTATION_GUIDE.md; do
  if [ -f "$doc" ]; then
    mv "$doc" docs/archive/implementation-history/ && ARCHIVED=$((ARCHIVED+1))
  fi
done

for doc in DIAGRAM_INTEGRATION_COMPLETE.md DIAGRAM_INTEGRATION_FINAL_SUMMARY.md DIAGRAM_WIRING_COMPLETE.md; do
  if [ -f "docs/$doc" ]; then
    mv "docs/$doc" docs/archive/implementation-history/ && ARCHIVED=$((ARCHIVED+1))
  fi
done

echo "   ✅ Archived $ARCHIVED implementation docs"

# 7. Organize dev scripts
echo ""
echo "7️⃣  Organizing development scripts..."
mkdir -p scripts/dev
MOVED=0

for script in check-schema.js execute-*.js create-asana-tasks.js run-update.sh test-node-version.sh query_new_reflections.sql; do
  if [ -f "$script" ]; then
    mv "$script" scripts/dev/ 2>/dev/null && MOVED=$((MOVED+1))
  fi
done

echo "   ✅ Moved $MOVED scripts to scripts/dev/"

# Summary
echo ""
echo "======================================"
echo "✅ Cleanup complete!"
echo ""
echo "📊 Summary:"
BEFORE_SIZE=$(du -sh "$BACKUP_DIR" | awk '{print $1}')
AFTER_UNTRACKED=$(git status --porcelain | grep "^??" | wc -l)
AFTER_DELETED=$(git status --porcelain | grep "^ D" | wc -l)

echo "   Backup size: $BEFORE_SIZE"
echo "   Untracked files remaining: $AFTER_UNTRACKED"
echo "   Files deleted: $AFTER_DELETED"
echo "   Repository cleaner: ✅"
echo ""
echo "💾 Backup location: $BACKUP_DIR"
echo "   (Keep for 30 days, then delete)"
echo ""
echo "🔄 Next steps:"
echo "   1. Review changes: git status"
echo "   2. Update .gitignore (see CLEANUP_PLAN.md for patterns)"
echo "   3. Commit deletions: git add -A"
echo "   4. Commit message: git commit -m 'chore: cleanup temporary files'"
echo "   5. Push: git push"
echo ""
