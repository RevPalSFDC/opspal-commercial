# Skills Evaluation Report for OpsPal Plugin Marketplace

**Date**: 2025-10-16
**Status**: Analysis Complete
**Recommendation**: Selective adoption for 3 specific use cases

---

## Executive Summary

After comprehensive analysis of Anthropic's Skills architecture against our current plugin system, I recommend **selective adoption** rather than wholesale conversion. Our architecture is fundamentally **API-driven and stateful**, which conflicts with Skills' core constraint: **no network access**.

**Bottom Line**: Skills provide value for ~20% of our content (knowledge bundles, reference docs, templates) but cannot replace the 80% that requires external API access.

---

## What Skills Solve For

### Core Value Proposition

1. **Progressive Disclosure Architecture**
   - Metadata loads first (~100 tokens)
   - Instructions load on-demand (~5k tokens)
   - Resources accessed via filesystem (no token cost)
   - **Benefit**: Optimizes token usage, only loads what's needed

2. **Cross-Conversation Reusability**
   - Skills persist across conversations
   - No need to re-explain domain expertise
   - **Benefit**: Reduces repetitive context loading

3. **Bundled Knowledge Packages**
   - Domain expertise + templates + reference materials together
   - Self-contained, portable
   - **Benefit**: Easier to distribute and maintain

4. **Zero Network Dependency**
   - Works in any environment
   - No API keys or credentials needed
   - **Benefit**: Simpler deployment, fewer failure modes

### Critical Limitations for Our Use Case

❌ **No External APIs**: Cannot call Salesforce, HubSpot, Supabase, Asana, or any HTTP endpoint
❌ **No Runtime Package Installation**: Pre-installed packages only (no npm install, no pip install)
❌ **No State Management**: Cannot persist data across sessions or users
❌ **Pre-configured Dependencies Only**: Cannot adapt to different org configurations
❌ **No MCP Tool Access**: Skills cannot use MCP servers (our primary integration method)

---

## Architecture Analysis

### ❌ What Should NOT Become Skills (80% of our codebase)

#### 1. Platform Integration Plugins

**Affected Plugins**:
- `salesforce-plugin` (49 agents, 313 scripts)
- `hubspot-plugin` (35 agents, 31 scripts)
- `opspal-core` (6 agents)
- `data-hygiene-plugin` (deduplication workflows)

**Why Not Skills**:

```
Current Architecture:
  Agent → MCP Tool → Salesforce API → Live Org Data

Skills Limitation:
  Agent → Bash/Python → ❌ NO NETWORK ACCESS ❌
```

**Examples That Won't Work in Skills**:

```bash
# ✅ Works in Plugin (requires sf CLI + network)
sf data query --query "SELECT Id FROM Account" --target-org prod

# ❌ Fails in Skill (no CLI tools, no network)
# Skills cannot execute sf CLI or make API calls
```

```javascript
// ✅ Works in Plugin (MCP tool with live data)
mcp_salesforce_data_query({ query: "SELECT...", org: "prod" })

// ❌ Fails in Skill (no MCP tools available)
// Skills have no access to MCP servers
```

```javascript
// ✅ Works in Plugin (HTTP API call)
await fetch('https://api.supabase.co/rest/v1/reflections', {
  method: 'POST',
  body: JSON.stringify(reflection)
})

// ❌ Fails in Skill (no network access)
// Skills cannot make HTTP requests
```

**Impact**: 80% of our functionality requires external API access by design.

**Verdict**: Core platform integrations MUST remain in plugins.

---

#### 2. Stateful Workflow Orchestration

**Affected Components**:
- `/reflect` command → Requires Supabase submission
- `/processreflections` workflow → Requires Asana task creation
- Reflection cohort detection → Requires database queries
- Assessment tracking → Requires org-specific state persistence
- Org context management → Requires filesystem + external storage

**Why Not Skills**:

Skills are **stateless** - no database, no persistence across sessions, no external state management.

**Our Requirements**:
- Track reflections across users and sessions → Requires Supabase database
- Create Asana tasks from cohorts → Requires Asana API access
- Maintain org context and assessment history → Requires persistent storage
- Coordinate multi-step workflows → Requires state tracking

**Example - /reflect workflow**:
```
Step 1: Analyze session (✅ Could work in Skill)
Step 2: Save reflection JSON locally (✅ Could work in Skill)
Step 3: Submit to Supabase database (❌ Requires HTTP API - FAILS in Skill)
Step 4: Trigger Asana task creation (❌ Requires Asana API - FAILS in Skill)
Step 5: Send Slack notification (❌ Requires webhook - FAILS in Skill)
```

**Verdict**: Workflow orchestration must remain in plugins.

---

#### 3. Dynamic Script Execution

**Affected Components**:
- 512+ scripts in `scripts/lib/` across all plugins
- Examples: org-quirks-detector.js, time-series-pattern-detector.js, dual-system-analyzer.js

**Why Not Skills**:

Most scripts require one or more of:
1. External CLI tools (`sf`, `node`, `jq`, `curl`, `xmllint`)
2. Dynamic NPM packages (varies by script)
3. Filesystem writes outside the Skill directory
4. API calls to external platforms

**Example - org-quirks-detector.js**:
```javascript
function executeQuery(orgAlias, soql) {
  // ❌ FAILS in Skill: No sf CLI available
  const result = execSync(
    `sf data query --query "${soql}" --target-org ${orgAlias} --json`,
    { encoding: 'utf8' }
  );
  return JSON.parse(result);
}
```

**Skills Limitation**:
- No sf CLI installed
- No dynamic org targeting
- Cannot execute external commands beyond bash/python

**Verdict**: Dynamic scripts requiring external CLIs cannot be Skills.

---

### ✅ What SHOULD Become Skills (20% of our content)

#### 1. Assessment Framework Knowledge Bundles

**Opportunity**: CPQ Assessment Framework, RevOps Assessment Framework, Security Assessment Framework

**Why Skills Work Here**:
- ✅ Pure knowledge content (methodology, checklists, taxonomy)
- ✅ Reference materials that agents consult (not execute)
- ✅ No external API calls needed
- ✅ Benefits from progressive disclosure (only load when needed)
- ✅ Large token footprint that isn't always needed

**Current Problem**:

```markdown
File: .claude-plugins/opspal-salesforce/agents/sfdc-cpq-assessor.md
Size: 9,000 tokens

Content:
- Assessment methodology (2,000 tokens)
- Error taxonomy (1,500 tokens)
- Data quality protocols (2,000 tokens)
- Report templates (1,500 tokens)
- Troubleshooting guides (2,000 tokens)

Problem: ALL 9,000 tokens load EVERY time agent is invoked,
         even if assessment doesn't need full framework
```

**Skill Conversion**:

```
Skill: cpq-assessment
Location: ~/.claude/skills/cpq-assessment/

SKILL.md (5,000 tokens - loads on-demand):
  - Assessment methodology
  - Phase-by-phase workflow
  - Data quality protocols

resources/ (accessed via bash - zero token cost):
  - taxonomy.json (error classification)
  - checklists.md (pre-flight validation)
  - playbooks/ (assessment templates)
  - troubleshooting.md (issue resolution)

Agent: sfdc-cpq-assessor.md (2,000 tokens - always loaded):
  - Core orchestration logic
  - MCP tool invocation
  - Reference to cpq-assessment skill when needed
```

**Benefits**:
- Agent size drops from 9,000 → 2,000 tokens (78% reduction)
- Framework only loads when explicitly needed
- Reference materials accessible without token cost
- Cross-surface availability (Claude.ai, API, Code)

**Token Savings**: ~7,000 tokens per invocation when framework not needed

**Estimated Implementation**: 6 hours

**ROI Calculation**:
- CPQ assessments: ~4/month
- Token savings: 7,000 tokens × 50% of invocations = 3,500 tokens/assessment
- Annual savings: 3,500 × 4 × 12 = 168,000 tokens
- Additional benefit: Faster context loading

---

#### 2. Reference Documentation & Best Practices

**Opportunity**: Salesforce metadata best practices, field naming conventions, automation patterns, error troubleshooting guides

**Why Skills Work Here**:
- ✅ Static reference content (changes infrequently)
- ✅ Large documents that agents consult occasionally
- ✅ No API calls required
- ✅ Progressive disclosure prevents unnecessary token usage

**Current Problem**:

```markdown
File: .claude-plugins/opspal-salesforce/agents/sfdc-metadata-analyzer.md
Size: 12,000 tokens

Content:
- Analysis logic (3,000 tokens)
- Field naming conventions (1,500 tokens)
- Validation rule patterns (2,000 tokens)
- Flow best practices (2,000 tokens)
- Governor limit reference (1,500 tokens)
- Common errors troubleshooting (2,000 tokens)

Problem: Agent embeds ALL reference content inline,
         consuming 9,000 tokens even when just analyzing flows
```

**Skill Conversion**:

```
Skill: salesforce-metadata-standards
Location: ~/.claude/skills/salesforce-metadata-standards/

SKILL.md (3,000 tokens):
  - Standards overview
  - When to use each standard
  - Best practice principles

resources/:
  - field-naming-conventions.md (500 lines)
  - validation-rule-patterns.md (300 lines)
  - flow-best-practices.md (400 lines)
  - governor-limits.json (comprehensive reference)
  - common-errors.md (600 lines troubleshooting)

Agent: sfdc-metadata-analyzer.md (3,000 tokens):
  - Analysis orchestration
  - Metadata API queries
  - Reference to standards skill when needed
```

**Benefits**:
- Agent size drops from 12,000 → 3,000 tokens (75% reduction)
- Standards only load when agent needs to validate against them
- Reference docs accessible via bash without context cost

**Token Savings**: ~9,000 tokens per invocation when standards not consulted

**Additional Skills in This Category**:
- `hubspot-property-standards`: Property naming, catalog, workflow patterns
- `salesforce-security-standards`: Permission best practices, FLS guidelines
- `error-troubleshooting-kb`: Common error patterns and resolutions

**Estimated Implementation**: 3 hours per documentation bundle

---

#### 3. Code Generation Templates & Boilerplate

**Opportunity**: Agent scaffolding templates, script templates, command templates, Apex/LWC code templates

**Why Skills Work Here**:
- ✅ Templated code generation (no API calls needed)
- ✅ Large template files that consume tokens
- ✅ Can be accessed via bash without loading into context
- ✅ Pure local file operations

**Current Problem**:

```markdown
File: .claude-plugins/developer-tools-plugin/agents/plugin-scaffolder.md
Size: 8,000 tokens

Content:
- Scaffolding logic (1,500 tokens)
- Agent template (1,200 tokens)
- Command template (800 tokens)
- Script template (1,000 tokens)
- Plugin manifest template (500 tokens)
- README template (1,500 tokens)
- Example code (1,500 tokens)

Problem: All templates embedded inline,
         even though most scaffolding only uses 1-2 templates
```

**Skill Conversion**:

```
Skill: plugin-scaffolding-templates
Location: ~/.claude/skills/plugin-scaffolding-templates/

SKILL.md (2,000 tokens):
  - Template usage guide
  - Customization patterns
  - Examples of each template type

resources/templates/:
  - agent-template.md
  - command-template.md
  - script-template.js
  - plugin-manifest-template.json
  - readme-template.md
  - gitignore-template

resources/examples/:
  - complete-plugin-example/
  - minimal-plugin-example/

Agent: plugin-scaffolder.md (1,500 tokens):
  - Scaffolding orchestration
  - Interactive wizard
  - File writing logic
  - Reference to templates skill
```

**Access Pattern**:
```bash
# Agent reads template without loading into context
cat ~/.claude/skills/plugin-scaffolding-templates/resources/templates/agent-template.md
```

**Benefits**:
- Agent size drops from 8,000 → 1,500 tokens (81% reduction)
- Templates accessed on-demand via filesystem
- Easy to add new templates without bloating agent

**Token Savings**: ~6,500 tokens per invocation

**Additional Skills in This Category**:
- `salesforce-code-templates`: Apex classes, LWC components, test classes, flows
- `automation-pattern-templates`: Workflow templates, validation rule patterns
- `hubspot-workflow-templates`: HubSpot workflow JSON templates

**Estimated Implementation**: 4 hours per template bundle

---

## Hybrid Architecture Recommendation

### Optimal Pattern: Plugins + Skills Working Together

**Plugins** (Keep for - 80% of functionality):
- ✅ External API integrations (Salesforce, HubSpot, Supabase, Asana)
- ✅ Stateful workflows (reflection processing, Asana task creation)
- ✅ Dynamic script execution (org-specific operations)
- ✅ MCP tool orchestration
- ✅ Cross-agent coordination
- ✅ Deployment automation
- ✅ Data operations

**Skills** (Add for - 20% of content):
- ✅ Assessment framework knowledge bundles
- ✅ Reference documentation & best practices
- ✅ Code generation templates
- ✅ Static knowledge that agents consult occasionally
- ✅ Large reference materials (error catalogs, troubleshooting guides)

### Integration Example

**Before (Plugin Only)**:
```markdown
File: .claude-plugins/opspal-salesforce/agents/sfdc-cpq-assessor.md
Size: 9,000 tokens
Load Time: Every invocation
Content: Assessment logic + Full framework + All templates

Problem: 7,000 tokens of framework content loads even for simple queries
```

**After (Plugin + Skill)**:
```markdown
File: .claude-plugins/opspal-salesforce/agents/sfdc-cpq-assessor.md
Size: 2,000 tokens
Load Time: Every invocation
Content: Assessment orchestration + MCP tool usage

---
name: sfdc-cpq-assessor
tools: mcp_salesforce, Bash, Read, Write
---

# Salesforce CPQ Assessment Agent

You perform comprehensive CPQ assessments using live Salesforce data.

For detailed assessment methodology and checklists, invoke the
`cpq-assessment` skill.

## Core Responsibilities
1. Query live Salesforce data via MCP tools
2. Analyze CPQ configuration and utilization
3. Generate recommendations

## Assessment Workflow
When starting full assessment:
1. Use skill: cpq-assessment (loads framework on-demand)
2. Execute queries via mcp_salesforce tools
3. Apply data quality protocols from skill
4. Generate report using templates from skill

[Rest of agent focused on orchestration logic only]
```

**Skill File**:
```markdown
File: ~/.claude/skills/cpq-assessment/SKILL.md
Size: 5,000 tokens
Load Time: Only when agent invokes skill
Content: Full framework methodology

---
name: cpq-assessment
description: CPQ assessment framework, checklists, and playbooks
---

# CPQ Assessment Framework v2.0

[Complete methodology, error taxonomy, data quality protocols]

## Resources Available
- resources/taxonomy.json - Error classification
- resources/checklists.md - Pre-flight validation
- resources/playbooks/ - Assessment templates
- resources/troubleshooting.md - Issue resolution
```

**Result**:
- Agent loads fast (2k tokens vs 9k tokens)
- Framework loads only when needed
- Templates accessible via bash (zero token cost)
- No loss of functionality

---

## Implementation Priorities

### Phase 1: High-Value Quick Wins (2 weeks)

**Priority 1: CPQ Assessment Framework → Skill**
- **Effort**: 6 hours
- **Token Savings**: 7,000 per invocation (50% of invocations)
- **Frequency**: ~4 assessments/month
- **Annual Savings**: ~168,000 tokens
- **Additional Benefit**: Faster agent loading

**Priority 2: Salesforce Metadata Standards → Skill**
- **Effort**: 4 hours
- **Token Savings**: 9,000 per invocation (40% of invocations)
- **Frequency**: ~20 metadata operations/month
- **Annual Savings**: ~864,000 tokens
- **Additional Benefit**: Centralized standards reference

**Priority 3: Plugin Scaffolding Templates → Skill**
- **Effort**: 4 hours
- **Token Savings**: 6,500 per invocation
- **Frequency**: ~2 plugin creations/month
- **Annual Savings**: ~156,000 tokens
- **Additional Benefit**: Easier template maintenance

**Phase 1 Total**:
- **Effort**: 14 hours
- **Annual Token Savings**: ~1,188,000 tokens
- **Cost Savings**: ~$2.40/year (token cost is low, but context efficiency is high)
- **Primary Benefit**: Faster context windows, more room for actual work

---

### Phase 2: Medium-Value Extensions (2-4 weeks)

**Priority 4: RevOps Assessment Framework → Skill** (6 hours)
**Priority 5: HubSpot Property Standards → Skill** (3 hours)
**Priority 6: Salesforce Code Templates → Skill** (4 hours)
**Priority 7: Error Troubleshooting Knowledge Base → Skill** (5 hours)

**Phase 2 Total**:
- **Effort**: 18 hours
- **Additional Annual Savings**: ~750,000 tokens

---

### Phase 3: Long-Term (Evaluate After Phases 1-2)

8. Security assessment frameworks
9. Integration pattern libraries
10. Migration playbook templates
11. Governor limit references
12. API documentation bundles

---

## What NOT to Do

### ❌ Don't Convert Core Plugins

**Keep These As Plugins**:
- ❌ salesforce-plugin → Requires Salesforce API access (MCP tools)
- ❌ hubspot-plugin → Requires HubSpot API access (MCP tools)
- ❌ Reflection system → Requires Supabase/Asana APIs
- ❌ Data hygiene plugin → Requires cross-platform API coordination
- ❌ Cross-platform plugin → Requires Asana/instance management APIs

**Why**: These are fundamentally API-driven and stateful.

---

### ❌ Don't Duplicate Tools

**Bad Pattern**:
```
Skill: salesforce-data-operations
Content: Tries to replicate sf CLI functionality
Result: ❌ FAILS - No network access, no sf CLI
```

**Good Pattern**:
```
Plugin: salesforce-plugin (keeps MCP tool orchestration)
Skill: salesforce-metadata-standards (reference docs only)
Result: ✅ Works - Clear separation of concerns
```

**Principle**:
- Skills for knowledge, NOT execution
- Plugins for execution and API integration
- No overlap or duplication

---

### ❌ Don't Over-Skill

**When NOT to Create a Skill**:

1. **Small Content (<2,000 tokens)**
   - No benefit from progressive disclosure
   - Keep inline in agent

2. **Frequently Changing Content**
   - Skills are harder to update than plugin files
   - Keep in plugin for easier maintenance

3. **Platform-Specific Configuration**
   - Skills are cross-platform (same for all users)
   - Org-specific config should stay in plugins

4. **Content Needed Every Time**
   - If agent always needs it, no benefit from progressive disclosure
   - Keep inline in agent

**Example - Keep Inline**:
```markdown
# Agent with 1,500 tokens of methodology
# Used 100% of invocations
# Verdict: Keep inline (no progressive disclosure benefit)
```

**Example - Convert to Skill**:
```markdown
# Agent with 8,000 tokens of reference docs
# Used 20% of invocations
# Verdict: Convert to Skill (80% token savings)
```

---

## Success Criteria

### Skill Adoption is Successful If:

1. ✅ **Agent token counts drop 30-50%** for agents referencing Skills
2. ✅ **Context window utilization improves** (more room for actual work)
3. ✅ **Assessment agents load faster** (progressive disclosure working)
4. ✅ **Reference documentation centralized** and easily accessible
5. ✅ **Zero regression** in API-based functionality
6. ✅ **Maintenance remains simple** (Skills easy to update)
7. ✅ **User experience unchanged** (agents work the same from user perspective)

---

### Skill Adoption is NOT Successful If:

1. ❌ **Agents become slower** (Skills loading overhead outweighs benefits)
2. ❌ **External API functionality breaks** (conversion went too far)
3. ❌ **Maintenance burden increases** (too many Skills to manage)
4. ❌ **User experience degrades** (Skills not accessible or confusing)
5. ❌ **Cross-surface sync issues** (Skills not available where needed)
6. ❌ **Token usage increases** (poor Skill design)

---

## Measurement Plan

### Before Implementation (Baseline)

**Measure**:
1. Token usage per agent invocation (average)
2. Agent file sizes (in tokens)
3. Context window utilization (average % filled)
4. Agent load time (subjective)

**Baseline Data to Capture**:
```
sfdc-cpq-assessor:
  - Agent file size: 9,000 tokens
  - Average invocation cost: 12,000 tokens (agent + context)
  - Load time: ~2 seconds
  - Framework needed: 50% of invocations

sfdc-metadata-analyzer:
  - Agent file size: 12,000 tokens
  - Average invocation cost: 15,000 tokens
  - Load time: ~2.5 seconds
  - Standards consulted: 40% of invocations

plugin-scaffolder:
  - Agent file size: 8,000 tokens
  - Average invocation cost: 10,000 tokens
  - Load time: ~1.5 seconds
  - Templates used: 100% but only 2-3 per invocation
```

---

### After Implementation (30-Day Evaluation)

**Measure**:
1. Token usage per agent invocation (with Skills)
2. Agent file sizes (after Skill extraction)
3. Context window utilization (with progressive disclosure)
4. Agent load time (with Skill invocation)
5. Skill access frequency (how often Skills are invoked)

**Target Metrics**:
```
sfdc-cpq-assessor:
  - Agent file size: <3,000 tokens (66% reduction) ✅
  - Invocation cost (no Skill): ~5,000 tokens ✅
  - Invocation cost (with Skill): ~10,000 tokens (still 17% improvement) ✅
  - Load time: <1 second (faster) ✅

sfdc-metadata-analyzer:
  - Agent file size: <4,000 tokens (67% reduction) ✅
  - Invocation cost (no standards): ~6,000 tokens ✅
  - Invocation cost (with standards): ~9,000 tokens (40% improvement) ✅
  - Load time: <1 second ✅

plugin-scaffolder:
  - Agent file size: <2,000 tokens (75% reduction) ✅
  - Invocation cost: ~4,000 tokens (60% improvement) ✅
  - Load time: <0.5 seconds ✅
```

---

## Recommended Pilot: CPQ Assessment Framework

### Why Start Here

**Pros**:
- ✅ Clear boundaries (pure knowledge, no API calls)
- ✅ Measurable token savings (~7,000 per invocation)
- ✅ Easy rollback (just revert agent file)
- ✅ Low risk (assessment logic stays in plugin)
- ✅ Representative use case (if this works, others will too)

**Cons**:
- ⚠️ Requires Skill invocation pattern (slight learning curve)
- ⚠️ Need to test across surfaces (Code, API, claude.ai)

---

### Pilot Implementation Plan (1 week)

**Day 1-2: Create Skill**
1. Extract framework content from sfdc-cpq-assessor.md
2. Create `~/.claude/skills/cpq-assessment/SKILL.md`
3. Organize resources/ directory (taxonomy, checklists, playbooks)
4. Write Skill documentation

**Day 3-4: Update Agent**
1. Streamline sfdc-cpq-assessor.md (remove embedded framework)
2. Add Skill invocation instructions
3. Test agent with Skill invocation
4. Verify all assessment phases still work

**Day 5: Testing**
1. Test Skill loading (verify progressive disclosure)
2. Benchmark token usage (before/after)
3. Validate assessment quality (no regressions)
4. Test resource access (bash reading files)

**Day 6-7: Cross-Surface Testing**
1. Test in Claude Code (primary use case)
2. Upload to Claude API (if used)
3. Upload to claude.ai (if used)
4. Document any cross-surface issues

---

### Pilot Success Criteria (30 Days)

**Must Achieve**:
1. ✅ Token usage drops 30%+ when framework not needed
2. ✅ Zero regressions in assessment quality
3. ✅ No performance degradation
4. ✅ Easy to update (Skill maintenance is simple)

**Nice to Have**:
1. ✅ Agent loading feels faster
2. ✅ Framework easier to maintain (centralized)
3. ✅ Template updates simpler (resource files)

**Rollback Triggers**:
1. ❌ Token usage increases (Skill overhead too high)
2. ❌ Assessments break (Skill not accessible)
3. ❌ Maintenance becomes harder (complexity added)
4. ❌ Cross-surface issues (Skills not syncing)

---

### Rollback Plan

If pilot doesn't meet success criteria:

**Step 1**: Revert agent file
```bash
git checkout HEAD~1 .claude-plugins/opspal-salesforce/agents/sfdc-cpq-assessor.md
```

**Step 2**: Delete Skill
```bash
rm -rf ~/.claude/skills/cpq-assessment/
```

**Step 3**: Document lessons learned
- Why didn't it work?
- What would need to change?
- Is Skills architecture not suitable for our use case?

**Step 4**: Reassess Skills value
- Are Skills worth pursuing for other use cases?
- Should we abandon Skills entirely?
- Should we try a different approach?

---

## Questions to Answer Before Proceeding

### 1. Scope Preference

**Question**: User-scope Skills (`~/.claude/skills/`) or project-scope (`.claude/skills/`)?

**Options**:

**User-Scope** (`~/.claude/skills/`):
- ✅ Available across all your projects
- ✅ Global access (no need to reinstall per project)
- ❌ Not version-controlled with plugins
- ❌ Manual sync across machines

**Project-Scope** (`.claude/skills/` in this repo):
- ✅ Version-controlled with plugins
- ✅ Automatic distribution via git
- ❌ Need to install per project
- ❌ Duplicated across projects

**Recommendation**: **User-scope** for assessment frameworks (reusable), **project-scope** for templates (version-specific)

---

### 2. Cross-Surface Usage

**Question**: Do you use Claude.ai and Claude API, or primarily Claude Code?

**Impact**:
- **Claude Code only**: Skills are easy (just create locally)
- **Multiple surfaces**: Skills need separate upload to each (claude.ai, API)

**Recommendation**: Start with Claude Code, expand to other surfaces if pilot succeeds

---

### 3. Token Budget Priority

**Question**: Are token savings a primary concern, or more interested in organizational benefits?

**Context**:
- Token cost is low (~$0.002 per 1,000 tokens)
- Real value is context efficiency (more room for work)

**Impact on Priorities**:
- **Token savings priority**: Focus on highest-token agents first
- **Organization priority**: Focus on most-referenced docs first

---

### 4. Pilot Duration

**Question**: Comfortable with 2-week pilot, or want smaller proof-of-concept first?

**Options**:

**2-Week Full Pilot** (recommended):
- Week 1: Implement cpq-assessment Skill
- Week 2: Test and measure
- Decision point: Proceed with Phase 1 or rollback

**1-Week POC**:
- Day 1-3: Create minimal Skill (just taxonomy.json)
- Day 4-5: Test Skill loading and access
- Day 6-7: Measure and decide
- Faster feedback, lower investment

---

## Final Recommendation

### Skills Are Valuable, But NOT a Replacement

**Use Skills for**: Knowledge bundles, reference docs, templates (~20% of content)
**Keep Plugins for**: API integrations, stateful workflows, dynamic operations (~80% of content)

### Your Plugin Architecture is Fundamentally Correct

Your current system is well-designed for API-driven, stateful operations. Skills are a **complementary optimization**, not a paradigm shift.

### Start Small, Measure, Iterate

1. **Pilot**: CPQ Assessment Framework → Skill (1 week)
2. **Measure**: Token savings, performance, maintenance (30 days)
3. **Decide**: Proceed with Phase 1 or adjust approach
4. **Scale**: If successful, convert metadata standards and templates

### Expected Outcome

If Skills work well for your use case:
- ✅ 30-50% token reduction for reference-heavy agents
- ✅ Faster context windows
- ✅ Centralized knowledge management
- ✅ No loss of functionality

If Skills don't work well:
- ❌ Rollback is simple (revert agent file, delete Skill)
- ❌ No harm done (pilot is low-risk)
- ✅ Still learned what Skills are good for

---

## Next Steps (If Approved)

1. **Review this report** and answer the 4 questions above
2. **Approve pilot approach** (cpq-assessment Skill conversion)
3. **Schedule 1 week** for implementation
4. **Run 30-day evaluation**
5. **Decision point**: Proceed with Phase 1 or adjust

---

## Appendix: Skill File Structure Examples

### Example 1: CPQ Assessment Skill

```
~/.claude/skills/cpq-assessment/
├── SKILL.md                          # Core methodology (5,000 tokens)
└── resources/
    ├── taxonomy.json                 # Error classification
    ├── checklists.md                 # Pre-flight validation
    ├── data-quality-protocols.md     # Mandatory checks
    ├── troubleshooting.md            # Issue resolution
    └── playbooks/
        ├── phase1-discovery.md
        ├── phase2-utilization.md
        ├── phase3-configuration.md
        └── phase4-recommendations.md
```

### Example 2: Metadata Standards Skill

```
~/.claude/skills/salesforce-metadata-standards/
├── SKILL.md                          # Standards overview (3,000 tokens)
└── resources/
    ├── field-naming-conventions.md
    ├── validation-rule-patterns.md
    ├── flow-best-practices.md
    ├── governor-limits.json
    ├── common-errors.md
    └── examples/
        ├── good-validation-rule.xml
        ├── bad-validation-rule.xml
        └── optimized-flow.xml
```

### Example 3: Template Skill

```
~/.claude/skills/plugin-scaffolding-templates/
├── SKILL.md                          # Template usage guide (2,000 tokens)
└── resources/
    ├── templates/
    │   ├── agent-template.md
    │   ├── command-template.md
    │   ├── script-template.js
    │   ├── plugin-manifest-template.json
    │   └── readme-template.md
    └── examples/
        ├── complete-plugin/
        └── minimal-plugin/
```

---

**Report Complete**

**Next Action**: Review findings and decide whether to proceed with pilot implementation of cpq-assessment Skill.
