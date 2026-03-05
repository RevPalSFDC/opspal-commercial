# MCP Remediation Testing Guide

**Purpose**: Validate Week 1-3 deliverables work correctly
**Estimated Time**: 30-60 minutes
**Prerequisites**: Access to Supabase and Asana credentials

---

## Quick Smoke Tests (5 minutes)

### Test 1: Verify GTM Agent Fix

**What**: Confirm GTM Planning Orchestrator no longer has MCP tools

```bash
# Expected: Only Task, Read, Write, TodoWrite, Bash (no MCP tools)
grep "^tools:" .claude-plugins/opspal-gtm-planning/agents/gtm-planning-orchestrator.md
```

**Expected Output**:
```
tools: Task, Read, Write, TodoWrite, Bash
```

**✅ Pass Criteria**: No `mcp__asana__*` tools in output

---

### Test 2: Verify No Other MCP Violations

**What**: Scan all plugin agents for MCP tool declarations

```bash
# Should return empty (no violations)
grep -r "^tools:.*mcp__asana\|^tools:.*mcp__supabase" .claude-plugins/*/agents/*.md 2>/dev/null
```

**Expected Output**: (empty - no matches)

**✅ Pass Criteria**: Zero matches found

---

### Test 3: Verify Files Created

**What**: Confirm all deliverables exist

```bash
# Check files exist and are non-empty
ls -lh .env.example docs/MCP_USAGE_GUIDE.md docs/MCP_AUDIT_REPORT_2025-10-23.md scripts/test-mcp-connections.sh MCP_REMEDIATION_PROGRESS.md
```

**Expected Output**:
```
-rw-rw-r-- 1 user user  5.0K Oct 23 08:38 .env.example
-rw-rw-r-- 1 user user   73K Oct 23 08:38 docs/MCP_AUDIT_REPORT_2025-10-23.md
-rw-rw-r-- 1 user user   87K Oct 23 08:38 docs/MCP_USAGE_GUIDE.md
-rw-rw-r-- 1 user user   28K Oct 23 08:38 MCP_REMEDIATION_PROGRESS.md
-rwxrwxr-x 1 user user  8.9K Oct 23 08:38 scripts/test-mcp-connections.sh
```

**✅ Pass Criteria**: All 5 files exist, health check script is executable (x permission)

---

## Documentation Tests (10 minutes)

### Test 4: .env.example Completeness

**What**: Verify template has all required variables

```bash
# Check for required sections
grep -E "SUPABASE_URL|SUPABASE_ANON_KEY|ASANA_ACCESS_TOKEN" .env.example
```

**Expected Output**: All three variables present with explanatory comments

**Manual Check**:
- [ ] Has Supabase URL example
- [ ] Has Supabase anon key example
- [ ] Has Supabase service role key example
- [ ] Has Asana access token example
- [ ] Has Asana workspace ID example
- [ ] Has Asana project GID example
- [ ] Has comments explaining where to get credentials
- [ ] Has setup instructions at bottom

**✅ Pass Criteria**: All 8 items checked

---

### Test 5: MCP Usage Guide Structure

**What**: Verify guide has all expected sections

```bash
# Count major sections (should be 5 parts + appendices)
grep "^# Part [1-5]:" docs/MCP_USAGE_GUIDE.md | wc -l
```

**Expected Output**: `5`

```bash
# Check appendices exist
grep "^## Appendix [A-C]:" docs/MCP_USAGE_GUIDE.md | wc -l
```

**Expected Output**: `3`

**Manual Check** (open `docs/MCP_USAGE_GUIDE.md`):
- [ ] Part 1: Quick Start is clear and actionable
- [ ] Part 2: Architecture has workflow diagram
- [ ] Part 3: Shows both correct and anti-patterns
- [ ] Part 4: Troubleshooting has solutions
- [ ] Part 5: Advanced topics cover security
- [ ] Table of Contents links work (if viewing in markdown renderer)

**✅ Pass Criteria**: 5 parts + 3 appendices found, manual checks pass

---

### Test 6: Documentation Readability

**What**: Verify docs are at appropriate reading level

```bash
# Quick readability check (line length, structure)
head -50 docs/MCP_USAGE_GUIDE.md
```

**Manual Assessment**:
- [ ] Headers are clear and descriptive
- [ ] Code examples are formatted correctly
- [ ] No obvious typos in first 50 lines
- [ ] Links are properly formatted
- [ ] Tone is professional and helpful

**✅ Pass Criteria**: All 5 items checked

---

## Functional Tests (15-20 minutes)

### Test 7: Health Check Script - Syntax

**What**: Verify script has no syntax errors

```bash
# Check bash syntax
bash -n scripts/test-mcp-connections.sh
```

**Expected Output**: (empty - no errors)

**✅ Pass Criteria**: No syntax errors

---

### Test 8: Health Check Script - Help

**What**: Verify help text works

```bash
# Display help
./scripts/test-mcp-connections.sh --help
```

**Expected Output**:
```
Usage: ./scripts/test-mcp-connections.sh [--quiet] [--verbose] [--env-file <path>] [--help]

Options:
  --quiet      Exit code only (for CI/CD)
  --verbose    Show detailed debug information
  --env-file   Load environment variables from a specific file
  --help       Show this help message
```

**✅ Pass Criteria**: Help text displays correctly

---

### Test 9: Health Check Script - Missing Vars

**What**: Test error handling for missing environment variables

```bash
# Run without environment variables (should fail gracefully)
env -i bash -c './scripts/test-mcp-connections.sh'
```

**Expected Output** (should show):
```
❌ Missing required environment variables:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - ASANA_ACCESS_TOKEN

💡 Solution:
   1. Create a .env file: cp .env.example .env
   ...
```

**✅ Pass Criteria**: Clear error message with solution steps

---

### Test 10: Health Check Script - With Real Credentials

**What**: Test actual MCP connectivity

**Prerequisites**:
- Have real Supabase and Asana credentials
- Supabase project active
- Asana API access enabled

```bash
# Load your actual credentials
set -a && source .env && set +a

# Run health check
./scripts/test-mcp-connections.sh
```
If your credentials live outside this repo, use:
```bash
./scripts/test-mcp-connections.sh --env-file /path/to/.env
```

**Expected Output** (if credentials valid):
```
🔍 OpsPal MCP Connection Health Check
======================================

📋 Checking environment variables...
✅ All required environment variables present

1️⃣  Testing Supabase MCP (anon key - read-only)...
   ✅ Supabase: Connected (anon key working, found X reflections)

2️⃣  Testing Asana MCP...
   ✅ Asana: Connected (authenticated as your@email.com)

======================================
✅ All MCP servers reachable!
```

**✅ Pass Criteria**:
- All checks pass (green checkmarks)
- Shows correct email for Asana
- No timeout or connection errors
- Exit code 0

**If you don't have credentials yet**: This test can be skipped or tested in Week 4 after setting up accounts.

---

### Test 11: Health Check Script - Quiet Mode

**What**: Test CI/CD mode (exit code only)

```bash
# Run in quiet mode
./scripts/test-mcp-connections.sh --quiet
echo "Exit code: $?"
```

**Expected Output** (if credentials valid):
```
Exit code: 0
```

**Expected Output** (if credentials missing):
```
Exit code: 1
```

**✅ Pass Criteria**:
- No output in quiet mode
- Exit code 0 on success
- Exit code 1 on failure

---

### Test 12: Health Check Script - Verbose Mode

**What**: Test debug output

```bash
# Run in verbose mode
./scripts/test-mcp-connections.sh --verbose 2>&1 | head -30
```

**Expected Output** (should include):
```
[DEBUG] Found: SUPABASE_URL (https://xxx...)
[DEBUG] Found: SUPABASE_ANON_KEY (eyJ...)
[DEBUG] URL: https://xxx.supabase.co
[DEBUG] Testing: GET /rest/v1/reflections...
```

**✅ Pass Criteria**: Shows debug information with `[DEBUG]` prefix

---

## Integration Tests (10-15 minutes)

### Test 13: New Developer Workflow

**What**: Simulate new developer onboarding

**Scenario**: Pretend you're a new developer following the quick start guide

```bash
# Step 1: Copy template (as new developer would)
cp .env.example .env.test

# Step 2: Verify template structure
cat .env.test | grep -E "^[A-Z_]+=" | head -10

# Step 3: Simulate filling in values
echo "SUPABASE_URL=https://example.supabase.co" >> .env.test
echo "SUPABASE_ANON_KEY=test-key" >> .env.test
echo "ASANA_ACCESS_TOKEN=test-token" >> .env.test

# Cleanup
rm .env.test
```

**Manual Assessment**:
- [ ] Instructions in docs/MCP_USAGE_GUIDE.md are clear
- [ ] Setup steps are in logical order
- [ ] No missing prerequisites or assumptions
- [ ] Would take <30 minutes to complete (estimated)

**✅ Pass Criteria**: Workflow is clear and complete

---

### Test 14: Troubleshooting Guide Accuracy

**What**: Verify troubleshooting steps are correct

**Pick 2 common errors to validate**:

1. **"Missing Environment Variables"**:
   - [ ] Error message matches what's in guide
   - [ ] Solution steps are accurate
   - [ ] Links to .env.example are correct

2. **"Permission Denied" (401/403)**:
   - [ ] Troubleshooting steps make sense
   - [ ] curl command is correct
   - [ ] RLS explanation is accurate

**Manual Test** (open `docs/MCP_USAGE_GUIDE.md`):
- Find "Common Errors" section
- Read through 2-3 error scenarios
- Verify solutions would actually work

**✅ Pass Criteria**: Troubleshooting steps are accurate and helpful

---

### Test 15: Cross-Reference Validation

**What**: Verify documentation references are correct

```bash
# Check that referenced files exist
grep -o "docs/[A-Z_]*\.md" docs/MCP_USAGE_GUIDE.md | sort -u | while read file; do
  if [ -f "$file" ]; then
    echo "✅ $file exists"
  else
    echo "❌ $file missing"
  fi
done
```

**Expected Output**: All referenced files should exist (✅)

**Manual Check**:
- [ ] Links to CLAUDE.md are correct
- [ ] Links to .env.example are correct
- [ ] Links to audit report are correct
- [ ] External URLs are valid (Supabase docs, Asana docs)

**✅ Pass Criteria**: All references are valid

---

## Regression Tests (5 minutes)

### Test 16: GTM Agent Still Functions

**What**: Verify GTM agent still works despite MCP removal

**Test Approach** (without running full workflow):

```bash
# Check that delegation pattern is documented
grep -A 10 "Asana.*Delegation" .claude-plugins/opspal-gtm-planning/agents/gtm-planning-orchestrator.md
```

**Manual Review** (open GTM agent file):
- [ ] Architectural note explains delegation (lines 12-23)
- [ ] Approval process updated (lines 109-116)
- [ ] Task tool delegation documented (lines 588-634)
- [ ] No references to direct MCP calls remain
- [ ] Functionality preserved through Task tool

**✅ Pass Criteria**: Delegation pattern properly documented, functionality preserved

---

### Test 17: Verify git Status Clean

**What**: Ensure commit was complete

```bash
# Check git status
git status --porcelain | grep -E "(\.env\.example|MCP_|gtm-planning-orchestrator|test-mcp-connections)"
```

**Expected Output**: (empty - all files committed)

**✅ Pass Criteria**: No uncommitted MCP remediation files

---

## Edge Case Tests (5 minutes)

### Test 18: Script Handles Bad Input

**What**: Test error handling

```bash
# Test with invalid flag
./scripts/test-mcp-connections.sh --invalid-flag
```

**Expected Behavior**: Should either show help or ignore unknown flag (not crash)

**✅ Pass Criteria**: Script doesn't crash

---

### Test 19: Documentation Handles Edge Cases

**What**: Verify edge cases are documented

**Search guide for**:
```bash
# Check if these scenarios are covered
grep -i "timeout\|connection refused\|rate limit\|expired" docs/MCP_USAGE_GUIDE.md | wc -l
```

**Expected Output**: Should find multiple matches (>5)

**✅ Pass Criteria**: Edge cases are documented

---

## Security Tests (5 minutes)

### Test 20: No Credentials in Git

**What**: Verify no secrets were committed

```bash
# Search for potential credential patterns
git log --all -p -S "eyJhbGc" -- .
git log --all -p -S "xoxb-" -- .
git log --all -p -S "ghp_" -- .
```

**Expected Output**: (empty - no credential patterns)

**Alternative Check**:
```bash
# Check latest commit doesn't contain secrets
git show HEAD | grep -E "(eyJhbGc|xoxb-|ghp_|Bearer [a-zA-Z0-9]{20})"
```

**Expected Output**: (empty)

**✅ Pass Criteria**: No credentials found in git history

---

### Test 21: .env.example Contains No Secrets

**What**: Verify template has placeholder values only

```bash
# Check for suspicious patterns
grep -E "eyJhbGc|[0-9]{16,}" .env.example
```

**Expected Output**: Only example/placeholder values like "your-key-here"

**✅ Pass Criteria**: No real credentials in example file

---

## User Experience Tests (Optional - 10 minutes)

### Test 22: Documentation Tone & Clarity

**What**: Assess user-friendliness

**Manual Review** (sample docs/MCP_USAGE_GUIDE.md):
- [ ] Language is clear and jargon-free where possible
- [ ] Examples are realistic and helpful
- [ ] Error messages are actionable (tell user what to do)
- [ ] Warnings are appropriately emphasized
- [ ] Success criteria are clear

**✅ Pass Criteria**: 4/5 items score positively

---

### Test 23: Accessibility of Information

**What**: Can users find what they need quickly?

**Test Searches**:
```bash
# Can users find common topics?
grep -i "how to.*set up" docs/MCP_USAGE_GUIDE.md | head -3
grep -i "troubleshoot" docs/MCP_USAGE_GUIDE.md | head -3
grep -i "example" docs/MCP_USAGE_GUIDE.md | head -5
```

**Manual Assessment**:
- [ ] Table of contents is comprehensive
- [ ] Headers are descriptive and scannable
- [ ] Code examples are easy to find
- [ ] Troubleshooting section is prominent

**✅ Pass Criteria**: Information is easily findable

---

## Test Results Summary Template

```markdown
# MCP Remediation Testing Results

**Date**: YYYY-MM-DD
**Tester**: [Name]
**Time Spent**: [X] minutes

## Quick Smoke Tests (5 min)
- [ ] Test 1: GTM Agent Fix - PASS/FAIL
- [ ] Test 2: No MCP Violations - PASS/FAIL
- [ ] Test 3: Files Created - PASS/FAIL

## Documentation Tests (10 min)
- [ ] Test 4: .env.example Complete - PASS/FAIL
- [ ] Test 5: Guide Structure - PASS/FAIL
- [ ] Test 6: Readability - PASS/FAIL

## Functional Tests (15-20 min)
- [ ] Test 7: Script Syntax - PASS/FAIL
- [ ] Test 8: Help Text - PASS/FAIL
- [ ] Test 9: Missing Vars - PASS/FAIL
- [ ] Test 10: Real Credentials - PASS/FAIL/SKIP
- [ ] Test 11: Quiet Mode - PASS/FAIL
- [ ] Test 12: Verbose Mode - PASS/FAIL

## Integration Tests (10-15 min)
- [ ] Test 13: New Developer Workflow - PASS/FAIL
- [ ] Test 14: Troubleshooting Accuracy - PASS/FAIL
- [ ] Test 15: Cross-References - PASS/FAIL

## Regression Tests (5 min)
- [ ] Test 16: GTM Agent Functions - PASS/FAIL
- [ ] Test 17: Git Clean - PASS/FAIL

## Edge Case Tests (5 min)
- [ ] Test 18: Bad Input - PASS/FAIL
- [ ] Test 19: Edge Cases Documented - PASS/FAIL

## Security Tests (5 min)
- [ ] Test 20: No Credentials in Git - PASS/FAIL
- [ ] Test 21: .env.example Safe - PASS/FAIL

## User Experience Tests (Optional 10 min)
- [ ] Test 22: Tone & Clarity - PASS/FAIL
- [ ] Test 23: Information Accessibility - PASS/FAIL

## Overall Result
- **Tests Passed**: X / Y
- **Critical Failures**: [List any]
- **Recommended Actions**: [List any fixes needed]
- **Ready for Production**: YES/NO

## Notes
[Any additional observations or recommendations]
```

---

## Recommended Testing Order

### Fast Track (15 minutes)
Run tests: 1, 2, 3, 7, 8, 9, 17, 20

**Best for**: Quick validation that nothing is broken

### Standard Track (30 minutes)
Run tests: 1-9, 13-17, 20-21

**Best for**: Thorough validation before sharing with team

### Complete Track (60 minutes)
Run all tests 1-23

**Best for**: Pre-production validation or first-time testing

### With Real Credentials (add 10 minutes)
Include tests: 10, 11, 12

**Best for**: Full end-to-end validation

---

## Next Steps After Testing

### If All Tests Pass ✅
1. Share `MCP_REMEDIATION_PROGRESS.md` with team
2. Update CLAUDE.md to reference new documentation
3. Schedule Week 4 (Security Enhancements)
4. Consider testing with actual new developer

### If Some Tests Fail 🟡
1. Document failures in test results template
2. Prioritize fixes (critical vs. minor)
3. Fix critical issues immediately
4. Schedule non-critical fixes for Week 4

### If Critical Tests Fail 🔴
Critical tests: 1, 2, 7, 10, 20
1. Stop and fix immediately
2. Re-test before proceeding
3. Update documentation if needed
4. Consider additional testing

---

## Automation Opportunities (Future)

Consider adding these to CI/CD (Week 4 or later):
- Test 1-3: Automated violation detection
- Test 7: Syntax check on every commit
- Test 10: Health check in CI pipeline
- Test 20: Secret scanning tool

**Tools to Consider**:
- `shellcheck` for bash script validation
- `git-secrets` for credential scanning
- `markdownlint` for documentation quality
- GitHub Actions for automated testing

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-23
**Maintained By**: RevPal Engineering - OpsPal Team
