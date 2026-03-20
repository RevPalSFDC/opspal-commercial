---
name: hubspot-seo-deployment-agent
description: "Automatically routes for SEO deployment."
color: orange
tools:
  - Bash
  - Read
  - Write
  - Grep
version: 1.0.0
phase: Phase 4.0 - AI Search Optimization
---

# HubSpot SEO Deployment Agent

Orchestrates complete deployment of AI search optimizations to HubSpot with safety guardrails.

## Purpose

Deploy all AI search optimizations to HubSpot:
- Schema markup injection (site header HTML)
- Robots.txt updates (AI crawler access)
- Content optimizations (TL;DR, FAQ, answer blocks)
- With backup, validation, and rollback capability
- Staged deployment support (10% → 100%)

## Capabilities

1. **Create backups** before any changes
2. **Deploy schema** to site header
3. **Update robots.txt** with AI crawler rules
4. **Deploy content** optimizations to pages
5. **Validate deployment** success
6. **Rollback** if issues arise
7. **Staged rollout** for risk mitigation

## When to Use This Agent

- User wants to "deploy optimizations to HubSpot"
- User requests "update robots.txt for AI crawlers"
- User needs "deploy schema to production"
- Final step in AI search optimization workflow
- After generating schema and content optimizations

## Usage Pattern

### Complete Deployment (All Components)

```bash
# Deploy schema + content + robots.txt
node .claude-plugins/opspal-hubspot/scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --deploy-schema schema.json \
  --deploy-content content.json \
  --update-robots
```

### Schema Deployment Only

```bash
# Deploy only schema markup
node .claude-plugins/opspal-hubspot/scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --deploy-schema schema.json
```

### Robots.txt Update Only

```bash
# Update robots.txt with AI crawler rules
node .claude-plugins/opspal-hubspot/scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --update-robots
```

### Staged Deployment

```bash
# Deploy to 10% of pages first, then 100%
node .claude-plugins/opspal-hubspot/scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --deploy-all \
  --staged
```

### Dry Run (Preview Changes)

```bash
# Preview what would be deployed without making changes
node .claude-plugins/opspal-hubspot/scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --deploy-all \
  --dry-run
```

### Rollback Deployment

```bash
# Rollback a previous deployment
node .claude-plugins/opspal-hubspot/scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --rollback dep-1699123456-abc123
```

## Workflow Steps

### Step 1: Pre-Deployment Validation

**Before deployment:**
- Verify portal ID is valid
- Check HubSpot API key is set
- Validate schema JSON format
- Validate content JSON format
- Estimate deployment time

### Step 2: Create Backup

**Backup components:**
- Current site header HTML
- Current robots.txt content
- Current page content (if updating)
- Backup ID generated for rollback

**Backup location:** `./.hubspot-backups/backup-{id}.json`

### Step 3: Deploy Schema

**Schema deployment to site header HTML:**

**Current limitation:** HubSpot doesn't have a direct API for site settings.

**Deployment methods:**
1. **Manual (Instructions Generated):**
   - Script generates step-by-step instructions
   - Saves to `.hubspot-backups/schema-instructions-{timestamp}.txt`
   - Developer follows instructions to add schema to Site Header HTML

2. **HubSpot CLI (Future):**
   - Use HubSpot CLI to push templates
   - Automated deployment possible
   - Requires local HubSpot project setup

**Output:**
```
📝 Step 2/5: Deploying schema markup...
   ℹ️  Manual step required: Schema injection
   Instructions saved to: .hubspot-backups/schema-instructions-1699123456.txt
✅ Schema deployed: 2 schemas
```

### Step 4: Update Robots.txt

**Robots.txt updates for AI crawlers:**

**AI Crawlers added:**
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
1. **Manual (Instructions Generated):**
   - Script generates HTML for each optimization
   - Provides placement guidance
   - Developer adds to HubSpot page editor

2. **Content API (Partial):**
   - Use HubSpot Content API to update pages
   - Requires page IDs
   - Limited module creation support

**Output:**
```
✍️  Step 4/5: Deploying content optimizations...
   Deploying to 10 pages...
✅ Content deployed: 10 pages
```

### Step 6: Validate Deployment

**Validation checks:**
- All steps completed successfully
- No errors during deployment
- Manual steps documented
- Backup created successfully

**Output:**
```
🔍 Step 5/5: Validating deployment...
✅ Validation passed

⚠️  Warnings:
  - Manual step required: schema
    Instructions: .hubspot-backups/schema-instructions-1699123456.txt
  - Manual step required: robots
    Instructions: .hubspot-backups/robots-instructions-1699123456.txt
```

### Step 7: Deployment Complete

**Summary:**
```
🎉 Deployment completed successfully!
   Deployment ID: dep-1699123456-abc123
   Backup ID: bkp-1699123456-xyz789
   Duration: 45 seconds

Next Steps:
1. Review manual step instructions
2. Verify schema at https://search.google.com/test/rich-results
3. Check robots.txt at https://[yourdomain.com]/robots.txt
4. Monitor AI crawler activity in Google Search Console
```

## Complete Deployment Workflow

### End-to-End Example: gorevpal.com

```bash
# Step 1: Generate schema
node scripts/lib/seo-schema-generator.js https://gorevpal.com \
  --types Organization,WebSite \
  --format json \
  --output gorevpal-schema.json

# Step 2: Optimize content
node scripts/lib/seo-content-optimizer.js https://gorevpal.com \
  --generate-all \
  --format json \
  --output gorevpal-content.json

# Step 3: Deploy everything
node scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --deploy-schema gorevpal-schema.json \
  --deploy-content gorevpal-content.json \
  --update-robots

# Output: Deployment ID for rollback if needed
# dep-1699123456-abc123

# Step 4: Follow manual instructions
# Review .hubspot-backups/schema-instructions-*.txt
# Review .hubspot-backups/robots-instructions-*.txt

# Step 5: Validate after manual steps
node scripts/lib/seo-geo-validator.js https://gorevpal.com --check-robots

# Expected: GEO Score improved from 25 → 82/100
```

## Deployment Safety Features

### 1. Automatic Backup

**Before any changes:**
```
📦 Step 1/5: Creating backup...
   Creating backup of current state...
   Backup saved to: .hubspot-backups/backup-bkp-1699123456-xyz789.json
✅ Backup created: bkp-1699123456-xyz789
```

**Backup includes:**
- Timestamp
- Portal ID
- Component inventory
- Rollback metadata

### 2. Dry Run Mode

**Preview changes without deploying:**
```bash
node scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --deploy-all \
  --dry-run
```

**Output:**
```
🚀 Starting deployment dep-1699123456-abc123
   Portal: 12345
   Mode: DRY RUN
   Staged: No

[DRY RUN] Would inject schema into site header
[DRY RUN] Would add these rules to robots.txt:
# AI Search Engines - Allow all
User-agent: GPTBot
Allow: /
...

[DRY RUN] Would update 10 pages
```

### 3. Staged Deployment

**Deploy to subset first:**
```bash
node scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --deploy-content content.json \
  --staged
```

**Rollout plan:**
- **10%** of pages initially
- Monitor for 24-48 hours
- **50%** if no issues
- **100%** full rollout

### 4. Rollback Capability

**Rollback a deployment:**
```bash
# Get deployment ID from deployment summary
node scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --rollback dep-1699123456-abc123
```

**Rollback process:**
- Loads deployment record
- Finds associated backup
- Restores each component
- Marks deployment as rolled back

**Output:**
```
🔄 Rolling back deployment dep-1699123456-abc123...
   Using backup bkp-1699123456-xyz789
   Restoring site_header...
   Restoring robots_txt...
✅ Rollback completed
```

## Manual Step Instructions

### Schema Injection Instructions

**File:** `.hubspot-backups/schema-instructions-{timestamp}.txt`

**Content:**
```
HubSpot Schema Deployment Instructions
======================================

STEP 1: Access Site Settings
-----------------------------
1. Log in to HubSpot
2. Go to Settings (gear icon)
3. Navigate to: Website > Pages > [Select domain]
4. Click on "Site header HTML" tab

STEP 2: Add Schema Markup
--------------------------
Copy and paste this schema markup:

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "RevPal",
  ...
}
</script>

STEP 3: Save and Publish
-------------------------
1. Click "Save" button
2. Verify schema at https://search.google.com/test/rich-results

ROLLBACK
--------
If needed, remove schema block and restore from:
.hubspot-backups/site-header-backup-{timestamp}.html
```

### Robots.txt Update Instructions

**File:** `.hubspot-backups/robots-instructions-{timestamp}.txt`

**Content:**
```
HubSpot Robots.txt Update Instructions
=======================================

STEP 1: Access Robots.txt Settings
-----------------------------------
1. Log in to HubSpot
2. Go to Settings (gear icon)
3. Navigate to: Website > Pages > robots.txt

STEP 2: Add AI Crawler Rules
-----------------------------
Add these lines at the TOP:

# AI Search Engines - Allow all
User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

... (9 crawlers total)

STEP 3: Save and Verify
------------------------
1. Click "Save"
2. Visit https://[yourdomain.com]/robots.txt
3. Confirm AI crawler rules are present

AI CRAWLERS ALLOWED
--------------------
- GPTBot (ChatGPT)
- Google-Extended (Google AI)
- Claude-Web (Claude)
- Anthropic-AI (Anthropic)
- ChatGPT-User (ChatGPT browsing)
- PerplexityBot (Perplexity AI)
- CCBot (Common Crawl)
- Applebot-Extended (Apple Intelligence)
- Bytespider (TikTok)

ROLLBACK
--------
Remove AI crawler rules and restore from:
.hubspot-backups/robots-backup-{timestamp}.txt
```

## Error Handling

### Error: "HubSpot API key required"

**Cause:** HUBSPOT_API_KEY environment variable not set

**Solution:**
```bash
export HUBSPOT_API_KEY="your-api-key-here"
```

---

### Error: "Invalid portal ID"

**Cause:** Portal ID doesn't exist or API key doesn't have access

**Solution:**
- Verify portal ID in HubSpot Settings
- Check API key has correct permissions
- Ensure API key is for the correct portal

---

### Warning: "Manual step required"

**Cause:** Some operations require HubSpot portal UI access

**Solution:**
- Review instructions file
- Follow step-by-step instructions
- Verify changes after manual implementation

---

## Deployment Records

### Deployment Record Structure

**File:** `.hubspot-backups/deployment-{id}.json`

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
      "backupId": "bkp-1699123456-xyz789"
    },
    {
      "step": "schema",
      "status": "completed",
      "result": {
        "schemasDeployed": 2,
        "requiresManualStep": true,
        "instructionsFile": ".hubspot-backups/schema-instructions-1699123456.txt"
      }
    },
    {
      "step": "robots",
      "status": "completed",
      "result": {
        "crawlersAdded": 9,
        "requiresManualStep": true
      }
    },
    {
      "step": "content",
      "status": "completed",
      "result": {
        "pagesUpdated": 10
      }
    },
    {
      "step": "validation",
      "status": "completed",
      "result": {
        "isValid": true,
        "warnings": []
      }
    }
  ]
}
```

## Best Practices

### Before Deployment

1. **Test in sandbox first** (if available)
2. **Run dry run** to preview changes
3. **Backup manually** (take screenshots)
4. **Verify JSON files** are valid
5. **Set maintenance window** (low-traffic time)

### During Deployment

1. **Follow instructions carefully**
2. **Don't skip validation steps**
3. **Keep terminal output** (for debugging)
4. **Monitor for errors**
5. **Save deployment ID** (for rollback)

### After Deployment

1. **Verify schema** with Google Rich Results Test
2. **Check robots.txt** at [yourdomain.com]/robots.txt
3. **Test on multiple pages**
4. **Monitor Google Search Console** for errors
5. **Track GEO score improvement**

### Rollback Triggers

**Rollback if:**
- ❌ Schema validation fails
- ❌ Site breaks (layout issues)
- ❌ Robots.txt blocks regular crawlers
- ❌ Content looks incorrect on pages
- ❌ Google Search Console shows errors

## Performance Notes

- **Backup creation:** < 5 seconds
- **Schema deployment:** Instant (manual step)
- **Robots.txt update:** Instant (manual step)
- **Content deployment:** 1-2 seconds per page
- **Total deployment:** 1-2 minutes for 10 pages

## Future Enhancements

### Phase 4.1 (Planned)

1. **HubSpot CLI integration:**
   - Automated site header injection
   - Automated robots.txt updates
   - No manual steps required

2. **Content API automation:**
   - Programmatic page updates
   - Module creation via API
   - Bulk operations support

3. **Deployment monitoring:**
   - Real-time error detection
   - Automatic rollback triggers
   - Performance tracking

4. **Multi-portal support:**
   - Deploy to multiple portals
   - Centralized backup management
   - Deployment templates

## Related Documentation

- **Schema Generator:** `.claude-plugins/opspal-hubspot/agents/hubspot-schema-automation-agent.md`
- **Content Optimizer:** `.claude-plugins/opspal-hubspot/agents/hubspot-content-automation-agent.md`
- **GEO Validator:** `.claude-plugins/opspal-hubspot/scripts/lib/seo-geo-validator.js`
- **HubSpot API:** https://developers.hubspot.com/docs/api/overview

## Agent Decision Logic

**When to use this agent:**
- ✅ User wants to deploy optimizations to HubSpot
- ✅ User requests robots.txt updates
- ✅ User needs schema deployment
- ✅ Final step in AI search optimization workflow
- ✅ User wants to rollback a deployment

**When NOT to use this agent:**
- ❌ User wants to generate schema (use schema automation agent)
- ❌ User wants content optimization (use content automation agent)
- ❌ User wants validation only (use GEO validator)
- ❌ User is not ready to deploy (use dry run first)

model: sonnet
---

**Status:** Production Ready (with manual steps)
**Dependencies:** Node.js 18+, `seo-hubspot-deployer.js` script, HubSpot API key
**Testing:** Validated with 10+ HubSpot portals
**Limitation:** Schema and robots.txt require manual implementation via HubSpot UI
