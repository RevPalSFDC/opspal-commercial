# Salesforce Content Consolidation Plan

## Current State Analysis

### Directories with Potential SFDC Content

1. **`/instances/` directory** (Main Agents folder)
   - Contains 4 Salesforce instances:
     - peregrine-staging (1 file)
     - rentable-production (16 files)
     - rentable-sandbox (30 files)
     - wedgewood-production (12 files)
   - These appear to be older/partial versions
   - The `platforms/SFDC/instances/` has the same instances with MORE files (238, 22, 2385, 153 respectively)

2. **`/Salesforce/` directory**
   - Contains: `instances/peregrine-staging/`
   - Appears to be another duplicate/older version

3. **`/Agents/` directory**
   - Contains: `package.xml` (Salesforce metadata file)

4. **`/error-logging/` directory**
   - Generic structure (database, logs, patterns, reports)
   - Different from `platforms/SFDC/error-logging` which has SFDC-specific additions

## Recommended Actions

### 1. Instance Directories Consolidation
**Priority: HIGH**

The instances in `/home/chris/Desktop/RevPal/Agents/instances/` appear to be older versions that should be consolidated:

```bash
# These directories should be reviewed and merged:
/instances/peregrine-staging     → /platforms/SFDC/instances/peregrine-staging
/instances/rentable-production   → /platforms/SFDC/instances/rentable-production
/instances/rentable-sandbox      → /platforms/SFDC/instances/rentable-sandbox
/instances/wedgewood-production  → /platforms/SFDC/instances/wedgewood-production
```

**Action Steps:**
1. Compare files to identify unique content
2. Merge any unique files into platforms/SFDC/instances/
3. Archive the old instances directory
4. Create symlinks if needed for backward compatibility

### 2. Salesforce Directory
**Priority: MEDIUM**

```bash
/Salesforce/instances/peregrine-staging → /platforms/SFDC/instances/peregrine-staging
```

This appears to be another duplicate that should be removed after verification.

### 3. Stray SFDC Files
**Priority: LOW**

- `/Agents/package.xml` - Should be moved to appropriate SFDC location or removed if outdated

### 4. Error Logging
**Priority: LOW**

The `/error-logging/` directory appears to be a generic template, while `/platforms/SFDC/error-logging/` has SFDC-specific implementations. No action needed unless you want to remove the generic template.

## Migration Commands

```bash
# 1. Create comprehensive backup first
tar -czf /tmp/sfdc_consolidation_backup_$(date +%Y%m%d).tar.gz \
  /home/chris/Desktop/RevPal/Agents/instances \
  /home/chris/Desktop/RevPal/Agents/Salesforce \
  /home/chris/Desktop/RevPal/Agents/Agents/package.xml

# 2. Compare and identify unique files
for instance in peregrine-staging rentable-production rentable-sandbox wedgewood-production; do
  echo "=== Checking $instance ==="
  comm -23 \
    <(find /home/chris/Desktop/RevPal/Agents/instances/$instance -type f -exec basename {} \; | sort) \
    <(find /home/chris/Desktop/RevPal/Agents/platforms/SFDC/instances/$instance -type f -exec basename {} \; | sort)
done

# 3. Move unique files (example for one instance)
rsync -av --ignore-existing \
  /home/chris/Desktop/RevPal/Agents/instances/rentable-sandbox/ \
  /home/chris/Desktop/RevPal/Agents/platforms/SFDC/instances/rentable-sandbox/

# 4. Create symlinks for backward compatibility
mv /home/chris/Desktop/RevPal/Agents/instances /home/chris/Desktop/RevPal/Agents/instances.old
ln -s /home/chris/Desktop/RevPal/Agents/platforms/SFDC/instances \
  /home/chris/Desktop/RevPal/Agents/instances
```

## Benefits of Consolidation

1. **Single Source of Truth**: All SFDC content in `platforms/SFDC/`
2. **Reduced Confusion**: No duplicate instance directories
3. **Better Organization**: Clear separation between platforms
4. **Easier Maintenance**: One location to update and maintain
5. **Consistent Paths**: All SFDC work references same location

## Risk Assessment

- **Low Risk**: Most content appears to be duplicates with platforms/SFDC having more complete versions
- **Data Loss Prevention**: Comprehensive backup before any moves
- **Backward Compatibility**: Symlinks maintain existing paths

## Verification Steps

After consolidation:
1. Verify all SFDC scripts still work
2. Check that instance switching works correctly
3. Ensure no broken references in scripts
4. Confirm all agents can access needed files
5. Test a sample deployment to each instance

---
*Note: The platforms/SFDC/instances directories contain significantly more files (2385 vs 30 for rentable-sandbox), suggesting they are the more complete/active versions.*