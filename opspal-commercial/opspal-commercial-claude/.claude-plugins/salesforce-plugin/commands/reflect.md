---
name: reflect
description: Analyze session for errors, feedback, and generate improvement playbook
allowed-tools: Read, Grep, Glob, Write, Bash
thinking-mode: enabled
---

# Session Reflection & Improvement Analysis

## Purpose

**What this command does**: Analyzes your development session to detect errors, patterns, and friction points, then generates a structured improvement playbook and submits it to a centralized database for trend analysis.

**When to use it**:
- ✅ After completing a Salesforce development session (deployments, implementations, debugging)
- ✅ When you encountered errors or friction worth documenting
- ✅ After discovering patterns that could be automated
- ✅ When you have feedback about tool/agent behavior

**When NOT to use it**:
- ❌ During read-only exploration (no development work performed)
- ❌ For documentation-only review sessions
- ❌ Mid-session (wait until the session is complete)

## Prerequisites

### Configuration (Supabase Required for Submission)

**Reflection generation works out-of-the-box; Supabase submission requires config:**

- **Supabase submission**: Requires environment variables
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - Example:
    ```bash
    export SUPABASE_URL='https://REDACTED_SUPABASE_PROJECT.supabase.co'
    export SUPABASE_ANON_KEY='REDACTED_SUPABASE_ANON_KEY'
    ```
  - If missing, /reflect still saves locally and skips submission
  - Auto-load: /reflect loads `.env` and `.env.local` from the nearest project root

- **User attribution** (Optional): Set `USER_EMAIL` environment variable for attribution
  - Default: Anonymous submission (works without USER_EMAIL)
  - How to set:
    ```bash
    export USER_EMAIL='your-email@example.com'
    ```

- **Slack notifications** (Optional): Requires `SLACK_WEBHOOK_URL` in .env file
  - Default: No Slack notification (reflection still works)
  - How to set: Add to `.env` file

**No configuration needed** to generate reflections; submission needs Supabase env vars.

### Execution Required
**These are MANDATORY before running the command**:

- **✅ Completed development session** - Must have performed actual development work (not just exploration)
  - Verify: Review your conversation history for tool calls, agent invocations, or code changes
  - Impact: Reflection will have nothing to analyze if session is empty

## Usage

### Basic Usage
```bash
/reflect
```

**What happens**:
1. Agent analyzes your session history (conversation, tool calls, agent invocations)
2. Detects errors and categorizes by taxonomy (config, auth, schema, etc.)
3. Captures user feedback (clarifications, frustrations, suggestions)
4. Generates improvement playbook with root cause analysis
5. Saves reflection JSON to `.claude/SESSION_REFLECTION_<timestamp>.json`
6. Submits to Supabase if `SUPABASE_URL`/`SUPABASE_ANON_KEY` are set
7. Reports success with local file path and submission status

**Duration**: 30-60 seconds depending on session length

## Examples

### Example 1: After Salesforce Deployment with Errors

**Scenario**: You deployed metadata to Salesforce and encountered 2 errors (field history tracking limit, invalid picklist formula)

**Command**:
```bash
/reflect
```

**Expected Output**:
```
Analyzing session for errors and patterns...

📊 Session Summary:
   - Duration: 45 minutes
   - Tool calls: 23
   - Agent invocations: 3
   - Errors detected: 2

🔍 Error Analysis:
   Issue #1: Field history tracking limit exceeded (schema/parse)
      Root cause: Attempted to add 21st tracked field to Account object
      Priority: P1
      Blast radius: HIGH

   Issue #2: Invalid picklist formula using ISBLANK() (schema/parse)
      Root cause: ISBLANK() not supported on picklist fields
      Priority: P0
      Blast radius: MEDIUM

💡 Playbook Generated:
   - Pre-deployment validation checks
   - Picklist formula validation patterns
   - Field history tracking verification

📁 Saved: .claude/SESSION_REFLECTION_20251013_143022.json

📤 Submitting to Supabase...
✅ Submission successful

📈 Query your reflections:
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js recent
```

**What this means**: Your session has been analyzed, errors documented with root cause analysis, and improvements submitted to the centralized database for trend detection.

### Example 2: Successful Session with Feedback

**Scenario**: Deployment succeeded but you noticed a friction point in the workflow

**Command**:
```bash
/reflect
```

**Expected Output**:
```
Analyzing session for errors and patterns...

📊 Session Summary:
   - Duration: 20 minutes
   - Tool calls: 8
   - Agent invocations: 1
   - Errors detected: 0
   - User feedback: 1

💬 User Feedback:
   "Had to manually verify object relationships - this could be automated"
   Classification: suggestion
   Proposed action: Add pre-flight relationship validator

💡 Playbook Generated:
   - Object relationship verification workflow

📁 Saved: .claude/SESSION_REFLECTION_20251013_145530.json

📤 Submitting to Supabase...
✅ Submission successful
```

**What this means**: Even without errors, valuable feedback was captured for workflow improvements.

### Example 3: Supabase Not Configured

**Scenario**: Running /reflect without SUPABASE_URL/SUPABASE_ANON_KEY

**Command**:
```bash
/reflect
```

**Expected Output**:
```
Analyzing session for errors and patterns...

📊 Session Summary:
   - Duration: 35 minutes
   - Errors detected: 3

📁 Saved: .claude/SESSION_REFLECTION_20251013_150145.json

📤 Attempting submission...
⚠️  Supabase not configured (missing SUPABASE_URL/SUPABASE_ANON_KEY)

💡 Manual submission (auto-loads .env/.env.local):
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/submit-reflection.js \
     .claude/SESSION_REFLECTION_20251013_150145.json
```

**What this means**: Reflection still works and saves locally, but isn't submitted to the centralized database for trend analysis.

## Decision Tree

**Use this decision tree to determine if you should run /reflect:**

```
Start Here
  ↓
Did your session involve actual development work (not just exploration)?
  ├─ YES → Did you encounter errors, friction, or have feedback?
  │         ├─ YES → Run /reflect ✅
  │         │         (Document errors and patterns)
  │         │
  │         └─ NO → Optional but recommended ⚠️
  │                   (Positive feedback helps track what works well)
  │
  └─ NO → Was this just documentation reading or exploration?
            ├─ YES → Skip /reflect ❌
            │         (Nothing to reflect on for read-only sessions)
            │
            └─ NO → Consider /reflect if you have feedback about the tools
```

**Key Decision Factors**:
- ✅ **RUN** after: Deployments (success or failure), implementations, debugging, automation work
- ⚠️  **OPTIONAL** after: Successful sessions with no issues (but helpful for positive patterns)
- ❌ **SKIP** after: Pure exploration, documentation review, read-only queries

## OBJECTIVE (For Agent Context)
From the latest run(s), extract errors, fragilities, and user feedback. Propose instance-agnostic fixes and output a reusable playbook. Produce actionable wiring steps for our tools and sub-agents.

## INPUTS (For Agent Context)
Analyze the following from this session:
• Execution traces (conversation history, tool calls, agent invocations)
• Tool I/O (requests, responses, status codes, failures)
• Environment/config snapshot (check error logs, recent operations)
• Current tool registry (scripts, agents, MCP tools used)
• User feedback (comments, corrections, clarifications during session)

## PROCESS

### 1) Snapshot (≤50 words)
Summarize what we attempted and the outcome.

### 2) Error Sweep
Cluster issues using taxonomy:
- **config/env**: Missing env vars, wrong paths, misconfigured services
- **auth/permissions**: Salesforce auth issues, permission errors
- **tool-contract mismatch**: Wrong parameters, unexpected responses
- **schema/parse**: JSON/XML parsing failures, field name errors
- **idempotency/state**: State management issues, duplicate operations
- **rate limit/timeouts**: API throttling, timeout failures
- **external API drift**: Salesforce API changes, breaking updates
- **data quality**: Missing data, malformed records, validation failures
- **concurrency/order**: Sequencing issues, dependency problems
- **prompt/LLM mismatch**: Misunderstood instructions, wrong agent choice

### 3) Feedback Sweep
Parse user comments and classify:
- **clarification**: User had to explain/correct something
- **dissatisfaction**: User expressed frustration or disappointment
- **suggestion**: User proposed improvements or alternatives
- **constraint**: User added requirements mid-session

Link each to error clusters OR create new issues if user-only.

### 4) Root Cause → Fix
For each cluster, produce:
- **reproducible_trigger**: How to recreate the issue
- **root_cause**: One sentence explanation
- **minimal_patch**: Instance-specific quick fix
- **agnostic_fix**: Generalizable solution (script/agent/doc update)
- **blast_radius**: Scope of impact (LOW/MEDIUM/HIGH)
- **priority**: Urgency (P0/P1/P2/P3)

### 5) Generalize → Playbook
Create reusable playbook templates for common patterns:
- Pre-flight checks
- Validation sequences
- Error recovery procedures
- Best practice workflows

### 6) Wiring Plan
Actionable steps to implement fixes:
- Script updates (file paths, changes needed)
- Agent enhancements (which agents, what capabilities)
- Documentation additions (where, what content)
- Tool integrations (new MCP tools, slash commands)

### 7) Tests & Monitors
Preventive measures:
- Validation checks to add
- Pre-deployment tests
- Monitoring/alerting improvements
- Automated guards

### 8) Skill Usage Analysis (ACE Framework)
Identify skills, playbooks, and strategies used during this session:
- **skills_used**: List skill IDs from the skill registry that were applied
- **skill_feedback**: Per-skill success/failure feedback
- **new_skills_discovered**: Patterns that could become new skills
- **skill_improvements**: Suggestions to refine existing skills

**Skill Categories**:
- `assessment` - Audit and analysis patterns
- `deployment` - Metadata deployment strategies
- `validation` - Pre-flight checks and validation
- `query` - SOQL/report patterns
- `automation` - Flow/trigger patterns
- `configuration` - Setup and configuration
- `troubleshooting` - Debug and fix patterns

**How to Identify Skills**:
1. Review which playbooks or documented patterns were followed
2. Note strategies that succeeded or failed
3. Identify repeatable patterns worth preserving
4. Flag patterns that need refinement based on outcome

### 9) Persistence
Where to save improvements:
- Script location and naming
- Documentation updates
- Agent configuration changes
- Shared library additions

## OUTPUT SCHEMA (JSON)

**IMPORTANT**: The reflection JSON MUST include the following REQUIRED fields for data quality:

### Required Metadata Fields
| Field | Type | Description | How to Determine |
|-------|------|-------------|------------------|
| `outcome` | string | Session outcome: success, partial, failure, blocked | See Outcome Decision Tree below |
| `session_metadata.duration_minutes` | number | Session duration in minutes | Calculate from session start/end |
| `session_metadata.session_start` | ISO string | When session started | First user message timestamp |
| `session_metadata.session_end` | ISO string | When reflection created | Current timestamp |

### Outcome Decision Tree
```
Did the primary task complete successfully?
├─ YES → Did all subtasks complete?
│   ├─ YES → outcome: "success"
│   └─ NO → outcome: "partial"
└─ NO → Was it due to external factors (permissions, API limits, missing data)?
    ├─ YES → outcome: "blocked"
    └─ NO → outcome: "failure"
```

Provide output in this exact structure:

```json
{
  "summary": "Brief description of what was attempted and outcome",
  "outcome": "success|partial|failure|blocked",
  "session_metadata": {
    "session_start": "ISO timestamp of first user message",
    "session_end": "ISO timestamp when reflection generated",
    "duration_minutes": 0,
    "org": "org-alias if applicable",
    "focus_area": "primary focus taxonomy"
  },
  "issues": [
    {
      "id": "issue_001",
      "taxonomy": "one_of[config/env, auth/permissions, tool-contract, schema/parse, idempotency/state, rate-limit, external-api, data-quality, concurrency, prompt-mismatch]",
      "reproducible_trigger": "How to recreate",
      "root_cause": "One sentence cause",
      "minimal_patch": "Quick instance-specific fix",
      "agnostic_fix": "Generalizable solution",
      "blast_radius": "LOW|MEDIUM|HIGH",
      "priority": "P0|P1|P2|P3"
    }
  ],
  "user_feedback": [
    {
      "raw_comment": "Exact user comment or paraphrase",
      "classification": "clarification|dissatisfaction|suggestion|constraint",
      "linked_issue_id": "issue_001 or null",
      "proposed_action": "What to do about it"
    }
  ],
  "playbook": {
    "name": "Descriptive playbook name",
    "trigger": "When to use this playbook",
    "steps": [
      "Step 1: ...",
      "Step 2: ..."
    ],
    "location": "templates/playbooks/[name]/"
  },
  "wiring": {
    "scripts": [
      {
        "file": "scripts/lib/[name].js",
        "action": "create|update",
        "changes": "Description of changes"
      }
    ],
    "agents": [
      {
        "agent": "sfdc-[name]",
        "enhancement": "What capability to add"
      }
    ],
    "documentation": [
      {
        "file": "docs/[name].md",
        "content": "What to document"
      }
    ],
    "tools": [
      {
        "type": "slash-command|mcp-tool",
        "name": "[name]",
        "purpose": "What it does"
      }
    ]
  },
  "tests": {
    "validations": [
      "Pre-flight check to add"
    ],
    "monitors": [
      "What to monitor/alert on"
    ],
    "guards": [
      "Automated prevention mechanism"
    ]
  },
  "persistence": {
    "immediate": [
      "Quick wins to implement now"
    ],
    "backlog": [
      "Future improvements"
    ],
    "tracking": "Where to track (Asana/GitHub/docs)"
  },
  "skills": {
    "skills_used": [
      "skill_id_1",
      "skill_id_2"
    ],
    "skill_feedback": {
      "skill_id_1": {
        "success": true,
        "notes": "Worked well for this use case"
      },
      "skill_id_2": {
        "success": false,
        "error_type": "validation",
        "notes": "Needs refinement for edge case"
      }
    },
    "new_skills_discovered": [
      {
        "name": "Descriptive skill name",
        "category": "assessment|deployment|validation|query|automation|configuration|troubleshooting",
        "pattern": "Description of the repeatable pattern",
        "source_agent": "Agent that used this pattern"
      }
    ],
    "skill_improvements": [
      {
        "skill_id": "Existing skill to improve",
        "suggestion": "How to improve it",
        "reason": "Why it needs improvement"
      }
    ]
  },
  "roi_analysis": {
    "time_savings": {
      "hours_per_month": 0,
      "annual_hours": 0,
      "hourly_rate": 150,
      "annual_value": "$0"
    },
    "error_prevention": {
      "errors_prevented_monthly": 0,
      "cost_per_error": 500,
      "annual_value": "$0"
    },
    "total_annual_roi": "$0",
    "calculation_notes": "Brief explanation of ROI calculation methodology"
  }
}
```

## CONSTRAINTS
• Output MUST be valid JSON matching the schema above
• **`outcome` field is REQUIRED** - must be one of: success, partial, failure, blocked
• **`session_metadata` object is REQUIRED** with duration_minutes, session_start, session_end
• **Duration calculation**: Estimate minutes from session start to reflection generation
• Feedback MUST always be mapped to issues OR explicitly noted as unlinked
• Fixes MUST distinguish instance-specific vs agnostic solutions
• Wiring plan MUST include specific file paths and agent names
• Priority MUST reflect actual impact and urgency
• Skills section MUST include at least `skills_used` array (can be empty if none identified)
• Skill feedback MUST be provided for each skill in `skills_used` with success/failure status
• **ROI calculation**: If issues identified, estimate annual ROI impact based on time savings

## ADDITIONAL ANALYSIS

Before generating the JSON, also:
1. Check recent error logs: `error-logging/logs/` (if they exist)
2. Review tool usage patterns from this session
3. Identify any agent that should have been used but wasn't
4. Note any repeated manual steps that could be automated

Focus on **systemic improvements** that prevent classes of issues, not just one-off fixes.

---

## Expected Output

### Success with Automatic Submission
```
Analyzing session for errors and patterns...

📊 Session Summary:
   - Duration: [X] minutes
   - Tool calls: [N]
   - Agent invocations: [N]
   - Errors detected: [N]
   - User feedback: [N]

🔍 Error Analysis:
   Issue #[N]: [Error description] ([taxonomy])
      Root cause: [One sentence explanation]
      Priority: P[0-3]
      Blast radius: [LOW|MEDIUM|HIGH]

💡 Playbook Generated:
   - [Improvement 1]
   - [Improvement 2]

📁 Saved: .claude/SESSION_REFLECTION_[timestamp].json

📤 Submitting to Supabase...
✅ Submission successful

📈 Query your reflections:
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js recent
```

**Indicators of success**:
- ✅ Session analyzed with errors categorized
- ✅ Local JSON file created in `.claude/` directory
- ✅ Reflection submitted to Supabase (when env vars are set)
- ✅ Query command provided for accessing reflections

### Submission Failure (Network Issue)
```
Analyzing session for errors and patterns...

📊 Session Summary:
   - Duration: [X] minutes
   - Errors detected: [N]

📁 Saved: .claude/SESSION_REFLECTION_[timestamp].json

📤 Submitting to Supabase...
⚠️  Submission failed
   Reflection saved locally: /path/to/.claude/SESSION_REFLECTION_[timestamp].json
   You can manually submit later (auto-loads .env/.env.local):
   node /path/to/scripts/lib/submit-reflection.js /path/to/.claude/SESSION_REFLECTION_[timestamp].json
```

**What this means**: Reflection is saved locally and can be manually submitted later when network connectivity is restored. The submission failure is non-fatal and doesn't break the `/reflect` command.

**Note**: The path shown uses the portable `$PLUGIN_ROOT` variable which works in both development and marketplace installations.

### Failure - No Development Work
```
Analyzing session for errors and patterns...

⚠️  No significant development activity detected in this session.
   This session appears to be primarily exploration or documentation review.

💡 Consider running /reflect when you have:
   - Completed a deployment
   - Encountered errors
   - Discovered friction points
```

**What this means**: The agent detected no tool calls, agent invocations, or code changes to analyze.

## Querying Reflections

After submitting reflections, query the centralized database:

```bash
# Your recent reflections
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js recent

# Most common issues across all users
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js topIssues

# Statistics by org
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js orgStats

# Search by keyword
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js search "automation"

# All reflections for your org
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js myOrg [org-name]
```

## Troubleshooting

### Issue: Supabase submission fails

**Symptoms**:
```
❌ Connection test failed
Status: 401
This suggests the Supabase URL or API key is incorrect
```

**Cause**: Invalid credentials or network connectivity issue

**Solution**:
1. **Test credentials manually**:
   ```bash
   curl -X GET "$SUPABASE_URL/rest/v1/" \
     -H "apikey: $SUPABASE_ANON_KEY"
   ```
   Expected: `{}` or JSON response (not "Invalid API key")

2. **Verify plugin installation**:
   ```bash
   /plugin list | grep salesforce-plugin
   ```
   Expected: Should show salesforce-plugin as installed

4. **Manual submission fallback** (auto-loads .env/.env.local):
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/submit-reflection.js \
     .claude/SESSION_REFLECTION_20251016_170235.json
   ```

**Note**: Submission failure does NOT prevent the reflection from being saved locally. The reflection JSON file is always saved first, submission is secondary.

### Issue: Automatic submission doesn't work

**Symptoms**:
- No "Submitting to Supabase..." output after saving reflection
- Only see local file save message

**Cause**: Missing SUPABASE_URL/SUPABASE_ANON_KEY or Supabase connectivity issue

**Solution**:
1. **Verify Supabase env vars are set**:
   ```bash
   echo "$SUPABASE_URL"
   echo "$SUPABASE_ANON_KEY"
   ```
   Expected: both values set

2. **Verify plugin version**:
   ```bash
   /plugin list | grep salesforce-plugin
   ```
   Expected: v3.7.4 or higher

3. **Reinstall plugin** if outdated:
   ```bash
   /plugin uninstall salesforce-plugin@revpal-internal-plugins
   /plugin install salesforce-plugin@revpal-internal-plugins
   ```

4. **Manual submission fallback** (auto-loads .env/.env.local):
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/submit-reflection.js \
     .claude/SESSION_REFLECTION_20251016_170235.json
   ```

### Issue: "Invalid API key" error

**Symptoms**:
```
{
  "message": "Invalid API key",
  "hint": "Double check your Supabase `anon` or `service_role` API key."
}
```

**Cause**: SUPABASE_ANON_KEY is missing or invalid

**Solution**:
1. **Verify credentials work**:
   ```bash
   curl -X GET "$SUPABASE_URL/rest/v1/reflections?limit=1" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY"
   ```
   If this returns "Invalid API key", the credentials need to be updated

2. **Report to maintainers**: Supabase credentials may need rotation
   - Create GitHub issue: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
   - Include error message and timestamp

3. **Temporary workaround**: Use environment variables with valid credentials
   ```bash
   export SUPABASE_URL="https://REDACTED_SUPABASE_PROJECT.supabase.co"
   export SUPABASE_ANON_KEY="your-valid-key-here"
   ```

### Issue: Connection refused (ECONNREFUSED)

**Symptoms**:
```
❌ Network error: connect ECONNREFUSED
Cannot reach Supabase - check your internet connection
```

**Cause**: Network connectivity issue or firewall blocking Supabase

**Solution**:
1. **Check internet connection**:
   ```bash
   ping -c 3 8.8.8.8
   ```

2. **Test Supabase reachability**:
   ```bash
   curl -v https://REDACTED_SUPABASE_PROJECT.supabase.co
   ```

3. **Check firewall settings**: Ensure outbound HTTPS (port 443) is allowed

4. **Use proxy if needed**: Set `HTTPS_PROXY` environment variable

5. **Defer submission**: Reflection is saved locally, submit when network restores:
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/submit-reflection.js \
     .claude/SESSION_REFLECTION_20251016_170235.json
   ```

### Issue: Empty or minimal reflection generated

**Symptoms**:
```
⚠️  No significant development activity detected
```

**Cause**: Session didn't include actual development work (read-only exploration)

**Solution**: This is expected behavior. Run `/reflect` after sessions that involve:
- Deployments
- Code changes
- Error troubleshooting
- Agent invocations

### Issue: JSON syntax error in reflection

**Symptoms**: Agent generates malformed JSON that can't be parsed

**Cause**: Complex session data caused JSON serialization issues

**Solution**:
1. Check the `.claude/SESSION_REFLECTION_*.json` file for syntax errors
2. Report the issue via a new reflection or GitHub issue
3. The submission script validates JSON before attempting submission

## Metadata Automatically Captured

Each reflection includes:
- **Plugin name and version** - Auto-detected from plugin.json
- **User email** - From `USER_EMAIL` env var (optional)
- **Org identifier** - Auto-detected from context
- **Focus area** - Determined from issue taxonomy
- **Duration** - Session length in minutes
- **Issue count** - Total and high-priority counts
- **ROI estimate** - Calculated from issue severity

This metadata enables trend analysis and plugin performance tracking.

## Privacy & Transparency

- **No secrets collected**: Reflections document patterns, not credentials
- **Public by design**: All reflections are queryable by anyone
- **Optional participation**: Works without Supabase configuration
- **Read-only safe**: Anonymous writes enabled, no repo access needed

---

## INTERNAL EXECUTION STEPS (For Agent Context)

Before and after generating the reflection JSON, you MUST perform these steps in order:

### Step 0: Check for Pending Reflections (Pre-Reflection)
BEFORE analyzing the current session, check for and submit any unsubmitted reflection files:

**IMPORTANT**: Run the batch submission script using Bash tool:
```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
bash "${PLUGIN_ROOT}/hooks/pre-reflect.sh" || node "${PLUGIN_ROOT}/scripts/lib/batch-submit-reflections.js" --quick
```

**What this does**:
- Searches for reflection files in `.claude/` directory
- Submits any pending reflections that haven't been submitted yet
- Non-blocking: continues even if submission fails
- Uses quick mode for fast execution (~2 seconds)

**Output Handling**:
- If submissions succeed: Note how many reflections were submitted
- If no pending reflections: Silently continue (no output needed)
- If submission fails: Non-fatal, continue with current reflection

**Example Output** (only if reflections found and submitted):
```
🔄 Checking for unsubmitted reflections...
✅ Batch submission completed
   Submitted 1 pending reflection(s)
```

### Step 1: Save Reflection Locally
Save the JSON output to `.claude/SESSION_REFLECTION_<timestamp>.json` where `<timestamp>` is in format `YYYYMMDD_HHMMSS`.

Example: `.claude/SESSION_REFLECTION_20251013_143022.json`

Use the Write tool to save the file.

**IMPORTANT**: Ensure the JSON includes these required fields for Supabase submission:
- `summary` (string): Brief description of session
- `issues_identified` (array): Array of issue objects
- `plugin_name` (string): Auto-detected from plugin.json
- `plugin_version` (string): Auto-detected from plugin.json
- `org_name` (string): Auto-detected from context
- `session_type` (string): "development" or "troubleshooting"
- `total_issues` (number): Count of issues
- `priority_issues` (number): Count of P0/P1 issues
- `skills_used` (array): Array of skill IDs used during session (ACE Framework)
- `skill_feedback` (object): Per-skill success/failure feedback (ACE Framework)

### Step 2: Attempt Submission (Fallback Mode)
After saving the reflection file, attempt submission directly as a fallback:

**IMPORTANT**: Use the PLUGIN_ROOT variable from Step 0 to locate the submission script. Try submission using Bash tool:
```bash
# Use the PLUGIN_ROOT variable already set in Step 0
node "$PLUGIN_ROOT/scripts/lib/submit-reflection.js" <reflection-path>
```

**Path Resolution**:
- PLUGIN_ROOT was set in Step 0 and contains the plugin installation directory
- Works in both development (.claude-plugins/opspal-core-plugin/packages/domains/salesforce/) and marketplace installations (~/.claude/plugins/salesforce-plugin@revpal-internal-plugins/)
- Never use hardcoded paths - always use $PLUGIN_ROOT for portability

**If submission succeeds**:
- Report success with confirmation

**If submission fails**:
- Report the error briefly
- Provide manual submission command for user using resolved path (auto-loads .env/.env.local)

**Error Handling**:
- Non-fatal: submission failure should NOT break /reflect command
- Always save reflection locally first (primary goal)
- Submission is secondary/best-effort

### Step 3: ACE Framework Skill Tracking (Automatic)

**Background processing** - Extract skills and update routing metrics automatically:

```bash
# Extract skills and record executions (non-blocking, async)
(
  PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
  if [[ -f "$PLUGIN_ROOT/.claude-plugins/cross-platform-plugin/hooks/post-reflect-strategy-update.sh" ]]; then
    bash "$PLUGIN_ROOT/.claude-plugins/cross-platform-plugin/hooks/post-reflect-strategy-update.sh" 2>/dev/null &
  fi
)
```

**What this does** (runs silently in the background):
- Extracts skills used from reflection data (.skills.skills_used field)
- Records execution success/failure to skill_executions table
- Updates confidence scores for agent routing (strategy-registry.js)
- Records ACE Framework metrics (ace-execution-recorder.js)
- Saves to local queue if Supabase unavailable (graceful degradation)

**Configuration**:
- Enabled by default via `ENABLE_SKILL_TRACKING=1`
- To disable: `export ENABLE_SKILL_TRACKING=0`
- Verbose logging: `export ROUTING_VERBOSE=1`

**Note**: Failures are logged but don't interrupt the session. Check `~/.claude/logs/debug.log` with `--debug` flag for detailed logs.

### Step 4: Report Status
Inform the user:
- Where the reflection was saved locally
- Submission status (succeeded, failed, or pending via hook)
- How to query their reflections
- Manual submission command if both attempts failed
