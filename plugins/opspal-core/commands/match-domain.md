---
name: match-domain
description: Match data with domain-aware abbreviation expansion
argument-hint: "[options]"
arguments:
  - name: source
    description: Source text or file path to match
    required: false
  - name: --domain
    description: Industry domain (property-management, government, technology, financial)
    required: false
  - name: --org
    description: Org-specific override name
    required: false
  - name: --targets
    description: Path to JSON file with target records
    required: false
  - name: --auto-detect
    description: Auto-detect domain from data (default behavior)
    required: false
allowed_tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
---

# Domain-Aware Matching Command

Match data using industry-specific abbreviation dictionaries. The system automatically expands abbreviations like HOA, PD, SaaS, FCU based on the detected or specified domain.

## Available Domains

| Domain | Key Abbreviations |
|--------|-------------------|
| `property-management` | HOA, CAM, PM, COA, NNN, TI, LOI, NOI, CC&R, SFR |
| `government` | PD, SO, DA, AGO, DOT, DOC, DHS, DMV, FBI, DEA |
| `technology` | SaaS, IaaS, MSP, ISV, VAR, OEM, API, SDK, ARR, MRR |
| `financial` | FCU, FSB, FDIC, SEC, FINRA, AUM, NAV, AML, KYC |

## Usage Examples

### Path Resolution (required before running scripts)
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

DOMAIN_MATCHER=$(find_script "domain-aware-matcher.js")
DOMAIN_DICT_LOADER=$(find_script "domain-dictionary-loader.js")
DOMAIN_DETECTOR=$(find_script "domain-detector.js")
```

### List available domains
```bash
node "$DOMAIN_MATCHER" domains
```

### Match with explicit domain
```bash
node "$DOMAIN_MATCHER" match "ABC HOA" \
  --domain property-management \
  --targets ./accounts.json
```

### Match with auto-detection
```bash
node "$DOMAIN_MATCHER" match "San Diego PD" \
  --targets ./agencies.json
```

### Expand abbreviations
```bash
node "$DOMAIN_MATCHER" expand "FQHC of LA" \
  --domain healthcare
```

### Detect domain from text
```bash
node "$DOMAIN_MATCHER" detect "FDIC insured credit union"
```

### Detect domain from CSV headers
```bash
node "$DOMAIN_DETECTOR" headers "TenantName,UnitNumber,RentAmount"
```

## Target File Format

The `--targets` file should be JSON array of objects with at least a `name` property:

```json
[
  { "id": "001", "name": "ABC Property Management LLC", "state": "CA" },
  { "id": "002", "name": "San Diego Sheriff Department", "state": "CA" },
  { "id": "003", "name": "First National Bank", "state": "TX" }
]
```

## Org-Specific Overrides

Create custom abbreviations for specific organizations:

```bash
# Create override
node "$DOMAIN_DICT_LOADER" \
  create-override property-management acme-properties \
  --abbreviations '{"ACME": "Acme Property Management"}'

# Use override
node "$DOMAIN_MATCHER" match "ACME HOA" \
  --domain property-management \
  --org acme-properties
```

## Integration with Data Import

When importing CSV data, the domain detector can suggest the appropriate domain:

```javascript
const { DomainDetector } = require('./scripts/lib/domain-detector');
const detector = new DomainDetector();

// Detect from CSV headers
const headers = ['TenantName', 'UnitNumber', 'RentAmount', 'LeaseStart'];
const result = detector.detectFromHeaders(headers);
console.log(result.detectedDomain); // "property-management"
```

## Programmatic Usage

```javascript
const { DomainAwareMatcher } = require('./scripts/lib/domain-aware-matcher');

// With explicit domain
const matcher = new DomainAwareMatcher({
  domain: 'property-management',
  orgOverride: 'westside-properties' // optional
});

// With auto-detection
const matcher = new DomainAwareMatcher({ autoDetect: true });

// Match
const matches = matcher.match('ABC HOA Management', targets);

// Get domain info
console.log(matcher.getDomainInfo());
```

## Output Format

Match results include:
- `target`: Matched target name
- `targetId`: Target record ID
- `confidence`: Match confidence (0-100%)
- `matchType`: EXACT, HIGH, MEDIUM, LOW, BELOW_THRESHOLD
- `similarity`: Levenshtein similarity score
- `expansions`: Abbreviations that were expanded
- `synonymMatch`: Whether synonym matching boosted score
- `reason`: Human-readable match explanation
