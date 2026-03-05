# Salesforce Plugin Agent Routing

## Layout Generation Tasks

The following user requests should trigger the **sfdc-layout-generator** agent or **/design-layout** command.

### Keywords

**Primary Keywords:**
- "create layout", "generate layout", "design layout"
- "new Lightning page", "new FlexiPage"
- "layout for [persona]"

**Secondary Keywords:**
- "optimize layout", "improve layout"
- "migrate to Lightning"
- "persona-based layout"

### Example User Requests

✅ **Auto-Route to sfdc-layout-generator:**
- "Create a Contact layout for marketing users"
- "Generate an Opportunity layout for sales reps"
- "Design a Case layout for support agents"
- "Make a customer success Account layout"
- "Optimize the Lead layout for sales managers"
- "Create a Lightning page for executives viewing opportunities"

✅ **Confirm Before Routing:**
- "Can you help with layouts?" → Confirm scope, then route
- "I need a new page" → Clarify if FlexiPage, then route
- "How do I create layouts?" → Provide guidance, offer to generate

❌ **Do NOT Route to sfdc-layout-generator:**
- "Analyze this layout" → Use **sfdc-layout-analyzer** instead
- "Deploy this layout" → Manual deployment instructions (Phase 3 pending)
- "Get layout feedback" → Use sfdc-layout-feedback-processor (Phase 4 pending)

### Routing Decision Tree

```
User mentions "layout" or "Lightning page"
  ↓
Is task CREATION/GENERATION?
  ├─ YES → sfdc-layout-generator or /design-layout
  └─ NO → Is it ANALYSIS?
            ├─ YES → sfdc-layout-analyzer
            └─ NO → Is it DEPLOYMENT?
                      ├─ YES → Manual instructions (Phase 3 pending)
                      └─ NO → Ask for clarification
```

### Slash Command Alternative

Users can directly invoke layout generation:

```bash
/design-layout --object {Object} --persona {persona} --org {org}
```

This bypasses routing and directly invokes sfdc-layout-generator.

### Integration with Auto-Agent-Routing

If proactive agent routing is enabled, these patterns trigger automatic invocation:

**Pattern 1: Object + Persona**
```
"Create [a/an] {Object} layout for {persona} [users/role/team]"
→ Auto-invoke: sfdc-layout-generator with object={Object}, persona={persona}
```

**Pattern 2: Object + Org + Persona**
```
"Generate {Object} layout in {org} for {persona}"
→ Auto-invoke: sfdc-layout-generator with object={Object}, org={org}, persona={persona}
```

**Pattern 3: Persona-Only (Infer Object)**
```
"Make a layout for marketing users"
→ Prompt for object, then invoke sfdc-layout-generator
```

### Persona Detection

As of v3.13.0, seven personas are available:

**Standard Personas:**
1. **sales-rep** - Individual contributors managing deals
2. **sales-manager** - Pipeline and forecast management
3. **executive** - High-level KPIs only
4. **support-agent** - Case management and SLA tracking
5. **support-manager** - Team performance and escalations

**New Personas (v3.13.0):**
6. **marketing** - Marketing users focused on campaign attribution
7. **customer-success** - CSMs focused on health scores and renewals

**Routing Examples:**
```
"Create Contact layout for marketing"
→ persona=marketing, object=Contact

"Generate Account layout for CSM"
→ persona=customer-success, object=Account

"Design layout for customer success manager"
→ persona=customer-success, prompt for object

"Make an Opportunity layout for sales reps"
→ persona=sales-rep, object=Opportunity
```

### Keyword Aliases

**Persona Aliases** (map to official persona name):
- "CSM", "customer success manager", "customer success" → **customer-success**
- "marketing ops", "marketing user", "marketer" → **marketing**
- "rep", "sales rep", "AE", "account executive" → **sales-rep**
- "manager", "sales manager", "VP Sales" → **sales-manager**
- "exec", "C-level", "VP", "executive" → **executive**
- "support", "service agent", "case manager" → **support-agent**
- "support manager", "service manager" → **support-manager**

### Quality Threshold Routing

After generation, if quality score <85:

```
Quality score: 78/100 (C+)
  ↓
Offer options:
  1. Apply recommendations and regenerate
  2. Use different persona
  3. Proceed with current layout (not recommended)
```

Don't auto-retry without user confirmation.

### Pattern: fieldInstance v2.0.0

All routed layout generation uses the **fieldInstance pattern** (not Dynamic Forms):

**Why This Matters:**
- ✅ Works in ALL Salesforce editions
- ✅ No special permissions required
- ✅ Maximum compatibility and deployment reliability

**Pattern Documentation:** `docs/LAYOUT_PATTERNS.md`

---

**Last Updated:** 2025-10-18
**Version:** 2.0.0
**Part of:** salesforce-plugin v3.13.0
