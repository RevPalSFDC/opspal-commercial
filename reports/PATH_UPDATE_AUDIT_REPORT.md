# Path Update Audit Report
Generated: 2025-09-11

## Summary
After reorganizing the file structure to `platforms/SFDC/instances/`, multiple scripts and configurations contain outdated hardcoded paths that need updating.

## Files Requiring Updates

### 1. JavaScript Files
**platforms/SFDC/tests/test-flexipage-validator.js**
- Line 12: `./instances/peregrine-staging/...`
- Should be: `./platforms/SFDC/instances/peregrine-staging/...`

### 2. Shell Scripts in platforms/SFDC/

#### Critical Path Updates Needed:
1. **scripts/update-agents-mcp-priority.sh**
   - Line 6: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/agents`
   - Should be: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/agents`

2. **scripts/setup-claude-tools.sh**
   - Line 36: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/scripts`
   - Should be: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/scripts`

3. **scripts/update-opportunities-test.sh**
   - Line 10: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/data/renewal-contracts/...`
   - Should be: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/data/renewal-contracts/...`

4. **scripts/claude-performance-monitor.sh**
   - Line 7: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/logs/claude-performance`
   - Should be: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/logs/claude-performance`

5. **scripts/update-opportunities-batch.sh**
   - Line 10: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/data/renewal-contracts/...`
   - Should be: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/data/renewal-contracts/...`

6. **scripts/deploy-revenue-fields-enhanced.sh**
   - Line 59: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/scripts/advanced-field-deployer.js`
   - Line 76: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/scripts/field-verification-service.js`
   - Should use: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/scripts/...`

7. **scripts/claude-debug-setup.sh**
   - Line 52: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/logs/claude-debug`
   - Should be: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/logs/claude-debug`

8. **scripts/safe-soql-query.sh**
   - Line 42: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/scripts/fix-soql-query.js`
   - Should be: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/scripts/fix-soql-query.js`

9. **scripts/claude-optimize-config.sh**
   - Line 6: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/.claude/settings.local.json`
   - Should be: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/.claude/settings.local.json`

10. **scripts/claude-with-retry.sh**
    - Line 9: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/logs/claude-wrapper`
    - Should be: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/logs/claude-wrapper`

11. **integration/run-task-retrieval.sh**
    - Line 4: `/home/chris/Desktop/RevPal/Agents/ClaudeSFDC/retrieve-rentable-tasks.js`
    - Should be: `/home/chris/Desktop/RevPal/Agents/platforms/SFDC/retrieve-rentable-tasks.js`

### 3. Instance Reference Updates

**scripts/validate-file-placement.sh**
- Lines 66, 80-82, 143, 181-182: References to `/instances/` and `.salesforce-instances`
- Should check for `platforms/SFDC/instances/`

### 4. MCP Configuration (.mcp.json)
Currently correct - no updates needed. References are relative and working.

### 5. Sub-Agents
No hardcoded paths found in .claude/agents/*.md files - Good!

## Recommended Actions

### Immediate (High Priority)
1. Update all ClaudeSFDC references to platforms/SFDC
2. Fix absolute paths in shell scripts
3. Update instance validation logic

### Medium Priority
1. Consider using environment variables for base paths
2. Create a central configuration file for common paths
3. Add path validation to CI/CD pipeline

### Low Priority
1. Document the new structure in README
2. Create migration script for future reorganizations
3. Add tests for path validation

## Path Mapping Reference
```
OLD PATH                              → NEW PATH
/ClaudeSFDC/                         → /platforms/SFDC/
/instances/                          → /platforms/SFDC/instances/
/sfdc-automation-builder/            → /platforms/SFDC/sfdc-automation-builder/
/sfdc-metadata-manager/              → /platforms/SFDC/sfdc-metadata-manager/
/sfdx/                               → /platforms/SFDC/sfdx/
/sfdx-org-data/                      → /platforms/SFDC/sfdx-org-data/
```

## Validation Commands
```bash
# Find remaining old paths
grep -r "ClaudeSFDC" . --exclude-dir=node_modules --exclude-dir=.git
grep -r "/instances/" . --exclude-dir=node_modules --exclude-dir=.git
grep -r "sfdc-metadata-manager" . --exclude-dir=node_modules --exclude-dir=.git

# Verify new paths exist
ls -la platforms/SFDC/instances/
ls -la platforms/SFDC/scripts/
```

## Status: ACTION REQUIRED
Multiple scripts contain hardcoded paths that will fail with the new structure.