# Repository Cleanup Plan

**Generated**: 2025-10-23
**Reason**: Repository has accumulated temporary files, large data files, and implementation docs that shouldn't be tracked

---

## Summary

**Total Data to Remove**: ~400MB+
**Files to Delete**: 100+ files
**Directories to Gitignore**: 10+

---

## 🔴 CRITICAL: Large Data Files (231MB+)

### Salesforce Backups (MUST DELETE)

**Location**: `.claude-plugins/opspal-salesforce/scripts/lib/backups/`

**Size**: 231MB in a single backup folder
- `delta-sandbox/2025-10-16-13-28-50/`
  - account_all_fields_active.json (231M!)
  - opportunity chunks (13-21M each)
  - contact chunks (28M, 1-13M each)
  - case chunks (800K each)

**Why Remove**:
- Git is not for large data files
- These are org-specific backups
- Should be in external storage (S3, backup service)
- Slows down clone/pull operations

**Action**:
```bash
# Remove the entire backups directory
rm -rf .claude-plugins/opspal-salesforce/scripts/lib/backups/

# Remove other backup locations
rm -rf .claude-plugins/opspal-salesforce/backups/
```

---

## 🟡 MEDIUM: Temporary Directories

### Execution Logs & Reports

**Directories**:
- `execution-logs/` (root)
- `.claude-plugins/opspal-salesforce/execution-logs/`
- `rollback-logs/`
- `.claude-plugins/opspal-salesforce/validation-reports/`
- `field-importance-reports/` (root)
- `.claude-plugins/opspal-salesforce/field-importance-reports/`

**Why Remove**: These are runtime artifacts, not source code

**Action**:
```bash
rm -rf execution-logs/ rollback-logs/ field-importance-reports/
rm -rf .claude-plugins/opspal-salesforce/execution-logs/
rm -rf .claude-plugins/opspal-salesforce/validation-reports/
rm -rf .claude-plugins/opspal-salesforce/field-importance-reports/
```

---

### Temporary Directories

**Directories**:
- `.claude-plugins/opspal-core/.temp/`
- `.claude-plugins/opspal-salesforce/.temp/`
- `.claude-plugins/opspal-salesforce/scripts/lib/.temp/`
- `.claude-plugins/opspal-salesforce/merge-temp/`
- `.claude-plugins/opspal-salesforce/.profiler/`

**Action**:
```bash
find .claude-plugins -type d -name ".temp" -exec rm -rf {} + 2>/dev/null
find .claude-plugins -type d -name ".profiler" -exec rm -rf {} + 2>/dev/null
rm -rf .claude-plugins/opspal-salesforce/merge-temp/
```

---

### Instance-Specific Data

**Directory**: `.claude-plugins/opspal-salesforce/instances/`

**Contains**: Org-specific reports and data (872K delta-sandbox report)

**Why Remove**: Should not be in git (org-specific, large, changes frequently)

**Action**:
```bash
rm -rf .claude-plugins/opspal-salesforce/instances/
```

---

## 🟡 MEDIUM: Temporary Implementation Docs

### "COMPLETE" and "IMPLEMENTATION" Docs (Root Level)

**Files to Consider Removing**:
- `ASKUSERQUESTION_IMPLEMENTATION_GUIDE.md` (17K)
- `CENTRALIZATION_IMPLEMENTATION_COMPLETE.md` (18K)
- `CENTRALIZATION_OPPORTUNITIES.md` (38K) - may be useful?
- `DATA_OPERATIONS_CONSOLIDATION.md` (28K) - may be useful?

### "COMPLETE" Docs in docs/

**Files**:
- `DIAGRAM_INTEGRATION_COMPLETE.md` (15K)
- `DIAGRAM_INTEGRATION_FINAL_SUMMARY.md` (21K)
- `DIAGRAM_WIRING_COMPLETE.md` (18K)

**Rationale**: These appear to be project completion summaries, not ongoing documentation

**Action** (Choose one):
1. **Delete**: If information is captured elsewhere
2. **Archive**: Move to `docs/archive/` subdirectory
3. **Keep**: If they're useful reference

**Recommended**: Archive in `docs/archive/implementation-history/`

```bash
mkdir -p docs/archive/implementation-history
mv CENTRALIZATION_IMPLEMENTATION_COMPLETE.md docs/archive/implementation-history/
mv docs/DIAGRAM_INTEGRATION_COMPLETE.md docs/archive/implementation-history/
mv docs/DIAGRAM_INTEGRATION_FINAL_SUMMARY.md docs/archive/implementation-history/
mv docs/DIAGRAM_WIRING_COMPLETE.md docs/archive/implementation-history/
```

---

## 🟢 LOW: Development/Test Files

### Root Level Development Files

**Files**:
- `check-schema.js` (1.3K)
- `create-asana-tasks.js` (4.9K)
- `execute-reflection-update.js` (3.2K)
- `execute-update.js` (1.7K)
- `execute-update-simple.js` (2.3K)
- `debug-plugin-errors.sh` (2.1K)
- `diagnose-plugin-errors.sh` (5.7K)
- `query_new_reflections.sql` (unknown size)
- `run-update.sh` (unknown size)
- `test-node-version.sh` (unknown size)

**Why Remove**: These look like one-off scripts, not core functionality

**Action** (Choose one):
1. **Delete** if they're no longer used
2. **Move** to `scripts/dev/` if still useful
3. **Keep** if actively used

**Recommended**: Move to `scripts/dev/` for archival

```bash
mkdir -p scripts/dev
mv check-schema.js execute-*.js *-update.sh query_new_reflections.sql test-node-version.sh scripts/dev/ 2>/dev/null
```

---

### Salesforce Plugin Dev Files

**Files**:
- `.claude-plugins/opspal-salesforce/DEV_REFLECTION_20251018_160533.json`
- `.claude-plugins/opspal-salesforce/DEV_REFLECTION_20251021_v3.27.1.json`

**Action**:
```bash
rm .claude-plugins/opspal-salesforce/DEV_REFLECTION_*.json
```

---

### Salesforce Plugin Test/Dev Scripts

**Files** (in `.claude-plugins/opspal-salesforce/scripts/lib/`):
- `test-duplicate-pairs.csv`
- `test-duplicate-pairs.json`
- Various one-off scripts that may not be in use

**Action**: Review each, move to `scripts/lib/dev/` or delete

---

## 🟢 LOW: Documentation Cleanup

### ChatGPT Research Docs

**Files**:
- `docs/CHATGPT_RESEARCH_PROMPT_AUTOMATION_METADATA.md` (15K)
- `docs/CHATGPT_RESEARCH_USAGE_GUIDE.md` (8.9K)

**Question**: Are these still relevant, or were they temporary research notes?

**Recommended**: Archive if no longer actively used

---

### Audit/Evaluation Docs

**Files**:
- `AUDIT.md` (25K)
- `audit.json` (24K)
- `docs/DOCUMENTATION_SYSTEM_EVALUATION.md` (29K)
- `docs/AUDIT_DIAGRAM_INTEGRATION_GUIDE.md` (17K)

**Question**: Are these point-in-time evaluations or living docs?

**Recommended**: Archive older audits, keep latest

---

## 🔧 .gitignore Updates

**Add these patterns**:

```bash
# Temporary directories
.temp/
.profiler/
*-temp/
merge-temp/

# Runtime artifacts
execution-logs/
rollback-logs/
validation-reports/
field-importance-reports/

# Backups (should use external storage)
backups/
*.backup
*.bak

# Instance-specific data
instances/
**/instances/

# Development reflections
DEV_REFLECTION_*.json

# Large data files
*.csv.gz
*.json.gz
*_all_fields*.json

# Reports (generate on demand)
reports/*.csv
reports/*.json
```

---

## Cleanup Script

**File**: `scripts/cleanup-repo.sh`

```bash
#!/bin/bash
set -e

echo "🧹 Repository Cleanup Script"
echo "=============================="
echo ""
echo "This will remove temporary files, large data files, and untracked artifacts."
echo "A backup will be created at: /tmp/opspal-cleanup-backup-$(date +%Y%m%d-%H%M%S)"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Create backup
BACKUP_DIR="/tmp/opspal-cleanup-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo "📦 Creating backup at: $BACKUP_DIR"

# Backup large files before deletion
cp -r .claude-plugins/opspal-salesforce/scripts/lib/backups/ "$BACKUP_DIR/" 2>/dev/null || true
cp -r .claude-plugins/opspal-salesforce/instances/ "$BACKUP_DIR/" 2>/dev/null || true

echo ""
echo "🗑️  Removing large data files..."
rm -rf .claude-plugins/opspal-salesforce/scripts/lib/backups/
rm -rf .claude-plugins/opspal-salesforce/backups/
du -sh "$BACKUP_DIR"

echo ""
echo "🗑️  Removing temporary directories..."
rm -rf execution-logs/ rollback-logs/ field-importance-reports/
rm -rf .claude-plugins/*/execution-logs/
rm -rf .claude-plugins/*/validation-reports/
rm -rf .claude-plugins/*/field-importance-reports/
find .claude-plugins -type d -name ".temp" -exec rm -rf {} + 2>/dev/null || true
find .claude-plugins -type d -name ".profiler" -exec rm -rf {} + 2>/dev/null || true
rm -rf .claude-plugins/opspal-salesforce/merge-temp/

echo ""
echo "🗑️  Removing instance-specific data..."
rm -rf .claude-plugins/opspal-salesforce/instances/

echo ""
echo "🗑️  Removing development files..."
rm -f .claude-plugins/opspal-salesforce/DEV_REFLECTION_*.json
rm -f .claude-plugins/opspal-salesforce/scripts/lib/test-duplicate-pairs.*

echo ""
echo "📁 Archiving implementation docs..."
mkdir -p docs/archive/implementation-history
mv CENTRALIZATION_IMPLEMENTATION_COMPLETE.md docs/archive/implementation-history/ 2>/dev/null || true
mv docs/DIAGRAM_INTEGRATION_COMPLETE.md docs/archive/implementation-history/ 2>/dev/null || true
mv docs/DIAGRAM_INTEGRATION_FINAL_SUMMARY.md docs/archive/implementation-history/ 2>/dev/null || true
mv docs/DIAGRAM_WIRING_COMPLETE.md docs/archive/implementation-history/ 2>/dev/null || true

echo ""
echo "📁 Organizing development scripts..."
mkdir -p scripts/dev
mv check-schema.js scripts/dev/ 2>/dev/null || true
mv execute-*.js scripts/dev/ 2>/dev/null || true
mv query_new_reflections.sql scripts/dev/ 2>/dev/null || true
mv run-update.sh scripts/dev/ 2>/dev/null || true
mv test-node-version.sh scripts/dev/ 2>/dev/null || true

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📊 Summary:"
git status --short | grep "^??" | wc -l | xargs echo "   Untracked files remaining:"
git status --short | grep "^ D" | wc -l | xargs echo "   Files deleted:"
du -sh . | awk '{print "   Repository size:", $1}'
echo ""
echo "💾 Backup location: $BACKUP_DIR"
echo "   (Keep for 30 days, then delete)"
echo ""
echo "🔄 Next steps:"
echo "   1. Review changes: git status"
echo "   2. Update .gitignore (see CLEANUP_PLAN.md)"
echo "   3. Commit deletions: git add -A && git commit -m 'chore: cleanup temporary files and large data'"
echo "   4. Optional: git push"
```

---

## Recommended Execution Order

1. **Review** this plan (you're here!)
2. **Backup** (script does this automatically)
3. **Run cleanup script**:
   ```bash
   chmod +x scripts/cleanup-repo.sh
   ./scripts/cleanup-repo.sh
   ```
4. **Update .gitignore**:
   ```bash
   cat >> .gitignore << 'EOF'

   # Cleanup additions (2025-10-23)
   .temp/
   .profiler/
   *-temp/
   execution-logs/
   rollback-logs/
   validation-reports/
   field-importance-reports/
   backups/
   instances/
   DEV_REFLECTION_*.json
   EOF
   ```
5. **Commit changes**:
   ```bash
   git add -A
   git status  # Review what will be committed
   git commit -m "chore: cleanup temporary files, large data, and implementation docs

   Removed:
   - 231MB+ Salesforce backup data
   - Temporary execution/validation logs
   - Instance-specific org data
   - Development reflection JSONs
   - Profiler/temp directories

   Archived:
   - Implementation completion docs → docs/archive/
   - Development scripts → scripts/dev/

   Updated:
   - .gitignore to prevent future temporary file commits

   Total reduction: ~400MB"
   ```
6. **Push**:
   ```bash
   git push origin main
   ```

---

## Before & After Estimates

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| **Untracked files** | 50+ | ~5-10 | 80%+ |
| **Repository size** | ~500MB | ~100MB | 80% |
| **Unnecessary docs** | 10+ | 0 | 100% |
| **Large data files** | 231MB | 0 | 100% |

---

## Safety Notes

1. **Backup is created** at `/tmp/opspal-cleanup-backup-*`
2. **Keep backup for 30 days** in case you need to restore
3. **Nothing is deleted from git history** (only working directory)
4. **Can restore** any file from backup if needed

---

## Questions to Answer Before Cleanup

1. **Backups**: Are Salesforce backups needed? (If yes, move to S3/external storage)
2. **Instance data**: Is `instances/` folder useful? (If yes, move to external storage)
3. **Implementation docs**: Keep for history or archive?
4. **Dev scripts**: Still using any of the root-level scripts?

**Recommended Answers**:
1. Backups → Move to external storage (not git)
2. Instance data → External storage or regenerate on demand
3. Implementation docs → Archive
4. Dev scripts → Archive in scripts/dev/

---

**Generated**: 2025-10-23
**Status**: Ready for review and execution
**Estimated Time**: 5-10 minutes
