---
name: generate-field-dictionary
description: Generate a field dictionary skeleton from Salesforce and/or HubSpot metadata caches
argument-hint: "acme-corp --sf-alias acme-prod"
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
thinking-mode: enabled
arguments:
  - name: org
    description: Organization slug for the dictionary (e.g., acme-corp, eta-corp)
    required: true
  - name: sf-alias
    description: Salesforce org alias (optional, for generating SF portion)
    required: false
  - name: hs-portal
    description: HubSpot portal name (optional, for generating HS portion)
    required: false
  - name: objects
    description: Comma-separated list of objects to include (optional)
    required: false
---

# Generate Field Dictionary

## Purpose

**What this command does**: Generates a field dictionary skeleton from Salesforce and/or HubSpot metadata caches. The dictionary bridges technical field metadata with business context for LLM-powered reporting agents.

**When to use it**:
- ✅ Setting up a new org for reporting automation
- ✅ After refreshing metadata caches
- ✅ Before building custom reports or dashboards
- ✅ When onboarding a new client

**When NOT to use it**:
- ❌ Dictionary already exists and is enriched (use `/enrich-field-dictionary` instead)
- ❌ No metadata cache exists (run `org-metadata-cache.js init` first)

## Usage

```bash
# Generate from Salesforce only
/generate-field-dictionary acme-corp --sf-alias acme-prod

# Generate from HubSpot only
/generate-field-dictionary acme-corp --hs-portal acme-portal

# Generate unified dictionary from both platforms
/generate-field-dictionary acme-corp --sf-alias acme-prod --hs-portal acme-portal

# Generate with specific objects
/generate-field-dictionary acme-corp --sf-alias acme-prod --objects Account,Opportunity,Lead
```

## PROCESS

### 1) Validate Prerequisites

**Check metadata cache exists for Salesforce:**
```bash
if [ -n "$SF_ALIAS" ]; then
  # Find instance directory
  INSTANCE_PATHS=(
    "instances/salesforce/${SF_ALIAS}/"
    "instances/${SF_ALIAS}/"
    "orgs/${ORG_SLUG}/platforms/salesforce/"
  )

  CACHE_FOUND=false
  for path in "${INSTANCE_PATHS[@]}"; do
    if [ -f "${path}/.metadata-cache/metadata.json" ]; then
      CACHE_FOUND=true
      SF_CACHE_PATH="${path}/.metadata-cache/metadata.json"
      break
    fi
  done

  if [ "$CACHE_FOUND" = false ]; then
    echo "❌ Salesforce metadata cache not found for ${SF_ALIAS}"
    echo "   Run: node plugins/opspal-salesforce/scripts/lib/org-metadata-cache.js init ${SF_ALIAS}"
    exit 1
  fi
fi
```

**Check metadata cache exists for HubSpot:**
```bash
if [ -n "$HS_PORTAL" ]; then
  HS_CACHE_PATH="plugins/opspal-hubspot/.cache/metadata/${HS_PORTAL}.json"
  if [ ! -f "$HS_CACHE_PATH" ]; then
    echo "❌ HubSpot metadata cache not found for ${HS_PORTAL}"
    echo "   Run: node plugins/opspal-hubspot/scripts/lib/hubspot-metadata-cache.js init ${HS_PORTAL} --token <token>"
    exit 1
  fi
fi
```

### 2) Check for Existing Dictionary

**Look for existing dictionary:**
```bash
DICT_PATH="orgs/${ORG_SLUG}/configs/field-dictionary.yaml"

if [ -f "$DICT_PATH" ]; then
  echo "⚠️ Dictionary already exists at: ${DICT_PATH}"
  echo ""
  echo "Options:"
  echo "  1. Merge with existing (preserves enrichments)"
  echo "  2. Overwrite (lose enrichments)"
  echo "  3. Cancel"
  # Prompt user for choice
fi
```

### 3) Generate Dictionary

**Run unified generator:**
```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/opspal-commercial/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

node "$(find_script "field-dictionary-generator.js")" generate "${ORG_SLUG}" \
  ${SF_ALIAS:+--sf-alias "$SF_ALIAS"} \
  ${HS_PORTAL:+--hs-portal "$HS_PORTAL"} \
  ${OBJECTS:+--sf-objects "$OBJECTS" --hs-objects "$OBJECTS"} \
  --skip-system
```

**Expected output:**
```
🔧 Generating unified field dictionary for: acme-corp

📦 Generating Salesforce dictionary from acme-prod...
   ✅ 15 objects, 487 fields

📦 Generating HubSpot dictionary from acme-portal...
   ✅ 4 objects, 156 properties

✅ Dictionary generated successfully!
==================================================
Location: orgs/acme-corp/configs/field-dictionary.yaml
Objects: 19
Fields: 643
Enrichment: 0%

Salesforce: 15 objects, 487 fields
HubSpot: 4 objects, 156 properties
```

### 4) Preview Dictionary Stats

**Show object breakdown:**
```
📊 Dictionary Contents
==================================================

Salesforce Objects:
  - Account: 47 fields (12 custom, 3 formula)
  - Contact: 38 fields (8 custom, 2 formula)
  - Lead: 42 fields (10 custom, 1 formula)
  - Opportunity: 55 fields (20 custom, 5 formula)
  - SBQQ__Quote__c: 89 fields (45 custom, 12 formula)
  ...

HubSpot Objects:
  - contacts: 78 properties (34 custom)
  - companies: 45 properties (12 custom)
  - deals: 52 properties (18 custom)
  - tickets: 31 properties (8 custom)

Auto-Inferred Tags:
  - Revenue: 45 fields
  - Pipeline: 38 fields
  - Marketing: 29 fields
  - Sales: 52 fields
  - CPQ: 67 fields
```

### 5) Report Success and Next Steps

**Success output:**
```
✅ Field Dictionary Generated!

📁 Location: orgs/acme-corp/configs/field-dictionary.yaml

📊 Summary:
   - Total Objects: 19
   - Total Fields: 643
   - Enrichment Status: none

📋 Next Steps:
   1. Review auto-inferred tags for accuracy
   2. Run /enrich-field-dictionary acme-corp to add business context
   3. Run /query-field-dictionary acme-corp <query> to test lookups

💡 Tip: Focus enrichment on these high-priority fields:
   - Revenue fields (Amount, ARR, MRR)
   - Pipeline fields (Stage, Close Date, Probability)
   - CPQ fields (Net Unit Price, Discount, Contract Term)
```

## Examples

### Example 1: Salesforce Only

```
User: /generate-field-dictionary eta-corp --sf-alias eta-corp-prod

Agent:
🔍 Checking prerequisites...
✓ Salesforce metadata cache found

📦 Generating Salesforce dictionary...
   Processing 18 objects...
   ✅ 18 objects, 612 fields

✅ Dictionary generated!
   Location: orgs/eta-corp/configs/field-dictionary.yaml
```

### Example 2: Unified Dictionary

```
User: /generate-field-dictionary acme-corp --sf-alias acme-prod --hs-portal acme

Agent:
🔍 Checking prerequisites...
✓ Salesforce metadata cache found
✓ HubSpot metadata cache found

📦 Generating Salesforce dictionary...
   ✅ 15 objects, 487 fields

📦 Generating HubSpot dictionary...
   ✅ 4 objects, 156 properties

📎 Merging platforms...

✅ Dictionary generated!
   Location: orgs/acme-corp/configs/field-dictionary.yaml
   Total: 19 objects, 643 fields
```

### Example 3: Specific Objects

```
User: /generate-field-dictionary test-org --sf-alias test --objects Account,Opportunity,SBQQ__Quote__c

Agent:
📦 Generating dictionary for 3 objects...
   - Account: 47 fields
   - Opportunity: 55 fields
   - SBQQ__Quote__c: 89 fields

✅ Dictionary generated!
   Location: orgs/test-org/configs/field-dictionary.yaml
```

## Error Handling

| Error | Resolution |
|-------|------------|
| Metadata cache not found | Run `org-metadata-cache.js init` for SF or `hubspot-metadata-cache.js init` for HS |
| No platform specified | Provide at least one of `--sf-alias` or `--hs-portal` |
| js-yaml not installed | Run `npm install js-yaml` in plugin directory |
| Permission denied | Check write permissions on orgs directory |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| FIELD_DICT_SKIP_SYSTEM | false | Skip system fields by default |
| FIELD_DICT_OUTPUT_FORMAT | yaml | Output format (yaml or json) |

## Output Files

| File | Location | Description |
|------|----------|-------------|
| field-dictionary.yaml | `orgs/{org}/configs/` | Main dictionary file |

## Related Commands

- `/enrich-field-dictionary` - Add business context to fields
- `/query-field-dictionary` - Query fields by name, tag, or audience
