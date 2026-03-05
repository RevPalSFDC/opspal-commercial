---
command: cms-publish-page
description: Publish a HubSpot CMS page (immediate or scheduled) with validation
usage: /cms-publish-page <page-id> [options]
---

# Publish CMS Page

Publish a draft CMS page immediately or schedule for future publication, with optional SEO validation and rollback protection.

## Usage

```bash
# Immediate publish with validation (recommended)
/cms-publish-page <page-id>

# Scheduled publish
/cms-publish-page <page-id> --schedule "2025-12-01T15:00:00Z"

# Publish without SEO validation (not recommended)
/cms-publish-page <page-id> --no-validate

# Force publish despite low SEO score
/cms-publish-page <page-id> --force
```

## Arguments

- `<page-id>` : Page ID to publish (required)

## Options

- `--schedule <date>` : Schedule publish for future date (ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ)
- `--validate-seo` : Run SEO validation before publishing [default: true]
- `--no-validate` : Skip all validation (not recommended)
- `--min-seo-score <score>` : Minimum SEO score required [default: 60]
- `--force` : Publish despite validation failures (not recommended)
- `--no-snapshot` : Skip snapshot creation (not recommended)

## Workflow

### Step 1: Retrieve Page
```
📊 Retrieving page details...

Page: Product Launch (ID: 12345678)
Current State: DRAFT
URL: https://example.com/product-launch
Last Modified: 2025-11-04T12:00:00Z
```

### Step 2: SEO Validation (if enabled)
```
🔍 Running SEO validation...

SEO Analysis Results:
   Overall Score: 75/100 ✅

   ✅ Target keyword in title
   ✅ Meta description present (155 characters)
   ✅ Keyword density: 1.8% (optimal)
   ✅ H2 subheadings: 5 (good)
   ✅ Content length: 1,250 words (excellent)
   ⚠️  Alt text missing on 2 images

Recommendations:
   1. Add alt text to remaining images
   2. Consider adding internal links

Validation: PASSED (score ≥ 60)
```

### Step 3: Confirmation (for immediate publish)
```
? Publish page now? This will make it live immediately. (Y/n): _
```

### Step 4: Snapshot Creation
```
📸 Creating rollback snapshot...
   Snapshot ID: 87654321
   Snapshot created successfully
```

### Step 5: Publishing
```
🚀 Publishing page...

✅ Page published successfully!

   Page ID: 12345678
   State: PUBLISHED
   Published at: 2025-11-04T14:30:00Z
   Live URL: https://example.com/product-launch

📊 Publishing Status:
   Currently Published: Yes
   State: PUBLISHED
   Rollback Available: Yes (snapshot: 87654321)
```

## Output Examples

### Immediate Publish Success
```
✅ Page published successfully!

   ID: 12345678
   Name: Product Launch
   State: PUBLISHED
   URL: https://example.com/product-launch
   Published at: 2025-11-04T14:30:00Z
   SEO Score: 75/100

🌐 Live URL: https://example.com/product-launch
📸 Rollback snapshot: 87654321
```

### Scheduled Publish Success
```
✅ Page scheduled for publication!

   ID: 12345678
   Name: Product Launch
   State: SCHEDULED
   Scheduled for: 2025-12-01T15:00:00Z
   URL: https://example.com/product-launch

🕒 The page will automatically go live on Dec 1, 2025 at 3:00 PM UTC
📝 To cancel: /cms-cancel-publish 12345678
```

### SEO Validation Failure
```
⚠️  SEO Score: 45/100 (below threshold of 60)

Issues Found:
   ❌ No target keyword in title
   ❌ Meta description too short (85 characters, min 150)
   ❌ Content length too low (350 words, target 800+)
   ❌ No H2 subheadings found
   ⚠️  Keyword density too high: 3.2% (max 2.5%)

Recommendations:
   1. Add target keyword to page title
   2. Expand meta description to 150-160 characters
   3. Increase content to at least 800 words
   4. Add 3-5 H2 subheadings for structure
   5. Reduce keyword usage to avoid stuffing

? Choose an action:
  ❯ Fix issues and retry
    Publish anyway (--force)
    Cancel
```

## Examples

### Example 1: Standard Publish
```bash
/cms-publish-page 12345678
```
This will:
1. Validate page (SEO, required fields, template)
2. Create rollback snapshot
3. Publish immediately
4. Report success with live URL

### Example 2: Schedule for Future
```bash
/cms-publish-page 12345678 --schedule "2025-12-01T15:00:00Z"
```
Page will automatically go live on December 1, 2025 at 3:00 PM UTC.

### Example 3: Custom SEO Threshold
```bash
/cms-publish-page 12345678 --min-seo-score 70
```
Requires SEO score of 70 or higher (stricter than default 60).

### Example 4: Force Publish (Use with Caution)
```bash
/cms-publish-page 12345678 --force
```
Bypasses all validation. Use only when absolutely necessary.

### Example 5: Quick Publish (No Validation)
```bash
/cms-publish-page 12345678 --no-validate --no-snapshot
```
Fastest publish, but skips safety checks. Not recommended for production.

## Validation Checks

### Required Field Validation
- ✅ Page name present
- ✅ URL slug present
- ✅ Meta description present
- ✅ HTML title present
- ✅ Template path valid

### Template Validation
- ✅ Template exists in Design Manager
- ✅ Template is published (not draft)

### SEO Validation (if enabled)
- Target keyword in title
- Meta description length (150-160 characters)
- Content length (minimum 800 words recommended)
- Heading structure (H1, H2, H3)
- Keyword density (1.5-2.5% optimal)
- Image alt text
- Internal/external links

### Content Validation
- At least one content module (widget)
- No broken internal links (if configured)
- No missing images (if configured)

## Error Handling

### Validation Errors

**Missing Required Field**:
```
❌ Validation failed: Missing meta description

The page must have a meta description before publishing.

? Choose an action:
  ❯ Add meta description and retry
    Skip validation (--force)
    Cancel
```

**Template Not Found**:
```
❌ Template validation failed: templates/product.html not found

The page uses a template that doesn't exist or has been deleted.

? Choose an action:
  ❯ Assign a different template
    Cancel publishing
```

**SEO Score Below Threshold**:
```
⚠️  SEO Score: 45/100 (threshold: 60)

See recommendations above for improvements.

? Choose an action:
  ❯ Fix issues and retry
    Lower threshold (--min-seo-score 40)
    Force publish (--force)
    Cancel
```

### Publishing Errors

**Already Published**:
```
ℹ️  Page is already published

Current state: PUBLISHED
Last published: 2025-11-03T10:00:00Z

? Choose an action:
  ❯ Republish with latest changes
    Cancel
```

**Rate Limit Exceeded**:
```
⏳ Rate limit reached, waiting 5s...

(The command will automatically retry after wait period)
```

**Network Error**:
```
❌ Publishing failed: Network error

? Retry? (Y/n): _
```

## Rollback

If publishing fails after snapshot creation, the command will automatically offer rollback:

```
❌ Publishing failed: API error

📸 Rollback snapshot available: 87654321

? Rollback to previous version? (Y/n): y

🔄 Rolling back...
✅ Page restored to previous version
```

Manual rollback:
```bash
# Rollback using snapshot ID
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/hubspot-cms-publishing-controller.js rollback <page-id> <snapshot-id>
```

## Behind the Scenes

This command uses the `hubspot-cms-page-publisher` agent and orchestrates multiple operations:

```javascript
// Step 1: Get page
const page = await getPage(pageId);

// Step 2: Validate (if enabled)
if (options.validateSeo) {
  const seoScore = await Task.invoke('hubspot-seo-optimizer', ...);
  if (seoScore < minScore && !options.force) {
    throw new Error('SEO validation failed');
  }
}

// Step 3: Create snapshot
const snapshot = await Task.invoke('hubspot-cms-page-publisher', {
  action: 'create_snapshot',
  pageId
});

// Step 4: Publish
if (options.schedule) {
  await Task.invoke('hubspot-cms-page-publisher', {
    action: 'publish_page',
    pageId,
    publishType: 'scheduled',
    publishDate: options.schedule
  });
} else {
  await Task.invoke('hubspot-cms-page-publisher', {
    action: 'publish_page',
    pageId,
    publishType: 'immediate'
  });
}
```

## Best Practices

1. **Always Validate SEO**: Don't skip SEO validation for important pages
2. **Use Scheduled Publish**: For coordinated launches, schedule publish time
3. **Review Before Publishing**: Use preview URL to review page first
4. **Keep Snapshots**: Don't use `--no-snapshot` for production pages
5. **Monitor After Publish**: Check live URL after publishing to verify
6. **Document Changes**: Add notes in commit/publish message

## Tips

- **Preview First**: Always preview page before publishing with `?preview=true` URL parameter
- **SEO Optimization**: Aim for SEO score ≥70 for best results
- **Scheduled Publish**: Schedule during low-traffic hours for major updates
- **A/B Testing**: Consider creating page variants for testing before full publish
- **Mobile Check**: Use Playwright integration to test responsive design before publish

## Related Commands

- `/cms-create-page` - Create a new page
- `/cms-audit-pages` - Audit all pages for SEO and quality
- `/cms-cancel-publish` - Cancel a scheduled publish

## Technical Details

**Agent**: hubspot-cms-page-publisher
**API Endpoints**:
- POST /cms/v3/pages/{page-type}/{page-id}/draft/push-live (immediate)
- POST /cms/v3/pages/{page-type}/schedule (scheduled)
**Rate Limiting**: 150 requests/10 seconds (automatic)
**Validation**: Pre-publish SEO, template, and required field checks
**Rollback**: Automatic snapshot creation before publish

## Troubleshooting

**Problem**: "Page not found" error
**Solution**: Verify page ID is correct. Use `/cms-audit-pages` to list all pages.

**Problem**: SEO validation always fails
**Solution**: Lower threshold with `--min-seo-score` or use `--no-validate` temporarily while improving content.

**Problem**: Can't schedule for past date
**Solution**: Ensure date is in future and in ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ).

**Problem**: Publish succeeds but page not visible
**Solution**: Check domain settings and ensure page isn't password-protected.
