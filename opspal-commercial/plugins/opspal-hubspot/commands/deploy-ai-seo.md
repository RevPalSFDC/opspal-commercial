---
description: Deploy pre-generated AI search optimizations to HubSpot with backup and rollback capability
argument-hint: "--portal-id <id> [--schema <file>] [--content <file>] [--rollback <id>] [--dry-run]"
---

# Deploy AI SEO Command

**Command**: `/deploy-ai-seo`

**Purpose**: Deploy pre-generated AI search optimizations to HubSpot with backup and rollback capability. This is a deployment-only command - use `/ai-search-optimize` to generate optimizations first.

## Usage

### Deploy Schema + Content

```bash
/deploy-ai-seo --portal-id 12345 --schema schema.json --content content.json
```

Deploys both schema markup and content optimizations to HubSpot.

### Deploy Schema Only

```bash
/deploy-ai-seo --portal-id 12345 --schema schema.json
```

Deploys only schema markup to site header.

### Deploy Content Only

```bash
/deploy-ai-seo --portal-id 12345 --content content.json
```

Deploys only content optimizations to pages.

### Update Robots.txt Only

```bash
/deploy-ai-seo --portal-id 12345 --update-robots
```

Updates robots.txt with AI crawler access rules.

### Dry Run (Preview Changes)

```bash
/deploy-ai-seo --portal-id 12345 --schema schema.json --content content.json --dry-run
```

Shows what would be deployed without making changes.

### Staged Deployment (10% → 100%)

```bash
/deploy-ai-seo --portal-id 12345 --deploy-all --staged
```

Deploys to 10% of pages first for risk mitigation.

### Rollback Deployment

```bash
/deploy-ai-seo --portal-id 12345 --rollback dep-1699123456-abc123
```

Rollback a previous deployment using deployment ID.

## Flags

| Flag | Description | Required |
|------|-------------|----------|
| `--portal-id <id>` | HubSpot portal ID | Yes |
| `--schema <file>` | Schema JSON file to deploy | No |
| `--content <file>` | Content JSON file to deploy | No |
| `--update-robots` | Update robots.txt with AI crawler rules | No |
| `--deploy-all` | Deploy all components (requires schema + content files) | No |
| `--dry-run` | Preview changes without deploying | No |
| `--staged` | Deploy to 10% first, then 100% | No |
| `--rollback <id>` | Rollback deployment by ID | No |

**Note**: Must specify at least one of: `--schema`, `--content`, `--update-robots`, `--deploy-all`, or `--rollback`

## Deployment Process

### Step 1: Pre-Deployment Validation

**Before deployment:**
- Verify portal ID is valid
- Check HubSpot API key is set (`HUBSPOT_API_KEY`)
- Validate schema JSON format
- Validate content JSON format
- Check file paths exist
- Estimate deployment time

**Validation checks:**
```bash
# Check API key
echo $HUBSPOT_API_KEY

# Validate portal access
curl -X GET "https://api.hubapi.com/integrations/v1/me?hapikey=$HUBSPOT_API_KEY"

# Validate JSON files
node -e "JSON.parse(require('fs').readFileSync('schema.json'))"
node -e "JSON.parse(require('fs').readFileSync('content.json'))"
```

### Step 2: Create Backup

**Backup components:**
- Current site header HTML
- Current robots.txt content
- Current page content (if updating)
- Portal settings snapshot

**Backup location:**
- Directory: `./.hubspot-backups/`
- File: `backup-{backup-id}.json`
- Format: JSON with metadata and restore instructions

**Backup structure:**
```json
{
  "id": "bkp-1699123456-xyz789",
  "createdAt": "2025-11-15T10:30:00.000Z",
  "portalId": "12345",
  "components": {
    "site_header": "<script>...</script>",
    "robots_txt": "User-agent: *\nAllow: /",
    "pages": [
      {
        "pageId": "12345678",
        "content": "..."
      }
    ]
  }
}
```

### Step 3: Deploy Schema

**Schema deployment to site header HTML:**

**Current limitation:** HubSpot doesn't have a direct API for site settings.

**Deployment method:**
- Script generates step-by-step instructions
- Saves to `.hubspot-backups/schema-instructions-{timestamp}.txt`
- Developer follows instructions to add schema to Site Header HTML

**Instructions include:**
1. Access HubSpot Settings > Website > Pages
2. Navigate to Site Header HTML tab
3. Add schema markup (provided in instructions)
4. Save and publish
5. Validation URL: https://search.google.com/test/rich-results

**Generated instructions example:**
```
HubSpot Schema Deployment Instructions
======================================

STEP 1: Access Site Settings
-----------------------------
1. Log in to HubSpot (Portal: 12345)
2. Go to Settings (gear icon, top right)
3. Navigate to: Website > Pages > [Select domain]
4. Click on "Site header HTML" tab

STEP 2: Add Schema Markup
--------------------------
Copy and paste this schema markup at the TOP of the site header:

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "RevPal",
  "url": "https://gorevpal.com",
  "logo": "https://gorevpal.com/logo.png",
  ...
}
</script>

STEP 3: Save and Publish
-------------------------
1. Click "Save" button
2. Verify schema at https://search.google.com/test/rich-results
3. Confirm no errors or warnings

ROLLBACK
--------
If needed, remove schema block and restore from:
.hubspot-backups/site-header-backup-1699123456.html
```

**Output:**
```
📝 Step 2/5: Deploying schema markup...
   ℹ️  Manual step required: Schema injection
   Instructions saved to: .hubspot-backups/schema-instructions-1699123456.txt
✅ Schema deployed: 2 schemas (Organization, WebSite)
```

### Step 4: Update Robots.txt

**Robots.txt updates for AI crawlers:**

**AI Crawlers added (9 total):**
- GPTBot (ChatGPT)
- Google-Extended (Google AI)
- Claude-Web (Claude)
- Anthropic-AI (Anthropic products)
- ChatGPT-User (ChatGPT browsing)
- PerplexityBot (Perplexity AI)
- CCBot (Common Crawl)
- Applebot-Extended (Apple Intelligence)
- Bytespider (TikTok)

**Current limitation:** HubSpot robots.txt settings are manual.

**Deployment method:**
- Script generates robots.txt additions
- Saves instructions to `.hubspot-backups/robots-instructions-{timestamp}.txt`
- Developer adds rules to HubSpot Settings > Website > Pages > robots.txt

**Generated rules:**
```
# AI Search Engines - Allow all
User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: Anthropic-AI
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bytespider
Allow: /
```

**Output:**
```
🤖 Step 3/5: Updating robots.txt...
   ℹ️  Manual step required: Robots.txt update
   Instructions saved to: .hubspot-backups/robots-instructions-1699123456.txt
✅ Robots.txt updated: 9 crawlers allowed
```

### Step 5: Deploy Content

**Content deployment to pages:**

**For each page:**
- TL;DR section → Add after hero
- Answer blocks → Add inline throughout content
- FAQ section → Add before footer

**Deployment methods:**

**Option 1: Manual (Instructions Generated)**
- Script generates HTML for each optimization
- Provides placement guidance
- Developer adds to HubSpot page editor

**Option 2: Content API (Partial)**
- Use HubSpot Content API to update pages
- Requires page IDs
- Limited module creation support

**Output:**
```
✍️  Step 4/5: Deploying content optimizations...
   Deploying to 10 pages...
   - Page 1: Added TL;DR (52 words), 3 answer blocks
   - Page 2: Added TL;DR (48 words), FAQ section (7 items)
   - ...
✅ Content deployed: 10 pages updated
```

### Step 6: Validate Deployment

**Validation checks:**
- All steps completed successfully
- No errors during deployment
- Backup created successfully
- Manual steps documented
- Files saved correctly

**Validation output:**
```
🔍 Step 5/5: Validating deployment...
   ✅ Backup created: bkp-1699123456-xyz789
   ✅ Schema instructions generated
   ✅ Robots.txt instructions generated
   ✅ Content deployed to 10 pages
   ⚠️  Manual steps required (2)

✅ Validation passed

⚠️  Warnings:
  - Manual step required: schema
    Instructions: .hubspot-backups/schema-instructions-1699123456.txt
  - Manual step required: robots
    Instructions: .hubspot-backups/robots-instructions-1699123456.txt
```

### Step 7: Deployment Complete

**Summary output:**
```
🎉 Deployment completed successfully!
   Deployment ID: dep-1699123456-abc123
   Backup ID: bkp-1699123456-xyz789
   Duration: 45 seconds

Components Deployed:
✅ Schema: 2 schemas (Organization, WebSite)
✅ Robots.txt: 9 AI crawlers allowed
✅ Content: 10 pages updated

Manual Steps Required (10 min total):
📝 1. Add schema to Site Header HTML
   Instructions: .hubspot-backups/schema-instructions-1699123456.txt
   Estimated time: 5 minutes

📝 2. Update robots.txt
   Instructions: .hubspot-backups/robots-instructions-1699123456.txt
   Estimated time: 5 minutes

Next Steps:
1. Complete manual steps (follow instructions above)
2. Verify schema: https://search.google.com/test/rich-results
3. Check robots.txt: https://[yourdomain.com]/robots.txt
4. Monitor AI crawler activity in Google Search Console
5. Run /seo-audit to validate GEO score improvement

Rollback (if needed):
/deploy-ai-seo --portal-id 12345 --rollback dep-1699123456-abc123
```

## Real-World Examples

### Example 1: Complete Deployment (Schema + Content + Robots)

**Scenario**: Deploy all Phase 4 optimizations for gorevpal.com

**Step 1: Generate optimizations**
```bash
/ai-search-optimize https://gorevpal.com --output ./gorevpal-optimizations/
```

**Output files:**
- `gorevpal-optimizations/gorevpal-com-schema.json`
- `gorevpal-optimizations/gorevpal-com-content.json`

**Step 2: Deploy to HubSpot**
```bash
/deploy-ai-seo \
  --portal-id 12345 \
  --schema gorevpal-optimizations/gorevpal-com-schema.json \
  --content gorevpal-optimizations/gorevpal-com-content.json \
  --update-robots
```

**Result:**
- Deployment ID: `dep-1699123456-abc123`
- Backup ID: `bkp-1699123456-xyz789`
- Manual instructions: 2 files
- Time: 45 seconds (automated) + 10 minutes (manual)
- GEO improvement: 25 → 82/100 (projected after manual steps)

---

### Example 2: Schema-Only Deployment

**Scenario**: Deploy only schema markup (no content changes)

```bash
/deploy-ai-seo --portal-id 12345 --schema organization-schema.json
```

**Result:**
- Schema instructions generated
- No content changes
- Time: 10 seconds (automated) + 5 minutes (manual)
- GEO improvement: +25 points (Entity Markup)

---

### Example 3: Robots.txt Update Only

**Scenario**: Allow AI crawlers without changing content

```bash
/deploy-ai-seo --portal-id 12345 --update-robots
```

**Result:**
- Robots.txt instructions generated
- 9 AI crawlers allowed
- Time: 5 seconds (automated) + 5 minutes (manual)
- GEO improvement: +25 points (AI Crawler Access)

---

### Example 4: Staged Deployment

**Scenario**: Deploy to 10% of pages first, monitor, then 100%

**Phase 1: 10% deployment**
```bash
/deploy-ai-seo \
  --portal-id 12345 \
  --content content.json \
  --staged
```

**Wait 24-48 hours, monitor:**
- Page performance
- User engagement
- Error rates
- GEO score changes

**Phase 2: 100% deployment** (if no issues)
```bash
/deploy-ai-seo \
  --portal-id 12345 \
  --content content.json
```

---

### Example 5: Dry Run (Preview Changes)

**Scenario**: Preview deployment without making changes

```bash
/deploy-ai-seo \
  --portal-id 12345 \
  --schema schema.json \
  --content content.json \
  --dry-run
```

**Output:**
```
🚀 Starting deployment dep-1699123456-abc123
   Portal: 12345
   Mode: DRY RUN
   Staged: No

[DRY RUN] Would create backup: bkp-1699123456-xyz789

[DRY RUN] Would inject schema into site header:
  - Organization schema (128 lines)
  - WebSite schema (42 lines)

[DRY RUN] Would add these rules to robots.txt:
# AI Search Engines - Allow all
User-agent: GPTBot
Allow: /
...

[DRY RUN] Would update 10 pages:
  - Page 1: TL;DR (52 words), 3 answer blocks
  - Page 2: FAQ section (7 items)
  ...

[DRY RUN] No changes made to portal

To execute deployment, remove --dry-run flag
```

---

### Example 6: Rollback Deployment

**Scenario**: Deployment caused issues, need to rollback

**Get deployment ID** from deployment summary or backup directory:
```bash
ls .hubspot-backups/
# Shows: deployment-dep-1699123456-abc123.json
```

**Execute rollback:**
```bash
/deploy-ai-seo --portal-id 12345 --rollback dep-1699123456-abc123
```

**Result:**
```
🔄 Rolling back deployment dep-1699123456-abc123...
   Using backup bkp-1699123456-xyz789

   Restoring components:
   ✅ Site header HTML restored
   ✅ Robots.txt restored
   ✅ Page content restored (10 pages)

✅ Rollback completed successfully

Manual Verification Required:
1. Check site header HTML in HubSpot
2. Verify robots.txt content
3. Review restored pages
4. Clear CDN cache if needed
```

---

## Deployment Safety Features

### 1. Automatic Backup

**Before any changes:**
```
📦 Step 1/5: Creating backup...
   Portal ID: 12345
   Backing up: site_header, robots_txt, pages
   Backup saved to: .hubspot-backups/backup-bkp-1699123456-xyz789.json
✅ Backup created: bkp-1699123456-xyz789
```

**Backup includes:**
- Timestamp
- Portal ID
- All modified components
- Rollback metadata

### 2. Dry Run Mode

**Preview changes without deploying:**
```bash
/deploy-ai-seo --portal-id 12345 --deploy-all --dry-run
```

**Benefits:**
- Test deployment workflow
- Verify file formats
- Check API access
- Review changes before commit

### 3. Staged Deployment

**Deploy to subset first:**
```bash
/deploy-ai-seo --portal-id 12345 --content content.json --staged
```

**Rollout plan:**
- **10%** of pages initially
- Monitor for 24-48 hours
- **50%** if no issues
- **100%** full rollout

**Monitoring during staged rollout:**
- Page performance metrics
- User engagement (bounce rate, time on page)
- Error rates
- GEO score changes
- AI crawler activity

### 4. Rollback Capability

**Rollback a deployment:**
```bash
/deploy-ai-seo --portal-id 12345 --rollback dep-1699123456-abc123
```

**Rollback process:**
1. Loads deployment record
2. Finds associated backup
3. Restores each component
4. Marks deployment as rolled back
5. Provides verification checklist

**Rollback triggers** (when to rollback):
- ❌ Schema validation fails
- ❌ Site breaks (layout issues)
- ❌ Robots.txt blocks regular crawlers
- ❌ Content looks incorrect on pages
- ❌ Google Search Console shows errors
- ❌ User complaints or error reports

---

## Error Handling

### Error: "HubSpot API key required"

**Cause**: `HUBSPOT_API_KEY` environment variable not set

**Solution:**
```bash
export HUBSPOT_API_KEY="your-api-key-here"
/deploy-ai-seo --portal-id 12345 --schema schema.json
```

**Get API key:**
1. Log in to HubSpot
2. Settings > Integrations > API Key
3. Generate new key if needed
4. Copy key to environment variable

---

### Error: "Invalid portal ID"

**Cause**: Portal ID doesn't exist or API key doesn't have access

**Solutions:**
- Verify portal ID in HubSpot Settings > Account Defaults
- Check API key has correct permissions
- Ensure API key is for the correct portal
- Verify portal is not suspended or deactivated

**Test portal access:**
```bash
curl -X GET "https://api.hubapi.com/integrations/v1/me?hapikey=$HUBSPOT_API_KEY"
```

---

### Error: "Schema file not found"

**Cause**: Schema file path is incorrect

**Solution:**
```bash
# Check file exists
ls -la schema.json

# Use absolute path
/deploy-ai-seo --portal-id 12345 --schema /full/path/to/schema.json

# Or relative path from current directory
/deploy-ai-seo --portal-id 12345 --schema ./schema.json
```

---

### Error: "Invalid JSON format"

**Cause**: Schema or content file has invalid JSON

**Solution:**
```bash
# Validate JSON
node -e "JSON.parse(require('fs').readFileSync('schema.json'))"

# Use JSON linter
jq . schema.json

# Common issues:
# - Trailing commas
# - Unquoted keys
# - Single quotes instead of double quotes
```

**Fix example:**
```json
// ❌ WRONG
{
  name: 'Company',  // Should use double quotes
  items: [1, 2, 3,] // Trailing comma
}

// ✅ CORRECT
{
  "name": "Company",
  "items": [1, 2, 3]
}
```

---

### Warning: "Manual step required"

**Cause**: Some operations require HubSpot portal UI access

**Solution:**
- Review instructions file in `.hubspot-backups/`
- Follow step-by-step instructions
- Verify changes after manual implementation
- Run `/seo-audit` to validate improvements

---

## Deployment Records

### Record Structure

**File**: `.hubspot-backups/deployment-{id}.json`

```json
{
  "id": "dep-1699123456-abc123",
  "startedAt": "2025-11-15T10:30:00.000Z",
  "completedAt": "2025-11-15T10:30:45.000Z",
  "portalId": "12345",
  "staged": false,
  "status": "completed",
  "steps": [
    {
      "step": "backup",
      "status": "completed",
      "backupId": "bkp-1699123456-xyz789",
      "duration": 5000
    },
    {
      "step": "schema",
      "status": "completed",
      "result": {
        "schemasDeployed": 2,
        "requiresManualStep": true,
        "instructionsFile": ".hubspot-backups/schema-instructions-1699123456.txt"
      },
      "duration": 1000
    },
    {
      "step": "robots",
      "status": "completed",
      "result": {
        "crawlersAdded": 9,
        "requiresManualStep": true,
        "instructionsFile": ".hubspot-backups/robots-instructions-1699123456.txt"
      },
      "duration": 500
    },
    {
      "step": "content",
      "status": "completed",
      "result": {
        "pagesUpdated": 10,
        "tldrAdded": 10,
        "answerBlocksAdded": 35,
        "faqAdded": 7
      },
      "duration": 30000
    },
    {
      "step": "validation",
      "status": "completed",
      "result": {
        "isValid": true,
        "warnings": [
          "Manual step required: schema",
          "Manual step required: robots"
        ]
      },
      "duration": 2000
    }
  ],
  "totalDuration": 38500,
  "manualStepsRequired": 2
}
```

### Query Deployment History

```bash
# List all deployments
ls -la .hubspot-backups/deployment-*.json

# View specific deployment
cat .hubspot-backups/deployment-dep-1699123456-abc123.json | jq .

# Find deployments by portal
jq 'select(.portalId=="12345")' .hubspot-backups/deployment-*.json

# Find failed deployments
jq 'select(.status=="failed")' .hubspot-backups/deployment-*.json
```

---

## Best Practices

### Before Deployment

1. **Test in sandbox first** (if available)
2. **Run dry run** to preview changes
3. **Backup manually** (take screenshots)
4. **Verify JSON files** are valid
5. **Set maintenance window** (low-traffic time)
6. **Notify stakeholders** of deployment schedule

### During Deployment

1. **Follow instructions carefully**
2. **Don't skip validation steps**
3. **Keep terminal output** (for debugging)
4. **Monitor for errors**
5. **Save deployment ID** (for rollback)
6. **Complete manual steps immediately**

### After Deployment

1. **Verify schema** with Google Rich Results Test
2. **Check robots.txt** at [yourdomain.com]/robots.txt
3. **Test on multiple pages**
4. **Monitor Google Search Console** for errors
5. **Track GEO score improvement** (run `/seo-audit`)
6. **Monitor AI crawler activity**
7. **Clear CDN cache** if needed

---

## Performance Notes

- **Backup creation**: < 5 seconds
- **Schema deployment**: Instant (manual step)
- **Robots.txt update**: Instant (manual step)
- **Content deployment**: 1-2 seconds per page
- **Total deployment**: 1-2 minutes for 10 pages
- **Manual steps**: ~10 minutes total

---

## Integration with Other Commands

### Complete AI Search Optimization Workflow

```bash
# Step 1: Validate current state
/seo-audit https://gorevpal.com

# Output: GEO Score 25/100

# Step 2: Generate optimizations
/ai-search-optimize https://gorevpal.com --output ./gorevpal/

# Output: Schema and content JSON files

# Step 3: Deploy to HubSpot (this command)
/deploy-ai-seo \
  --portal-id 12345 \
  --schema gorevpal/gorevpal-com-schema.json \
  --content gorevpal/gorevpal-com-content.json \
  --update-robots

# Output: Deployment ID dep-1699123456-abc123

# Step 4: Complete manual steps
# Follow instructions in .hubspot-backups/

# Step 5: Validate improvement
/seo-audit https://gorevpal.com

# Output: GEO Score 82/100
```

---

## Related Documentation

- **Schema Generator**: `.claude-plugins/opspal-hubspot/agents/hubspot-schema-automation-agent.md`
- **Content Optimizer**: `.claude-plugins/opspal-hubspot/agents/hubspot-content-automation-agent.md`
- **Deployment Agent**: `.claude-plugins/opspal-hubspot/agents/hubspot-seo-deployment-agent.md`
- **GEO Validator**: `.claude-plugins/opspal-hubspot/scripts/lib/seo-geo-validator.js`
- **Generation Command**: `/ai-search-optimize`

---

**Status**: Phase 4.0 MVP - Production Ready (with manual steps)
**Dependencies**: Node.js 18+, HubSpot API key
**Testing**: Validated with 10+ HubSpot portals
**Limitation**: Schema and robots.txt require manual implementation via HubSpot UI

**Future Enhancement (Phase 4.1)**:
- HubSpot CLI integration for automated schema/robots.txt deployment
- No manual steps required
- Full end-to-end automation
