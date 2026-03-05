# HubSpot CMS Pages API Integration Plan
**Version**: 1.0.0
**Date**: 2025-11-04
**Status**: Planning Phase
**Target Plugin**: `hubspot-plugin` and `hubspot-integrations-plugin`

## Executive Summary

This plan integrates the HubSpot CMS Pages API playbook into our existing HubSpot plugin infrastructure. The integration will enable programmatic management of website pages and landing pages, including creation, retrieval, updating, cloning, deletion, and publishing workflows (draft vs. live, scheduled vs. immediate).

**Key Deliverables**:
- 2 new script libraries for CMS Pages API operations
- 1 enhanced agent (hubspot-cms-content-manager)
- 1 new specialized agent (hubspot-cms-page-publisher)
- 3 new slash commands
- 2 validation hooks
- Comprehensive test suite
- PDF report generation for page audits

**Estimated Effort**: 16-20 hours
**Priority**: Medium-High (enables marketing automation capabilities)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Script Libraries](#script-libraries)
3. [Agent Integration](#agent-integration)
4. [Agent Wiring Strategy](#agent-wiring-strategy)
5. [Slash Commands](#slash-commands)
6. [Validation Hooks](#validation-hooks)
7. [Testing Strategy](#testing-strategy)
8. [Documentation Updates](#documentation-updates)
9. [Implementation Phases](#implementation-phases)
10. [Success Criteria](#success-criteria)

---

## Architecture Overview

### Component Hierarchy

```
┌──────────────────────────────────────────────────────────────┐
│                  User / Orchestrator                          │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            │ delegates to
                            ↓
┌──────────────────────────────────────────────────────────────┐
│             hubspot-cms-content-manager (enhanced)            │
│  - Overall CMS operations coordination                        │
│  - Delegates page operations to specialist                    │
│  - SEO validation workflow integration                        │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            │ delegates to
                            ↓
┌──────────────────────────────────────────────────────────────┐
│          hubspot-cms-page-publisher (NEW)                     │
│  - Specialized page publishing workflows                      │
│  - Draft vs. live management                                  │
│  - Scheduling and immediate publish                           │
│  - Publishing validation and rollback                         │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            │ uses
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                   Script Libraries                            │
├──────────────────────────────────────────────────────────────┤
│  1. hubspot-cms-pages-manager.js                             │
│     - Create, retrieve, update, clone, delete pages           │
│     - Page metadata management                                │
│     - Template assignment                                     │
│                                                               │
│  2. hubspot-cms-publishing-controller.js                     │
│     - Draft vs. live state management                         │
│     - Immediate publish (push-live endpoint)                  │
│     - Scheduled publish (schedule endpoint)                   │
│     - Publishing history tracking                             │
└──────────────────────────────────────────────────────────────┘
```

### Integration with Existing Agents

```
hubspot-orchestrator
  ├─ Knows when to delegate to cms-content-manager
  ├─ Routes "page", "landing page", "website" keywords
  └─ Handles multi-step CMS operations

hubspot-cms-content-manager (existing - enhanced)
  ├─ Delegates page CRUD to cms-page-publisher
  ├─ Maintains SEO validation workflow
  ├─ Coordinates with hubspot-seo-optimizer
  └─ Generates PDF reports for page audits

hubspot-cms-page-publisher (NEW)
  ├─ Specializes in page lifecycle management
  ├─ Handles publish/schedule workflows
  ├─ Validates before publishing
  └─ Provides rollback capabilities

hubspot-seo-optimizer (existing)
  └─ Pre-publish SEO validation (unchanged)
```

---

## Script Libraries

### 1. hubspot-cms-pages-manager.js

**Location**: `.claude-plugins/opspal-hubspot/scripts/lib/hubspot-cms-pages-manager.js`

**Purpose**: Core CMS Pages API operations (CRUD operations)

**Exports**:

```javascript
class HubSpotCMSPagesManager {
  constructor(options) {
    this.client = new HubSpotClientV3(options);
    this.pageType = options.pageType || 'site-pages'; // or 'landing-pages'
  }

  // Create new page
  async createPage(pageData) {
    // POST /cms/v3/pages/{pageType}
    // Returns: { id, name, slug, url, state, ... }
  }

  // Retrieve single page by ID
  async getPage(pageId) {
    // GET /cms/v3/pages/{pageType}/{pageId}
    // Returns: Full page object
  }

  // List all pages with filtering
  async listPages(filters = {}) {
    // GET /cms/v3/pages/{pageType}
    // Supports: limit, createdAfter, createdBefore, updatedAfter, sort, archived
    // Returns: Paginated list with cursor
  }

  // Get all pages (handles pagination automatically)
  async getAllPages(filters = {}) {
    // Wrapper around listPages with auto-pagination
    // Returns: Array of all pages
  }

  // Update existing page (PATCH)
  async updatePage(pageId, updates) {
    // PATCH /cms/v3/pages/{pageType}/{pageId}
    // Sparse updates - only provided fields changed
    // Returns: Updated page object
  }

  // Clone existing page
  async clonePage(pageId, cloneName) {
    // POST /cms/v3/pages/{pageType}/clone
    // Body: { id, cloneName }
    // Returns: New page object (draft state)
  }

  // Delete page (hard delete/archive)
  async deletePage(pageId) {
    // DELETE /cms/v3/pages/{pageType}/{pageId}
    // Returns: 204 No Content
  }

  // Soft archive (dashboard archive)
  async archivePage(pageId) {
    // PATCH with "archivedInDashboard": true
    // Returns: Updated page object
  }

  // Restore from archive
  async restorePage(pageId) {
    // PATCH with "archivedInDashboard": false
    // Returns: Updated page object
  }

  // Get page by slug
  async getPageBySlug(slug) {
    // List with filter, find by slug
    // Returns: Page object or null
  }

  // Validate template exists
  async validateTemplate(templatePath) {
    // Check if template exists in Design Manager
    // Returns: { exists: boolean, template: {...} }
  }

  // Batch operations
  async batchCreatePages(pagesData) {
    // Create multiple pages with rate limiting
    // Returns: Array of created pages
  }

  async batchUpdatePages(updates) {
    // Update multiple pages with rate limiting
    // Returns: Array of updated pages
  }
}

module.exports = HubSpotCMSPagesManager;
```

**Key Features**:
- ✅ Uses HubSpotClientV3 for all API calls
- ✅ Automatic pagination with `getAllPages()`
- ✅ Rate limiting built-in via HubSpotClientV3
- ✅ Validates required fields before API calls
- ✅ Throws DataAccessError on failures (no fake data)
- ✅ Supports both site-pages and landing-pages
- ✅ Template validation before page creation

---

### 2. hubspot-cms-publishing-controller.js

**Location**: `.claude-plugins/opspal-hubspot/scripts/lib/hubspot-cms-publishing-controller.js`

**Purpose**: Publishing workflow management (draft → live, scheduling)

**Exports**:

```javascript
class HubSpotCMSPublishingController {
  constructor(options) {
    this.client = new HubSpotClientV3(options);
    this.pageType = options.pageType || 'site-pages';
  }

  // Immediate publish (push draft to live)
  async publishPageNow(pageId) {
    // POST /cms/v3/pages/{pageType}/{pageId}/draft/push-live
    // Returns: Published page object
  }

  // Schedule publish for future date
  async schedulePublish(pageId, publishDate) {
    // POST /cms/v3/pages/{pageType}/schedule
    // Body: { id, publishDate } (ISO 8601)
    // Returns: 204 No Content, page state becomes SCHEDULED
  }

  // Cancel scheduled publish
  async cancelScheduledPublish(pageId) {
    // Update page to remove schedule (if HubSpot API supports)
    // Otherwise: update publishDate to null
  }

  // Get publishing status
  async getPublishingStatus(pageId) {
    // GET page and check: currentlyPublished, state, publishDate
    // Returns: {
    //   isPublished: boolean,
    //   state: 'DRAFT'|'PUBLISHED'|'SCHEDULED',
    //   publishDate: timestamp | null,
    //   url: string
    // }
  }

  // Validate before publish
  async validateBeforePublish(pageId) {
    // Pre-publish checks:
    // - Required fields populated
    // - Template valid
    // - No broken links (if configured)
    // - SEO minimum requirements (if configured)
    // Returns: { valid: boolean, errors: [], warnings: [] }
  }

  // Create page snapshot before publish (for rollback)
  async createPublishSnapshot(pageId) {
    // Clone page to temporary "snapshot" for rollback
    // Returns: { snapshotId, originalPageId }
  }

  // Rollback to previous version
  async rollbackToVersion(pageId, snapshotId) {
    // Copy content from snapshot back to page
    // Returns: Restored page object
  }

  // Batch publish multiple pages
  async batchPublishPages(pageIds, options = {}) {
    // Publish multiple pages with rate limiting
    // Options: { immediate: true/false, publishDate: timestamp }
    // Returns: Array of publish results
  }

  // Get publishing history
  async getPublishingHistory(pageId) {
    // Retrieve audit trail of publishes (if HubSpot provides)
    // Returns: Array of publish events
  }

  // Preview draft changes
  async getPreviewUrl(pageId) {
    // Generate preview URL for draft content
    // Returns: { previewUrl: string, expiresAt: timestamp }
  }
}

module.exports = HubSpotCMSPublishingController;
```

**Key Features**:
- ✅ Immediate and scheduled publishing
- ✅ Pre-publish validation
- ✅ Publishing history tracking
- ✅ Rollback capabilities via snapshots
- ✅ Batch operations with rate limiting
- ✅ Preview URL generation

---

## Agent Integration

### 1. Enhance hubspot-cms-content-manager

**Location**: `.claude-plugins/hubspot-integrations-plugin/agents/hubspot-cms-content-manager.md`

**Changes**:

```markdown
---
name: hubspot-cms-content-manager
description: Comprehensive HubSpot CMS Hub management specialist handling website pages, blog posts, landing pages, templates, modules, and content optimization with SEO, personalization, and multi-language support. Now includes full CMS Pages API capabilities for programmatic page management.
tools:
  - Task  # NEW - for delegating to hubspot-cms-page-publisher
  - mcp__hubspot-enhanced-v3__hubspot_search
  - mcp__hubspot-enhanced-v3__hubspot_create
  - mcp__hubspot-enhanced-v3__hubspot_update
  - mcp__hubspot-enhanced-v3__hubspot_export
  - mcp__context7__*
  - mcp__playwright__*
  - Read
  - Write
  - TodoWrite
  - Grep
  - WebFetch
---

# CMS Pages API Capabilities (NEW)

## When to Delegate to hubspot-cms-page-publisher

You MUST delegate to `hubspot-cms-page-publisher` for these operations:

| Task Pattern | Delegate | Reason |
|-------------|----------|--------|
| "create page", "new landing page" | hubspot-cms-page-publisher | Page lifecycle specialist |
| "publish page", "go live", "schedule publish" | hubspot-cms-page-publisher | Publishing workflow specialist |
| "clone page", "duplicate page" | hubspot-cms-page-publisher | Efficient cloning with validation |
| "delete page", "archive page" | hubspot-cms-page-publisher | Safe deletion with confirmations |
| "update page", "edit page content" | hubspot-cms-page-publisher | Draft management expertise |

**Delegation Pattern**:
```javascript
// Example: Publishing a page
const result = await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
  action: 'publish_page',
  pageId: '12345',
  publishType: 'immediate', // or 'scheduled'
  publishDate: '2025-12-01T15:00:00Z', // if scheduled
  validateSEO: true // run SEO validation first
}));
```

## CMS Pages Workflow Integration

### Creating Pages with SEO Validation

```javascript
// Step 1: Delegate page creation to specialist
const pageResult = await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
  action: 'create_page',
  pageData: {
    name: "New Landing Page",
    slug: "new-landing-page",
    language: "en",
    templatePath: "path/to/template.html"
  }
}));

const pageId = pageResult.pageId;

// Step 2: Run SEO validation (your responsibility)
const seoAnalysis = await Task.invoke('hubspot-seo-optimizer', JSON.stringify({
  action: 'analyze_content',
  content: pageResult.content,
  targetKeyword: extractKeyword(pageResult.name)
}));

// Step 3: If SEO score acceptable, delegate publishing
if (seoAnalysis.score >= 60) {
  await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
    action: 'publish_page',
    pageId: pageId,
    publishType: 'immediate'
  }));
}
```

### Bulk Page Operations

For operations involving 10+ pages, use batch operations:

```javascript
// Delegate bulk creation
await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
  action: 'batch_create_pages',
  pages: [
    { name: "Page 1", slug: "page-1", ... },
    { name: "Page 2", slug: "page-2", ... }
  ]
}));
```

## Coordination with Other Agents

### SEO Pre-Publish Workflow (Unchanged)

The existing SEO validation workflow remains your responsibility:
1. Content created/updated (via hubspot-cms-page-publisher)
2. YOU invoke hubspot-seo-optimizer for validation
3. YOU decide whether to proceed with publish
4. YOU delegate publish to hubspot-cms-page-publisher if approved

### Publishing Approval Pattern

For high-stakes pages (homepage, key landing pages):

```javascript
// Step 1: Create and validate
const page = await createPageWithSEOValidation(pageData);

// Step 2: Generate preview
const preview = await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
  action: 'get_preview_url',
  pageId: page.id
}));

// Step 3: Request user approval
console.log(`Preview: ${preview.url}`);
const approved = await confirmWithUser("Approve publish?");

// Step 4: Publish if approved
if (approved) {
  await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
    action: 'publish_page',
    pageId: page.id,
    publishType: 'immediate'
  }));
}
```

## Error Handling

### Publishing Failures

If `hubspot-cms-page-publisher` reports a publishing failure:

1. **Check validation errors**: Review returned error details
2. **SEO issues**: Re-run SEO optimization if score too low
3. **Template issues**: Validate template path exists
4. **Content issues**: Check required fields populated

### Rollback Pattern

```javascript
// Create snapshot before risky changes
const snapshot = await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
  action: 'create_snapshot',
  pageId: pageId
}));

try {
  // Make changes
  await updatePage(pageId, newContent);
  await publishPage(pageId);
} catch (error) {
  // Rollback on failure
  await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
    action: 'rollback',
    pageId: pageId,
    snapshotId: snapshot.id
  }));
}
```

[... REST OF EXISTING AGENT CONTENT ...]
```

---

### 2. Create hubspot-cms-page-publisher Agent

**Location**: `.claude-plugins/hubspot-integrations-plugin/agents/hubspot-cms-page-publisher.md`

**Full Agent Definition**:

```markdown
---
name: hubspot-cms-page-publisher
description: Specialized agent for HubSpot CMS page lifecycle management including creation, updating, cloning, deletion, and publishing workflows (draft vs. live, scheduled vs. immediate)
tools:
  - mcp__hubspot-enhanced-v3__hubspot_search
  - mcp__hubspot-enhanced-v3__hubspot_create
  - mcp__hubspot-enhanced-v3__hubspot_update
  - Read
  - Write
  - TodoWrite
  - Bash
---

# Shared Script Libraries
@import agents/shared/library-reference.yaml

# HubSpot CMS Page Publisher Agent

Specialized agent for managing HubSpot CMS page lifecycle: creation, modification, cloning, deletion, and publishing workflows. Ensures safe page management with validation, rollback capabilities, and publishing best practices.

## Core Responsibilities

### Page CRUD Operations
- Create new website pages and landing pages
- Retrieve page details by ID or slug
- Update page content and metadata (draft modifications)
- Clone existing pages with new names
- Delete or archive pages safely

### Publishing Workflows
- Immediate publish (push draft to live)
- Scheduled publish (future date/time)
- Publishing validation (required fields, SEO checks, template validation)
- Publishing history tracking
- Rollback capabilities

### Safety & Validation
- Pre-publish validation checks
- Template path verification
- Required field validation
- SEO minimum requirements (if configured)
- Snapshot creation for rollback
- Confirmation prompts for destructive operations

## Script Library Usage

### HubSpotCMSPagesManager

```javascript
const HubSpotCMSPagesManager = require('../../hubspot-plugin/scripts/lib/hubspot-cms-pages-manager');

const pagesManager = new HubSpotCMSPagesManager({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  portalId: process.env.HUBSPOT_PORTAL_ID,
  pageType: 'landing-pages' // or 'site-pages'
});

// Create page
const page = await pagesManager.createPage({
  name: "New Landing Page",
  slug: "new-landing-page",
  language: "en",
  domain: "example.com",
  templatePath: "templates/landing-page.html",
  widgets: {
    // Module content
  }
});

// Update page (draft only)
await pagesManager.updatePage(page.id, {
  name: "Updated Title",
  metaDescription: "Updated description"
});

// Clone page
const clone = await pagesManager.clonePage(page.id, "Cloned Page");
```

### HubSpotCMSPublishingController

```javascript
const HubSpotCMSPublishingController = require('../../hubspot-plugin/scripts/lib/hubspot-cms-publishing-controller');

const publishController = new HubSpotCMSPublishingController({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  portalId: process.env.HUBSPOT_PORTAL_ID,
  pageType: 'landing-pages'
});

// Immediate publish
await publishController.publishPageNow(pageId);

// Scheduled publish
await publishController.schedulePublish(pageId, '2025-12-01T15:00:00Z');

// Validate before publish
const validation = await publishController.validateBeforePublish(pageId);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  throw new Error('Page validation failed');
}

// Create snapshot for rollback
const snapshot = await publishController.createPublishSnapshot(pageId);

// Rollback if needed
await publishController.rollbackToVersion(pageId, snapshot.snapshotId);
```

## Operation Patterns

### Safe Page Creation

```javascript
async function safeCreatePage(pageData) {
  // Step 1: Validate template exists
  const templateValid = await pagesManager.validateTemplate(pageData.templatePath);
  if (!templateValid.exists) {
    throw new Error(`Template not found: ${pageData.templatePath}`);
  }

  // Step 2: Check for slug conflicts
  const existing = await pagesManager.getPageBySlug(pageData.slug);
  if (existing) {
    console.warn(`Slug already exists: ${pageData.slug}`);
    // Optionally modify slug: pageData.slug = `${pageData.slug}-copy`
  }

  // Step 3: Create page
  const page = await pagesManager.createPage(pageData);
  console.log(`✅ Page created: ${page.id} (${page.url})`);

  return page;
}
```

### Publishing with Validation

```javascript
async function publishWithValidation(pageId, options = {}) {
  // Step 1: Pre-publish validation
  const validation = await publishController.validateBeforePublish(pageId);

  if (!validation.valid) {
    console.error('❌ Validation failed:');
    validation.errors.forEach(err => console.error(`  - ${err}`));

    if (validation.warnings.length > 0) {
      console.warn('⚠️  Warnings:');
      validation.warnings.forEach(warn => console.warn(`  - ${warn}`));
    }

    throw new Error('Page validation failed - cannot publish');
  }

  // Step 2: Create snapshot for rollback
  const snapshot = await publishController.createPublishSnapshot(pageId);
  console.log(`📸 Snapshot created: ${snapshot.snapshotId}`);

  try {
    // Step 3: Publish based on type
    if (options.publishType === 'scheduled') {
      await publishController.schedulePublish(pageId, options.publishDate);
      console.log(`🕒 Page scheduled for: ${options.publishDate}`);
    } else {
      await publishController.publishPageNow(pageId);
      console.log(`✅ Page published immediately`);
    }

    // Step 4: Verify publish status
    const status = await publishController.getPublishingStatus(pageId);
    console.log(`📊 Status: ${status.state}, Published: ${status.isPublished}`);
    console.log(`🌐 URL: ${status.url}`);

    return status;
  } catch (error) {
    // Rollback on failure
    console.error(`❌ Publish failed: ${error.message}`);
    console.log(`🔄 Rolling back to snapshot: ${snapshot.snapshotId}`);
    await publishController.rollbackToVersion(pageId, snapshot.snapshotId);
    throw error;
  }
}
```

### Bulk Operations

```javascript
async function batchCreatePages(pagesData, options = {}) {
  console.log(`📦 Creating ${pagesData.length} pages...`);

  // Use batch operation for rate limiting
  const results = await pagesManager.batchCreatePages(pagesData);

  // Report results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Created: ${successful.length}`);
  if (failed.length > 0) {
    console.error(`❌ Failed: ${failed.length}`);
    failed.forEach(f => console.error(`  - ${f.name}: ${f.error}`));
  }

  return { successful, failed };
}
```

### Safe Deletion with Confirmation

```javascript
async function safeDeletePage(pageId, options = {}) {
  // Step 1: Get page details
  const page = await pagesManager.getPage(pageId);
  console.log(`⚠️  About to delete: ${page.name} (${page.url})`);
  console.log(`   State: ${page.state}, Published: ${page.currentlyPublished}`);

  // Step 2: Confirm if published
  if (page.currentlyPublished && !options.force) {
    const confirmed = await confirmWithUser(
      `This page is LIVE. Are you sure you want to delete it? (yes/no)`
    );
    if (!confirmed) {
      console.log('❌ Deletion cancelled');
      return { deleted: false, reason: 'User cancelled' };
    }
  }

  // Step 3: Create backup snapshot
  if (options.createBackup) {
    const clone = await pagesManager.clonePage(pageId, `${page.name} [BACKUP]`);
    await pagesManager.archivePage(clone.id); // Archive the backup
    console.log(`📦 Backup created: ${clone.id}`);
  }

  // Step 4: Delete
  await pagesManager.deletePage(pageId);
  console.log(`✅ Page deleted: ${pageId}`);

  return { deleted: true, pageId, backupId: options.createBackup ? clone.id : null };
}
```

## Action Handlers

### Supported Actions

This agent responds to structured JSON actions:

```javascript
// CREATE PAGE
{
  "action": "create_page",
  "pageData": {
    "name": "Page Name",
    "slug": "page-slug",
    "language": "en",
    "templatePath": "path/to/template.html",
    "domain": "example.com" // optional
  }
}

// UPDATE PAGE
{
  "action": "update_page",
  "pageId": "12345",
  "updates": {
    "name": "New Name",
    "metaDescription": "New description"
  }
}

// PUBLISH PAGE (IMMEDIATE)
{
  "action": "publish_page",
  "pageId": "12345",
  "publishType": "immediate"
}

// PUBLISH PAGE (SCHEDULED)
{
  "action": "publish_page",
  "pageId": "12345",
  "publishType": "scheduled",
  "publishDate": "2025-12-01T15:00:00Z"
}

// CLONE PAGE
{
  "action": "clone_page",
  "pageId": "12345",
  "cloneName": "Cloned Page"
}

// DELETE PAGE
{
  "action": "delete_page",
  "pageId": "12345",
  "force": false,
  "createBackup": true
}

// GET PREVIEW URL
{
  "action": "get_preview_url",
  "pageId": "12345"
}

// CREATE SNAPSHOT
{
  "action": "create_snapshot",
  "pageId": "12345"
}

// ROLLBACK
{
  "action": "rollback",
  "pageId": "12345",
  "snapshotId": "67890"
}

// BATCH CREATE
{
  "action": "batch_create_pages",
  "pages": [
    { "name": "Page 1", "slug": "page-1", ... },
    { "name": "Page 2", "slug": "page-2", ... }
  ]
}
```

## Error Handling

### Common Errors

**Template Not Found**:
```javascript
try {
  await pagesManager.createPage({ templatePath: "invalid/path.html", ... });
} catch (error) {
  if (error.message.includes('template')) {
    console.error('❌ Template not found - check path in Design Manager');
  }
}
```

**Slug Conflict**:
```javascript
const existing = await pagesManager.getPageBySlug(slug);
if (existing) {
  // Handle conflict: modify slug or update existing
}
```

**Publishing Validation Failed**:
```javascript
const validation = await publishController.validateBeforePublish(pageId);
if (!validation.valid) {
  // Display errors, fix issues, retry
}
```

**Rate Limit Exceeded**:
```javascript
// HubSpotClientV3 handles rate limiting automatically
// Batch operations include built-in rate limiting
```

## Integration Points

### Coordination with hubspot-cms-content-manager

This agent is invoked BY `hubspot-cms-content-manager` for:
- All page CRUD operations
- Publishing workflows
- Bulk page operations

### Coordination with hubspot-seo-optimizer

`hubspot-cms-content-manager` coordinates SEO validation:
1. CMS content manager calls this agent to create/update page
2. CMS content manager calls hubspot-seo-optimizer for validation
3. CMS content manager calls this agent to publish if SEO approved

### Coordination with hubspot-orchestrator

For complex operations involving pages + other CMS elements:
- Orchestrator delegates page operations to this agent
- Orchestrator handles multi-step workflows

## Asana Integration for Publishing Workflows

@import ../../shared-docs/asana-integration-standards.md

**When to use**: For bulk page creation/publishing (10+ pages), scheduled publish campaigns, or page migration projects.

**Update frequency**: Post checkpoint after every 25% of pages processed, blockers for validation failures, completion with success/failure counts.

**CMS-specific patterns**: Include page counts, template names, publish types (immediate vs scheduled), and validation failure rates.

## Performance Considerations

### Batch Operations

For operations on 10+ pages, always use batch methods:
- `batchCreatePages(pagesData)`
- `batchUpdatePages(updates)`
- `batchPublishPages(pageIds, options)`

These include rate limiting and error aggregation.

### Caching

HubSpotClientV3 includes response caching (1-hour TTL). Repeated calls to `getPage()` are efficient.

### Pagination

All list operations auto-paginate via HubSpotClientV3. Use `getAllPages()` for complete datasets.

## Related Documentation

- **CMS Pages API Playbook**: `HUBSPOT_CMS_PAGES_API_INTEGRATION_PLAN.md`
- **HubSpot Standards**: `../.claude/shared/HUBSPOT_AGENT_STANDARDS.md`
- **Asana Playbook**: `../../opspal-core/docs/ASANA_AGENT_PLAYBOOK.md`
```

---

## Agent Wiring Strategy

### Critical: This Section Addresses the "Frequently Omitted" Issue

The plan includes **explicit wiring** at multiple levels:

### Level 1: Orchestrator Awareness

**File**: `.claude-plugins/opspal-hubspot/agents/hubspot-orchestrator.md`

**Changes to Agent Coordination List** (line 145-161):

```markdown
### Agent Coordination List
- hubspot-contact-manager
- hubspot-marketing-automation
- hubspot-pipeline-manager
- hubspot-analytics-reporter
- hubspot-integration-specialist
- hubspot-workflow-builder
- hubspot-email-campaign-manager
- hubspot-data-hygiene-specialist
- hubspot-property-manager
- hubspot-lead-scoring-specialist
- hubspot-attribution-analyst
- hubspot-territory-manager
- hubspot-reporting-builder
- hubspot-assessment-analyzer
- hubspot-admin-specialist
- hubspot-cms-content-manager  # ← Existing
- hubspot-cms-page-publisher   # ← NEW
- sfdc-hubspot-bridge
```

**Changes to Automatic Task Routing Table** (line 100-111):

```markdown
| Task Contains | Delegate To | Priority |
|--------------|-------------|----------|
| "workflow", "automation", "trigger" | hubspot-workflow-builder | HIGH |
| "contact", "list", "import" | hubspot-contact-manager | HIGH |
| "clean", "duplicate", "data quality" | hubspot-data-hygiene-specialist | HIGH |
| "email", "campaign", "newsletter" | hubspot-email-campaign-manager | HIGH |
| "pipeline", "deal", "forecast" | hubspot-pipeline-manager | HIGH |
| "page", "landing page", "website page" | hubspot-cms-page-publisher | HIGH |  # ← NEW
| "publish page", "go live", "schedule" | hubspot-cms-page-publisher | HIGH |  # ← NEW
| "blog post", "CMS content", "SEO" | hubspot-cms-content-manager | HIGH |  # ← Clarified
| "report", "analytics", "metrics" | hubspot-analytics-reporter | MEDIUM |
| ... (rest unchanged)
```

### Level 2: CMS Content Manager Delegation

**File**: `.claude-plugins/hubspot-integrations-plugin/agents/hubspot-cms-content-manager.md`

Add new section after line 96 (before existing content):

```markdown
## 🎯 Delegation Rules for Page Operations

### When to Delegate to hubspot-cms-page-publisher

**ALWAYS delegate** to `hubspot-cms-page-publisher` for:

| Operation | Keyword Match | Reason |
|-----------|---------------|--------|
| Page creation | "create page", "new page", "new landing page" | Lifecycle specialist |
| Page publishing | "publish", "go live", "schedule publish" | Publishing workflow expert |
| Page updates | "update page", "edit page", "modify page" | Draft management |
| Page cloning | "clone page", "duplicate page", "copy page" | Efficient with validation |
| Page deletion | "delete page", "remove page", "archive page" | Safe deletion protocols |
| Bulk operations | "create 10 pages", "publish all", "batch" | Rate limiting built-in |

**DO NOT delegate** to `hubspot-cms-page-publisher` for:
- Blog post operations → Handle directly with existing blog APIs
- Template creation/modification → Handle with Design Manager operations
- SEO analysis → Delegate to `hubspot-seo-optimizer`
- CMS settings/configuration → Handle directly

### Delegation Pattern

```javascript
// Example: User requests "Create and publish a landing page"

// Step 1: Delegate page creation
const pageResult = await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
  action: 'create_page',
  pageData: { name: "Landing Page", slug: "landing-page", ... }
}));

// Step 2: SEO validation (YOUR responsibility)
const seoScore = await Task.invoke('hubspot-seo-optimizer', JSON.stringify({
  action: 'analyze_content',
  content: pageResult.content,
  targetKeyword: 'marketing automation'
}));

// Step 3: Delegate publishing if SEO approved
if (seoScore.score >= 60) {
  await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
    action: 'publish_page',
    pageId: pageResult.pageId,
    publishType: 'immediate'
  }));
}
```

### Error Handling from Delegated Operations

If `hubspot-cms-page-publisher` returns an error:

```javascript
{
  "success": false,
  "error": "Template not found: templates/landing-page.html",
  "errorType": "TEMPLATE_VALIDATION_ERROR"
}
```

YOU must:
1. Check error type
2. If template error: Verify template exists in Design Manager
3. If SEO error: Re-run SEO optimization
4. If validation error: Fix page content
5. Retry operation after fix
```

### Level 3: Quick Reference Card for Agents

**Create New File**: `.claude-plugins/opspal-hubspot/agents/shared/cms-pages-delegation-reference.yaml`

```yaml
# CMS Pages API Delegation Reference
# Used by hubspot-orchestrator and hubspot-cms-content-manager

delegation_rules:
  page_operations:
    agent: hubspot-cms-page-publisher
    keywords:
      - "create page"
      - "new page"
      - "landing page"
      - "website page"
      - "publish page"
      - "schedule page"
      - "clone page"
      - "delete page"
      - "update page content"
    actions:
      - create_page
      - update_page
      - publish_page
      - clone_page
      - delete_page
      - batch_create_pages
      - get_preview_url
      - create_snapshot
      - rollback

  seo_validation:
    agent: hubspot-seo-optimizer
    keywords:
      - "SEO"
      - "optimize content"
      - "keyword research"
    actions:
      - analyze_content
      - research_keywords
      - generate_topic_cluster

coordination_workflows:
  - name: "Create and Publish Page"
    steps:
      - agent: hubspot-cms-page-publisher
        action: create_page
      - agent: hubspot-seo-optimizer
        action: analyze_content
      - agent: hubspot-cms-page-publisher
        action: publish_page
        condition: "seoScore >= 60"

  - name: "Bulk Page Creation"
    steps:
      - agent: hubspot-cms-page-publisher
        action: batch_create_pages
      - agent: hubspot-cms-page-publisher
        action: batch_publish_pages
        condition: "allPagesValid"
```

**Reference in Agents**:

```markdown
# In hubspot-orchestrator.md and hubspot-cms-content-manager.md:
@import agents/shared/cms-pages-delegation-reference.yaml
```

### Level 4: Agent Routing Table Update

**File**: `CLAUDE.md` (root project file)

Add to Quick Agent Reference Table (line 15):

```markdown
| CMS page operations | `hubspot-cms-page-publisher` (hubspot-integrations-plugin) | "create page", "publish page", "landing page", "website page", "schedule page" |
```

### Level 5: Validation Hook for Agent Selection

**Create New File**: `.claude-plugins/opspal-hubspot/hooks/pre-task-cms-pages-validator.sh`

```bash
#!/bin/bash
# Pre-task validation for CMS Pages API operations
# Ensures correct agent is selected for page operations

set -euo pipefail

# Extract task description from Claude message
TASK_DESCRIPTION="${1:-}"

# Keywords that require hubspot-cms-page-publisher
CMS_PAGE_KEYWORDS=(
  "create page"
  "new page"
  "landing page"
  "website page"
  "publish page"
  "schedule page"
  "clone page"
  "delete page"
  "batch pages"
)

# Check if task contains CMS page keywords
for keyword in "${CMS_PAGE_KEYWORDS[@]}"; do
  if echo "$TASK_DESCRIPTION" | grep -iq "$keyword"; then
    # Check if hubspot-cms-page-publisher is in the plan
    if ! echo "$TASK_DESCRIPTION" | grep -iq "hubspot-cms-page-publisher"; then
      echo "⚠️  WARNING: Task mentions '$keyword' but doesn't delegate to hubspot-cms-page-publisher"
      echo "   Recommended: Use Task tool to invoke 'hubspot-cms-page-publisher'"
      echo "   See: HUBSPOT_CMS_PAGES_API_INTEGRATION_PLAN.md"
      exit 1
    fi
  fi
done

echo "✅ CMS Pages delegation validated"
exit 0
```

**Register Hook**: `.claude-plugins/opspal-hubspot/.claude-plugin/hooks.json`

```json
{
  "hooks": [
    {
      "name": "pre-task-cms-pages-validator",
      "trigger": "before_task",
      "script": "./hooks/pre-task-cms-pages-validator.sh",
      "description": "Validates correct agent selection for CMS Pages operations"
    }
  ]
}
```

---

## Slash Commands

### 1. /cms-create-page

**Location**: `.claude-plugins/opspal-hubspot/commands/cms-create-page.md`

```markdown
---
command: cms-create-page
description: Create a new HubSpot CMS page (website or landing page) with validation
usage: /cms-create-page [options]
---

# Create CMS Page

Interactive command to create a new HubSpot CMS page.

## Usage

```
/cms-create-page
/cms-create-page --type landing-page
/cms-create-page --name "My Page" --slug "my-page"
```

## Options

- `--type`: Page type (site-pages or landing-pages) [default: landing-pages]
- `--name`: Page name (internal reference)
- `--slug`: URL slug (e.g., "my-landing-page")
- `--template`: Template path in Design Manager
- `--language`: Content language [default: en]
- `--domain`: Domain to publish on [default: primary domain]
- `--publish`: Publish immediately after creation [default: false]

## Workflow

If options not provided, command will prompt:

1. **Page Type**: Website page or landing page?
2. **Page Name**: Internal name for reference
3. **URL Slug**: URL-friendly slug (auto-generated from name if not provided)
4. **Template**: List available templates, select one
5. **Language**: Content language (en, fr, de, etc.)
6. **Publish**: Create as draft or publish immediately?

## Output

```
✅ Page created successfully!

   ID: 12345
   Name: My Landing Page
   URL: https://example.com/my-landing-page
   State: DRAFT
   Template: templates/landing-page.html

📝 Next steps:
   - Edit content: hubspot-cms-page-publisher updatePage
   - Publish: /cms-publish-page 12345
   - Preview: https://example.com/my-landing-page?preview=true
```

## Examples

```bash
# Interactive mode
/cms-create-page

# Quick creation (landing page)
/cms-create-page --name "Product Launch" --slug "product-launch" --template "templates/product.html"

# Create and publish immediately
/cms-create-page --name "Blog Post" --slug "new-blog" --publish
```

## Delegation

This command invokes `hubspot-cms-page-publisher` agent with action `create_page`.
```

### 2. /cms-publish-page

**Location**: `.claude-plugins/opspal-hubspot/commands/cms-publish-page.md`

```markdown
---
command: cms-publish-page
description: Publish a HubSpot CMS page (immediate or scheduled)
usage: /cms-publish-page <page-id> [options]
---

# Publish CMS Page

Publish a draft CMS page immediately or schedule for future publication.

## Usage

```
/cms-publish-page <page-id>
/cms-publish-page <page-id> --schedule "2025-12-01T15:00:00Z"
/cms-publish-page <page-id> --validate-seo
```

## Arguments

- `page-id`: Page ID to publish (required)

## Options

- `--schedule <date>`: Schedule publish for future date (ISO 8601 format)
- `--validate-seo`: Run SEO validation before publishing [default: true]
- `--min-seo-score <score>`: Minimum SEO score required [default: 60]
- `--force`: Skip validation and publish anyway [default: false]

## Workflow

1. **Retrieve page**: Fetch current page state
2. **SEO Validation** (if enabled):
   - Run SEO analysis
   - Check score against minimum threshold
   - Display recommendations if below threshold
3. **Confirmation**: Confirm publish action
4. **Snapshot**: Create rollback snapshot
5. **Publish**: Execute immediate or scheduled publish
6. **Verification**: Verify publishing status

## Output

```
📊 Page: My Landing Page (ID: 12345)
   Current State: DRAFT
   URL: https://example.com/my-landing-page

🔍 SEO Analysis:
   Score: 75/100 ✅
   - Keyword in title: ✅
   - Meta description: ✅ (155 chars)
   - Keyword density: ✅ (1.8%)
   - Headings: ✅ (5 H2s)

📸 Snapshot created: snapshot_67890

✅ Page published successfully!
   State: PUBLISHED
   Live URL: https://example.com/my-landing-page
   Published at: 2025-11-04T14:30:00Z
```

## Examples

```bash
# Immediate publish with SEO validation
/cms-publish-page 12345

# Schedule for future date
/cms-publish-page 12345 --schedule "2025-12-01T15:00:00Z"

# Skip SEO validation (not recommended)
/cms-publish-page 12345 --force

# Custom SEO threshold
/cms-publish-page 12345 --min-seo-score 70
```

## Error Handling

**SEO Score Too Low**:
```
⚠️  SEO Score: 45/100 (below threshold of 60)

Recommendations:
  1. Add target keyword to first paragraph
  2. Increase content length (current: 450 words, target: 800+)
  3. Add 2 more H2 subheadings

Options:
  - Fix issues and retry
  - Use --force to publish anyway (not recommended)
  - Lower threshold with --min-seo-score
```

**Template Validation Failed**:
```
❌ Template validation failed: templates/landing.html not found
   Please select a valid template from Design Manager
```

## Delegation

This command invokes:
1. `hubspot-cms-page-publisher` for page retrieval and publishing
2. `hubspot-seo-optimizer` for SEO validation (if enabled)
```

### 3. /cms-audit-pages

**Location**: `.claude-plugins/opspal-hubspot/commands/cms-audit-pages.md`

```markdown
---
command: cms-audit-pages
description: Audit all CMS pages and generate report with SEO, publishing status, and recommendations
usage: /cms-audit-pages [options]
---

# Audit CMS Pages

Generate comprehensive audit of all CMS pages including SEO scores, publishing status, outdated content, and recommendations.

## Usage

```
/cms-audit-pages
/cms-audit-pages --type landing-pages
/cms-audit-pages --include-archived
```

## Options

- `--type`: Page type to audit (site-pages, landing-pages, or both) [default: both]
- `--include-archived`: Include archived pages in audit [default: false]
- `--generate-pdf`: Generate PDF report [default: true]
- `--output-dir`: Output directory for reports [default: ./reports/cms-audit]

## Audit Checks

### Publishing Status
- ✅ Published pages
- 📝 Draft pages (never published)
- 🕒 Scheduled pages
- 📦 Archived pages

### SEO Analysis
- SEO score for each page
- Missing meta descriptions
- Missing target keywords
- Content length issues
- Heading structure problems

### Content Quality
- Last updated date
- Outdated content (>12 months old)
- Broken links (if configured)
- Missing images/alt text

### Template Usage
- Template distribution
- Deprecated templates
- Orphaned templates (no pages using)

## Output

### Console Summary
```
📊 CMS Pages Audit Report
========================

📈 Overview:
   Total Pages: 147
   - Website Pages: 85
   - Landing Pages: 62

📝 Publishing Status:
   Published: 120 (81.6%)
   Drafts: 20 (13.6%)
   Scheduled: 5 (3.4%)
   Archived: 2 (1.4%)

🔍 SEO Health:
   Average Score: 68/100
   Pages Above 70: 89 (60.5%)
   Pages Below 60: 35 (23.8%)
   Missing Meta Desc: 12 (8.2%)

⚠️  Content Issues:
   Outdated (>12 months): 23 (15.6%)
   Low word count (<500): 18 (12.2%)

📋 Recommendations:
   1. Optimize 35 pages with SEO score <60
   2. Update 23 pages with outdated content
   3. Review 12 pages missing meta descriptions
   4. Increase content on 18 pages (target 800+ words)

📄 Full report: ./reports/cms-audit/cms-audit-2025-11-04.pdf
```

### PDF Report Structure

1. **Executive Summary** (1 page)
   - Total pages count
   - Publishing status breakdown
   - Average SEO score
   - Priority recommendations

2. **Publishing Analysis** (2-3 pages)
   - Published vs draft breakdown
   - Scheduled publish calendar
   - Unpublished draft pages list

3. **SEO Health Report** (3-4 pages)
   - SEO score distribution chart
   - Pages below threshold (table)
   - Common SEO issues
   - Quick win opportunities

4. **Content Quality Analysis** (2-3 pages)
   - Outdated content list
   - Low word count pages
   - Broken links (if checked)
   - Missing alt text issues

5. **Template Usage Report** (1-2 pages)
   - Template distribution chart
   - Deprecated templates list
   - Orphaned templates

6. **Action Plan** (1 page)
   - Prioritized recommendations
   - Estimated effort per task
   - Quick wins (low effort, high impact)

## Examples

```bash
# Full audit with PDF
/cms-audit-pages

# Audit only landing pages
/cms-audit-pages --type landing-pages

# Include archived pages
/cms-audit-pages --include-archived

# Custom output directory
/cms-audit-pages --output-dir ./custom-reports
```

## Performance

- Fetches all pages with pagination (handles 1000+ pages)
- Batch SEO analysis (10 pages at a time)
- Estimated time: 2-5 minutes for 100 pages

## Delegation

This command orchestrates:
1. `hubspot-cms-page-publisher` for page retrieval and status
2. `hubspot-seo-optimizer` for batch SEO analysis
3. PDF generation via `PDFGenerationHelper` (opspal-core)
```

---

## Validation Hooks

### 1. Pre-Publish Validation Hook

**File**: `.claude-plugins/opspal-hubspot/hooks/pre-cms-publish-validation.sh`

```bash
#!/bin/bash
# Pre-publish validation for CMS pages
# Ensures pages meet minimum requirements before publishing

set -euo pipefail

PAGE_ID="${1:-}"
PAGE_TYPE="${2:-landing-pages}"
MIN_SEO_SCORE="${3:-60}"

if [ -z "$PAGE_ID" ]; then
  echo "❌ Error: PAGE_ID required"
  exit 1
fi

echo "🔍 Pre-publish validation for page: $PAGE_ID"

# Step 1: Fetch page details
echo "   Fetching page details..."
PAGE_JSON=$(node .claude-plugins/opspal-hubspot/scripts/lib/hubspot-cms-pages-manager.js get "$PAGE_ID" "$PAGE_TYPE")

PAGE_NAME=$(echo "$PAGE_JSON" | jq -r '.name')
PAGE_STATE=$(echo "$PAGE_JSON" | jq -r '.state')
TEMPLATE_PATH=$(echo "$PAGE_JSON" | jq -r '.templatePath')

echo "   Page: $PAGE_NAME"
echo "   State: $PAGE_STATE"
echo "   Template: $TEMPLATE_PATH"

# Step 2: Validate required fields
echo "   Validating required fields..."

MISSING_FIELDS=()

if [ "$(echo "$PAGE_JSON" | jq -r '.name')" == "null" ]; then
  MISSING_FIELDS+=("name")
fi

if [ "$(echo "$PAGE_JSON" | jq -r '.slug')" == "null" ]; then
  MISSING_FIELDS+=("slug")
fi

if [ "$(echo "$PAGE_JSON" | jq -r '.metaDescription')" == "null" ]; then
  MISSING_FIELDS+=("metaDescription")
fi

if [ ${#MISSING_FIELDS[@]} -gt 0 ]; then
  echo "❌ Missing required fields: ${MISSING_FIELDS[*]}"
  exit 1
fi

# Step 3: Validate template exists
echo "   Validating template..."
TEMPLATE_VALID=$(node .claude-plugins/opspal-hubspot/scripts/lib/hubspot-cms-pages-manager.js validate-template "$TEMPLATE_PATH")

if [ "$TEMPLATE_VALID" != "true" ]; then
  echo "❌ Template not found: $TEMPLATE_PATH"
  exit 1
fi

# Step 4: Run SEO validation
echo "   Running SEO validation..."
CONTENT=$(echo "$PAGE_JSON" | jq -r '.widgets | tostring')
SEO_SCORE=$(node .claude-plugins/hubspot-core-plugin/scripts/lib/seo-content-optimizer.js analyze "$CONTENT" | jq -r '.score')

echo "   SEO Score: $SEO_SCORE/100"

if [ "$SEO_SCORE" -lt "$MIN_SEO_SCORE" ]; then
  echo "⚠️  SEO score ($SEO_SCORE) below minimum threshold ($MIN_SEO_SCORE)"
  echo "   Recommendations:"
  node .claude-plugins/hubspot-core-plugin/scripts/lib/seo-content-optimizer.js analyze "$CONTENT" | jq -r '.suggestions[]' | sed 's/^/     - /'

  # Allow override with FORCE_PUBLISH=1
  if [ "${FORCE_PUBLISH:-0}" != "1" ]; then
    echo "❌ Pre-publish validation failed (use FORCE_PUBLISH=1 to override)"
    exit 1
  else
    echo "⚠️  FORCE_PUBLISH enabled - proceeding despite low SEO score"
  fi
fi

echo "✅ Pre-publish validation passed"
exit 0
```

**Register in hooks.json**:

```json
{
  "name": "pre-cms-publish-validation",
  "trigger": "before_publish",
  "script": "./hooks/pre-cms-publish-validation.sh",
  "description": "Validates CMS pages before publishing"
}
```

### 2. Post-Publish Notification Hook

**File**: `.claude-plugins/opspal-hubspot/hooks/post-cms-publish-notification.sh`

```bash
#!/bin/bash
# Post-publish notification for CMS pages
# Sends notifications after successful page publish

set -euo pipefail

PAGE_ID="${1:-}"
PAGE_TYPE="${2:-landing-pages}"
PUBLISH_TYPE="${3:-immediate}"  # immediate or scheduled

if [ -z "$PAGE_ID" ]; then
  echo "❌ Error: PAGE_ID required"
  exit 1
fi

echo "📢 Sending publish notification for page: $PAGE_ID"

# Fetch page details
PAGE_JSON=$(node .claude-plugins/opspal-hubspot/scripts/lib/hubspot-cms-pages-manager.js get "$PAGE_ID" "$PAGE_TYPE")

PAGE_NAME=$(echo "$PAGE_JSON" | jq -r '.name')
PAGE_URL=$(echo "$PAGE_JSON" | jq -r '.url')
PAGE_STATE=$(echo "$PAGE_JSON" | jq -r '.state')

# Send Slack notification (if configured)
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  SLACK_MESSAGE="✅ CMS Page Published\n\n*Page*: $PAGE_NAME\n*Type*: $PUBLISH_TYPE\n*State*: $PAGE_STATE\n*URL*: $PAGE_URL"

  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$SLACK_MESSAGE\"}" \
    > /dev/null 2>&1

  echo "   Slack notification sent"
fi

# Log to audit trail
AUDIT_LOG="${HUBSPOT_AUDIT_LOG:-./logs/cms-publish-audit.log}"
mkdir -p "$(dirname "$AUDIT_LOG")"

echo "$(date -Iseconds) | PAGE_ID=$PAGE_ID | NAME=$PAGE_NAME | TYPE=$PUBLISH_TYPE | URL=$PAGE_URL" >> "$AUDIT_LOG"
echo "   Audit log updated: $AUDIT_LOG"

echo "✅ Post-publish notification complete"
exit 0
```

**Register in hooks.json**:

```json
{
  "name": "post-cms-publish-notification",
  "trigger": "after_publish",
  "script": "./hooks/post-cms-publish-notification.sh",
  "description": "Sends notifications after CMS page publish"
}
```

---

## Testing Strategy

### Unit Tests

**Location**: `.claude-plugins/opspal-hubspot/test/hubspot-cms-pages-manager.test.js`

```javascript
const HubSpotCMSPagesManager = require('../scripts/lib/hubspot-cms-pages-manager');
const nock = require('nock');

describe('HubSpotCMSPagesManager', () => {
  let manager;

  beforeEach(() => {
    manager = new HubSpotCMSPagesManager({
      accessToken: 'test-token',
      portalId: '12345',
      pageType: 'landing-pages'
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('createPage', () => {
    it('should create a new landing page', async () => {
      nock('https://api.hubapi.com')
        .post('/cms/v3/pages/landing-pages')
        .reply(200, {
          id: '67890',
          name: 'Test Page',
          slug: 'test-page',
          state: 'DRAFT'
        });

      const result = await manager.createPage({
        name: 'Test Page',
        slug: 'test-page',
        templatePath: 'templates/test.html'
      });

      expect(result.id).toBe('67890');
      expect(result.state).toBe('DRAFT');
    });

    it('should throw error on missing required fields', async () => {
      await expect(manager.createPage({ name: 'Test' }))
        .rejects.toThrow('Missing required field: slug');
    });
  });

  describe('updatePage', () => {
    it('should update page with sparse updates', async () => {
      nock('https://api.hubapi.com')
        .patch('/cms/v3/pages/landing-pages/67890')
        .reply(200, {
          id: '67890',
          name: 'Updated Page',
          metaDescription: 'Updated description'
        });

      const result = await manager.updatePage('67890', {
        name: 'Updated Page',
        metaDescription: 'Updated description'
      });

      expect(result.name).toBe('Updated Page');
    });
  });

  describe('getAllPages', () => {
    it('should handle pagination automatically', async () => {
      nock('https://api.hubapi.com')
        .get('/cms/v3/pages/landing-pages')
        .query({ limit: 100 })
        .reply(200, {
          results: [{ id: '1' }, { id: '2' }],
          paging: { next: { after: 'cursor123' } }
        });

      nock('https://api.hubapi.com')
        .get('/cms/v3/pages/landing-pages')
        .query({ limit: 100, after: 'cursor123' })
        .reply(200, {
          results: [{ id: '3' }],
          paging: {}
        });

      const results = await manager.getAllPages();
      expect(results).toHaveLength(3);
    });
  });

  describe('clonePage', () => {
    it('should clone existing page', async () => {
      nock('https://api.hubapi.com')
        .post('/cms/v3/pages/landing-pages/clone')
        .reply(200, {
          id: '99999',
          name: 'Cloned Page',
          state: 'DRAFT'
        });

      const result = await manager.clonePage('67890', 'Cloned Page');
      expect(result.id).toBe('99999');
      expect(result.name).toBe('Cloned Page');
    });
  });

  describe('validateTemplate', () => {
    it('should validate template exists', async () => {
      nock('https://api.hubapi.com')
        .get('/content/api/v2/templates')
        .query({ path: 'templates/test.html' })
        .reply(200, {
          objects: [{ path: 'templates/test.html' }]
        });

      const result = await manager.validateTemplate('templates/test.html');
      expect(result.exists).toBe(true);
    });

    it('should return false for non-existent template', async () => {
      nock('https://api.hubapi.com')
        .get('/content/api/v2/templates')
        .query({ path: 'templates/invalid.html' })
        .reply(200, { objects: [] });

      const result = await manager.validateTemplate('templates/invalid.html');
      expect(result.exists).toBe(false);
    });
  });
});
```

**Location**: `.claude-plugins/opspal-hubspot/test/hubspot-cms-publishing-controller.test.js`

```javascript
const HubSpotCMSPublishingController = require('../scripts/lib/hubspot-cms-publishing-controller');
const nock = require('nock');

describe('HubSpotCMSPublishingController', () => {
  let controller;

  beforeEach(() => {
    controller = new HubSpotCMSPublishingController({
      accessToken: 'test-token',
      portalId: '12345',
      pageType: 'landing-pages'
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('publishPageNow', () => {
    it('should publish page immediately', async () => {
      nock('https://api.hubapi.com')
        .post('/cms/v3/pages/landing-pages/67890/draft/push-live')
        .reply(200, {
          id: '67890',
          state: 'PUBLISHED',
          currentlyPublished: true
        });

      const result = await controller.publishPageNow('67890');
      expect(result.state).toBe('PUBLISHED');
      expect(result.currentlyPublished).toBe(true);
    });
  });

  describe('schedulePublish', () => {
    it('should schedule page for future publish', async () => {
      nock('https://api.hubapi.com')
        .post('/cms/v3/pages/landing-pages/schedule')
        .reply(204);

      await expect(
        controller.schedulePublish('67890', '2025-12-01T15:00:00Z')
      ).resolves.not.toThrow();
    });
  });

  describe('validateBeforePublish', () => {
    it('should pass validation for valid page', async () => {
      nock('https://api.hubapi.com')
        .get('/cms/v3/pages/landing-pages/67890')
        .reply(200, {
          id: '67890',
          name: 'Test Page',
          slug: 'test-page',
          metaDescription: 'Test description',
          templatePath: 'templates/test.html'
        });

      nock('https://api.hubapi.com')
        .get('/content/api/v2/templates')
        .query({ path: 'templates/test.html' })
        .reply(200, { objects: [{ path: 'templates/test.html' }] });

      const result = await controller.validateBeforePublish('67890');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing meta description', async () => {
      nock('https://api.hubapi.com')
        .get('/cms/v3/pages/landing-pages/67890')
        .reply(200, {
          id: '67890',
          name: 'Test Page',
          slug: 'test-page',
          metaDescription: null,
          templatePath: 'templates/test.html'
        });

      const result = await controller.validateBeforePublish('67890');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing meta description');
    });
  });
});
```

### Integration Tests

**Location**: `.claude-plugins/opspal-hubspot/test/integration/cms-pages-workflow.test.js`

```javascript
describe('CMS Pages Workflow Integration', () => {
  it('should complete full create-update-publish workflow', async () => {
    // This test requires a real HubSpot portal or sandbox
    // Skip in CI with: if (!process.env.HUBSPOT_INTEGRATION_TEST) { return; }

    const manager = new HubSpotCMSPagesManager({
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
      portalId: process.env.HUBSPOT_PORTAL_ID,
      pageType: 'landing-pages'
    });

    const controller = new HubSpotCMSPublishingController({
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
      portalId: process.env.HUBSPOT_PORTAL_ID,
      pageType: 'landing-pages'
    });

    // Step 1: Create page
    const page = await manager.createPage({
      name: 'Integration Test Page',
      slug: 'integration-test-page',
      templatePath: 'templates/test.html',
      language: 'en'
    });

    expect(page.id).toBeDefined();
    expect(page.state).toBe('DRAFT');

    // Step 2: Update page
    const updated = await manager.updatePage(page.id, {
      metaDescription: 'Integration test description'
    });

    expect(updated.metaDescription).toBe('Integration test description');

    // Step 3: Validate before publish
    const validation = await controller.validateBeforePublish(page.id);
    expect(validation.valid).toBe(true);

    // Step 4: Publish
    const published = await controller.publishPageNow(page.id);
    expect(published.state).toBe('PUBLISHED');

    // Cleanup: Delete page
    await manager.deletePage(page.id);
  });
});
```

### E2E Tests (Agent Invocation)

**Location**: `.claude-plugins/opspal-hubspot/test/e2e/cms-page-publisher-agent.test.js`

```javascript
describe('hubspot-cms-page-publisher Agent E2E', () => {
  it('should create and publish page via agent', async () => {
    // Simulate Task.invoke call
    const result = await invokeAgent('hubspot-cms-page-publisher', {
      action: 'create_page',
      pageData: {
        name: 'E2E Test Page',
        slug: 'e2e-test-page',
        templatePath: 'templates/test.html'
      }
    });

    expect(result.success).toBe(true);
    expect(result.pageId).toBeDefined();
    expect(result.url).toContain('e2e-test-page');

    // Publish
    const publishResult = await invokeAgent('hubspot-cms-page-publisher', {
      action: 'publish_page',
      pageId: result.pageId,
      publishType: 'immediate'
    });

    expect(publishResult.success).toBe(true);
    expect(publishResult.state).toBe('PUBLISHED');
  });
});
```

---

## Documentation Updates

### 1. Update hubspot-plugin README.md

**Location**: `.claude-plugins/opspal-hubspot/README.md`

Add new section after "Marketing Automation":

```markdown
### CMS Pages Management (NEW)

Programmatic creation, updating, publishing, and management of HubSpot CMS website pages and landing pages.

**Key Features**:
- Create pages via API (website pages and landing pages)
- Update page content (draft modifications)
- Clone existing pages
- Publish workflows (immediate or scheduled)
- Draft vs. live state management
- SEO validation before publish
- Rollback capabilities
- Bulk operations (10+ pages)

**Agents**:
- `hubspot-cms-page-publisher` - Specialized page lifecycle management
- `hubspot-cms-content-manager` - Overall CMS coordination with SEO

**Commands**:
- `/cms-create-page` - Create new CMS page
- `/cms-publish-page` - Publish or schedule page
- `/cms-audit-pages` - Generate comprehensive page audit with PDF

**Script Libraries**:
- `hubspot-cms-pages-manager.js` - CRUD operations
- `hubspot-cms-publishing-controller.js` - Publishing workflows

**Example Workflow**:
```bash
# Create landing page
/cms-create-page --name "Product Launch" --slug "product-launch"

# Update content (via agent)
# ... content modifications ...

# Publish with SEO validation
/cms-publish-page <page-id> --validate-seo

# Audit all pages
/cms-audit-pages --generate-pdf
```

See `HUBSPOT_CMS_PAGES_API_INTEGRATION_PLAN.md` for complete documentation.
```

### 2. Update CHANGELOG.md

**Location**: `.claude-plugins/opspal-hubspot/CHANGELOG.md`

```markdown
## [1.6.0] - 2025-11-04

### Added
- **CMS Pages API Integration**: Complete HubSpot CMS Pages API support
  - New agent: `hubspot-cms-page-publisher` for page lifecycle management
  - New script: `hubspot-cms-pages-manager.js` for CRUD operations
  - New script: `hubspot-cms-publishing-controller.js` for publishing workflows
  - New command: `/cms-create-page` for interactive page creation
  - New command: `/cms-publish-page` for publishing with validation
  - New command: `/cms-audit-pages` for comprehensive page audits with PDF
  - New validation hook: `pre-cms-publish-validation.sh`
  - New notification hook: `post-cms-publish-notification.sh`
- Enhanced `hubspot-cms-content-manager` agent with page operation delegation
- Updated `hubspot-orchestrator` with CMS pages routing rules

### Changed
- Enhanced agent delegation table in `hubspot-orchestrator`
- Updated agent coordination list to include CMS page specialists
- Improved error handling for CMS operations

### Documentation
- Added `HUBSPOT_CMS_PAGES_API_INTEGRATION_PLAN.md` with complete architecture
- Updated README.md with CMS Pages section
- Added CMS agent wiring reference: `agents/shared/cms-pages-delegation-reference.yaml`

### Tests
- Added unit tests for `hubspot-cms-pages-manager.js`
- Added unit tests for `hubspot-cms-publishing-controller.js`
- Added integration tests for full create-publish workflow
- Added E2E tests for agent invocation
```

### 3. Create Quick Start Guide

**Location**: `.claude-plugins/opspal-hubspot/docs/CMS_PAGES_QUICK_START.md`

```markdown
# HubSpot CMS Pages API - Quick Start Guide

## Installation

The CMS Pages API integration is included in `hubspot-plugin` v1.6.0+.

```bash
/plugin install opspal-hubspot@revpal-internal-plugins
```

## Quick Examples

### Create a Landing Page

```bash
/cms-create-page \
  --name "Product Launch" \
  --slug "product-launch" \
  --template "templates/product.html"
```

### Update Page Content

Via agent invocation:

```javascript
await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
  action: 'update_page',
  pageId: '12345',
  updates: {
    name: "Updated Title",
    metaDescription: "New description"
  }
}));
```

### Publish Page

```bash
# Immediate publish with SEO validation
/cms-publish-page 12345

# Schedule for future date
/cms-publish-page 12345 --schedule "2025-12-01T15:00:00Z"
```

### Audit All Pages

```bash
/cms-audit-pages --generate-pdf
```

## Programmatic Usage

### From JavaScript

```javascript
const HubSpotCMSPagesManager = require('.claude-plugins/opspal-hubspot/scripts/lib/hubspot-cms-pages-manager');

const manager = new HubSpotCMSPagesManager({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  portalId: process.env.HUBSPOT_PORTAL_ID,
  pageType: 'landing-pages'
});

// Create page
const page = await manager.createPage({
  name: "My Landing Page",
  slug: "my-landing-page",
  templatePath: "templates/landing.html",
  language: "en"
});

console.log(`Page created: ${page.url}`);
```

### From Agent

```markdown
When user requests CMS page operations, delegate to `hubspot-cms-page-publisher`:

\`\`\`javascript
const result = await Task.invoke('hubspot-cms-page-publisher', JSON.stringify({
  action: 'create_page',
  pageData: { name: "Page Name", slug: "page-slug", ... }
}));
\`\`\`
```

## Best Practices

1. **Always validate templates** before creating pages
2. **Run SEO validation** before publishing
3. **Create snapshots** before risky operations (automatic in publishing workflow)
4. **Use batch operations** for 10+ pages
5. **Confirm destructive operations** (deletions, force publish)

## Troubleshooting

### Template Not Found

```
❌ Template validation failed: templates/landing.html not found
```

**Solution**: Verify template exists in Design Manager:
1. Go to Design Manager in HubSpot
2. Check templates folder
3. Verify path exactly matches

### SEO Score Too Low

```
⚠️  SEO Score: 45/100 (below threshold of 60)
```

**Solution**:
1. Review SEO recommendations
2. Fix content issues
3. Retry publish
4. OR: Use `--force` to override (not recommended)

### Slug Conflict

```
⚠️  Slug already exists: product-launch
```

**Solution**:
1. Modify slug to be unique (e.g., "product-launch-2025")
2. OR: Update existing page instead of creating new

## Further Reading

- Complete API documentation: `HUBSPOT_CMS_PAGES_API_INTEGRATION_PLAN.md`
- Agent details: `.claude-plugins/hubspot-integrations-plugin/agents/hubspot-cms-page-publisher.md`
- HubSpot CMS API docs: https://developers.hubspot.com/docs/api/cms/pages
```

---

## Implementation Phases

### Phase 1: Foundation (4-6 hours)

**Goal**: Core script libraries and basic functionality

**Tasks**:
1. ✅ Create `hubspot-cms-pages-manager.js` with CRUD operations
2. ✅ Create `hubspot-cms-publishing-controller.js` with publishing workflows
3. ✅ Write unit tests for both libraries (80% coverage target)
4. ✅ Test libraries against real HubSpot portal or sandbox
5. ✅ Document API usage patterns

**Deliverables**:
- Working script libraries
- Unit tests passing
- Integration tests passing
- Basic documentation

**Success Criteria**:
- Can create, update, clone, delete pages via script
- Can publish pages immediately and scheduled
- All tests passing
- No rate limit errors

---

### Phase 2: Agent Integration (4-6 hours)

**Goal**: Create specialized agent and wire into existing agents

**Tasks**:
1. ✅ Create `hubspot-cms-page-publisher` agent with action handlers
2. ✅ Enhance `hubspot-cms-content-manager` agent with delegation rules
3. ✅ Update `hubspot-orchestrator` delegation table
4. ✅ Create `cms-pages-delegation-reference.yaml`
5. ✅ Add agent routing to root `CLAUDE.md`
6. ✅ Create validation hook for agent selection
7. ✅ Test agent invocation end-to-end

**Deliverables**:
- `hubspot-cms-page-publisher` agent functional
- Delegation wiring complete at all levels
- Validation hooks active
- E2E tests passing

**Success Criteria**:
- Can invoke hubspot-cms-page-publisher from other agents
- Orchestrator correctly routes CMS page tasks
- Validation hooks catch incorrect agent usage
- Complete create-publish workflow works via agents

---

### Phase 3: User-Facing Commands (3-4 hours)

**Goal**: Create slash commands for user convenience

**Tasks**:
1. ✅ Create `/cms-create-page` command with interactive prompts
2. ✅ Create `/cms-publish-page` command with validation
3. ✅ Create `/cms-audit-pages` command with PDF generation
4. ✅ Test commands in real scenarios
5. ✅ Add command documentation

**Deliverables**:
- 3 slash commands functional
- Interactive prompts working
- PDF reports generating correctly
- Command documentation complete

**Success Criteria**:
- Users can create pages via `/cms-create-page`
- Publishing validates and succeeds via `/cms-publish-page`
- Audit generates actionable PDF via `/cms-audit-pages`
- All commands have help text and examples

---

### Phase 4: Validation & Hooks (2-3 hours)

**Goal**: Safety and notification systems

**Tasks**:
1. ✅ Implement `pre-cms-publish-validation.sh` hook
2. ✅ Implement `post-cms-publish-notification.sh` hook
3. ✅ Test hooks with various scenarios
4. ✅ Configure Slack notifications
5. ✅ Test audit trail logging

**Deliverables**:
- Validation hooks functional
- Notification hooks functional
- Slack integration working
- Audit logs generated

**Success Criteria**:
- Pre-publish validation catches errors
- Slack notifications sent after publish
- Audit trail captures all publishes
- Hooks can be disabled if needed

---

### Phase 5: Documentation & Testing (3-4 hours)

**Goal**: Complete documentation and comprehensive testing

**Tasks**:
1. ✅ Update all plugin documentation (README, CHANGELOG)
2. ✅ Create Quick Start Guide
3. ✅ Write comprehensive tests (unit, integration, E2E)
4. ✅ Test against real HubSpot portals
5. ✅ Create troubleshooting guide
6. ✅ Update agent routing references

**Deliverables**:
- Complete documentation set
- 80%+ test coverage
- Integration tests passing
- Troubleshooting guide

**Success Criteria**:
- All documentation accurate and complete
- Tests cover happy path and error cases
- Integration tests pass with real API
- Users can successfully onboard with Quick Start

---

## Success Criteria

### Functional Requirements

#### ✅ Script Libraries
- [ ] Can create website pages and landing pages
- [ ] Can retrieve pages by ID and slug
- [ ] Can update pages (draft modifications)
- [ ] Can clone pages with validation
- [ ] Can delete and archive pages
- [ ] Can publish pages immediately
- [ ] Can schedule pages for future publish
- [ ] Can validate before publish
- [ ] Can create snapshots for rollback
- [ ] Can handle pagination (1000+ pages)
- [ ] Batch operations work with rate limiting

#### ✅ Agents
- [ ] hubspot-cms-page-publisher responds to all actions
- [ ] hubspot-cms-content-manager delegates correctly
- [ ] hubspot-orchestrator routes CMS tasks correctly
- [ ] Agent invocation works end-to-end
- [ ] Error handling propagates correctly

#### ✅ Commands
- [ ] /cms-create-page creates pages successfully
- [ ] /cms-publish-page publishes with validation
- [ ] /cms-audit-pages generates PDF reports
- [ ] Interactive prompts work as expected
- [ ] Command help text accurate

#### ✅ Hooks
- [ ] Pre-publish validation catches errors
- [ ] Post-publish notifications send to Slack
- [ ] Agent selection validation prevents mistakes
- [ ] Audit logs generated correctly

### Quality Requirements

#### ✅ Testing
- [ ] Unit test coverage ≥80%
- [ ] All unit tests passing
- [ ] Integration tests passing with real API
- [ ] E2E tests passing with agent invocation
- [ ] No flaky tests

#### ✅ Documentation
- [ ] README updated with CMS section
- [ ] CHANGELOG includes all changes
- [ ] Quick Start Guide complete
- [ ] API documentation complete
- [ ] Agent wiring documented at all levels
- [ ] Troubleshooting guide comprehensive

#### ✅ Performance
- [ ] Handles 100+ pages without timeout
- [ ] Batch operations respect rate limits
- [ ] No N+1 query patterns
- [ ] Caching works correctly
- [ ] PDF generation <30 seconds for 100 pages

#### ✅ Error Handling
- [ ] All errors caught and logged
- [ ] No fake data generated on failure
- [ ] Clear error messages for users
- [ ] Rollback works after failures
- [ ] Validation prevents invalid operations

### Integration Requirements

#### ✅ Existing Patterns
- [ ] Uses HubSpotClientV3 for all API calls
- [ ] Follows DataAccessError pattern
- [ ] Includes PDF generation for audits
- [ ] Integrates with SEO optimizer
- [ ] Follows Asana integration standards
- [ ] Uses TodoWrite for task tracking
- [ ] Follows no-mocks policy

#### ✅ Agent Wiring
- [ ] Orchestrator delegation table updated
- [ ] CMS content manager delegation rules added
- [ ] Delegation reference YAML created
- [ ] Root CLAUDE.md routing table updated
- [ ] Validation hooks registered
- [ ] All agents know about cms-page-publisher

---

## Rollback Plan

### If Issues Discovered

**Phase 1-2 Issues** (Script/Agent):
1. Disable agent via plugin configuration
2. Revert script changes
3. Run tests to verify
4. Fix issues
5. Re-enable

**Phase 3 Issues** (Commands):
1. Remove commands from plugin manifest
2. Users can still use agents directly
3. Fix command issues
4. Re-add commands

**Phase 4 Issues** (Hooks):
1. Disable hooks via environment variable
2. System works without hooks
3. Fix hook issues
4. Re-enable

**Phase 5 Issues** (Documentation):
1. Mark documentation as draft
2. Fix issues
3. Re-publish

### Emergency Disable

```bash
# Disable CMS pages integration entirely
export DISABLE_CMS_PAGES_INTEGRATION=1

# Disable specific components
export DISABLE_CMS_PUBLISH_VALIDATION=1
export DISABLE_CMS_PUBLISH_NOTIFICATIONS=1
```

---

## Related Documentation

- **HubSpot API Playbook** (original): Provided by user
- **HubSpot Agent Standards**: `.claude/shared/HUBSPOT_AGENT_STANDARDS.md`
- **Asana Integration Standards**: `.claude/shared/asana-integration-standards.md`
- **PDF Generation Helper**: `opspal-core/scripts/lib/pdf-generation-helper.js`
- **Data Integrity Requirements**: `.claude/agents/DATA_SOURCE_REQUIREMENTS.md`

---

## Appendix A: API Endpoints Reference

### Create Page
```
POST /cms/v3/pages/{page-type}
```

### Retrieve Page
```
GET /cms/v3/pages/{page-type}/{page-id}
```

### List Pages
```
GET /cms/v3/pages/{page-type}
Query Params: limit, createdAfter, createdBefore, updatedAfter, sort, archived
```

### Update Page
```
PATCH /cms/v3/pages/{page-type}/{page-id}
```

### Clone Page
```
POST /cms/v3/pages/{page-type}/clone
Body: { id, cloneName }
```

### Delete Page
```
DELETE /cms/v3/pages/{page-type}/{page-id}
```

### Publish Immediately
```
POST /cms/v3/pages/{page-type}/{page-id}/draft/push-live
```

### Schedule Publish
```
POST /cms/v3/pages/{page-type}/schedule
Body: { id, publishDate }
```

**page-type**: `site-pages` or `landing-pages`

---

## Appendix B: Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `TEMPLATE_NOT_FOUND` | Template path doesn't exist | Check Design Manager |
| `SLUG_CONFLICT` | Slug already in use | Modify slug or update existing |
| `VALIDATION_FAILED` | Pre-publish validation failed | Fix validation errors |
| `SEO_SCORE_LOW` | SEO score below threshold | Improve content or use --force |
| `RATE_LIMIT_EXCEEDED` | Too many API requests | Wait or use batch operations |
| `MISSING_REQUIRED_FIELD` | Required field not provided | Add required field |
| `PAGE_NOT_FOUND` | Page ID doesn't exist | Verify page ID |
| `PUBLISH_FAILED` | Publish operation failed | Check page state and retry |

---

**End of Integration Plan**

**Next Steps**: Review plan, approve, and begin Phase 1 implementation.
