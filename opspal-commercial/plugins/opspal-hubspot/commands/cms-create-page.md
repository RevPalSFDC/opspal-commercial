---
command: cms-create-page
description: Create a new HubSpot CMS page (website or landing page) with validation
argument-hint: "--type landing-page --name \"Product Launch\" --slug \"product-launch\""
usage: /cms-create-page [options]
---

# Create CMS Page

Interactive command to create a new HubSpot CMS page (website page or landing page) with template validation and optional immediate publishing.

## Usage

```bash
# Interactive mode (recommended)
/cms-create-page

# Quick creation with options
/cms-create-page --type landing-page --name "Product Launch" --slug "product-launch"

# Create and publish immediately
/cms-create-page --name "News Update" --slug "news-update" --publish
```

## Options

- `--type` : Page type (`site-pages` or `landing-pages`) [default: landing-pages]
- `--name` : Page name (internal reference, required)
- `--slug` : URL slug (e.g., "my-landing-page", required)
- `--template` : Template path in Design Manager (optional, will prompt if not provided)
- `--language` : Content language code [default: en]
- `--domain` : Domain to publish on [default: primary domain]
- `--publish` : Publish immediately after creation [default: false]

## Interactive Workflow

If options are not provided via flags, the command will prompt interactively:

### Step 1: Page Type
```
? Select page type:
  ❯ Landing Page (landing-pages)
    Website Page (site-pages)
```

### Step 2: Page Name
```
? Enter page name (internal reference): _
```

### Step 3: URL Slug
```
? Enter URL slug (e.g., "my-landing-page"): _
(Auto-generated from name if left blank)
```

### Step 4: Template Selection
```
? Select template:
  ❯ templates/product-landing.html (Product Landing Page)
    templates/content-page.html (Content Page)
    templates/thank-you.html (Thank You Page)
    [Custom path...]
```

### Step 5: Language
```
? Content language: [en]
```

### Step 6: Publish Option
```
? Publish immediately? (Y/n): _
```

## Output

### Success
```
✅ Page created successfully!

   ID: 12345678
   Name: Product Launch
   Type: landing-pages
   URL: https://example.com/product-launch
   State: DRAFT
   Template: templates/product-landing.html
   Language: en

📝 Next steps:
   - Edit content: Visit page in HubSpot CMS editor
   - Publish: /cms-publish-page 12345678
   - Preview: https://example.com/product-launch?preview=true
```

### With Immediate Publish
```
✅ Page created and published successfully!

   ID: 12345678
   Name: Product Launch
   URL: https://example.com/product-launch
   State: PUBLISHED
   Published at: 2025-11-04T14:30:00Z

🌐 Live URL: https://example.com/product-launch
```

## Examples

### Example 1: Interactive Mode
```bash
/cms-create-page
```
This will guide you through all options step-by-step.

### Example 2: Quick Landing Page
```bash
/cms-create-page \
  --type landing-page \
  --name "Q4 Product Launch" \
  --slug "q4-product-launch" \
  --template "templates/product.html"
```

### Example 3: Website Page with Publish
```bash
/cms-create-page \
  --type site-pages \
  --name "About Us" \
  --slug "about-us" \
  --template "templates/content.html" \
  --publish
```

### Example 4: Multi-language Page
```bash
/cms-create-page \
  --name "Lancement de Produit" \
  --slug "lancement-produit" \
  --language "fr" \
  --template "templates/product.html"
```

## Validation

The command performs these validation checks:

1. **Template Validation**: Verifies template exists in Design Manager
2. **Slug Uniqueness**: Checks if slug is already in use
3. **Slug Format**: Ensures slug is URL-friendly (lowercase, alphanumeric, hyphens)
4. **Required Fields**: Validates name and slug are provided

### Handling Validation Errors

**Template Not Found**:
```
❌ Template validation failed: templates/invalid.html not found

Available templates:
  - templates/product-landing.html
  - templates/content-page.html
  - templates/thank-you.html

? Select a template or enter custom path: _
```

**Slug Conflict**:
```
⚠️  Slug "product-launch" already exists

? Choose an action:
  ❯ Modify slug (e.g., "product-launch-2025")
    Update existing page instead
    Cancel operation
```

**Invalid Slug Format**:
```
❌ Slug "Product Launch!" is invalid

Slugs must:
  - Be lowercase
  - Use only letters, numbers, and hyphens
  - Not start or end with hyphen

Suggested: "product-launch"
```

## Error Handling

### Common Errors

**Missing Environment Variables**:
```
❌ Error: HUBSPOT_ACCESS_TOKEN not set

Please configure:
  export HUBSPOT_ACCESS_TOKEN="your-token"
  export HUBSPOT_PORTAL_ID="your-portal-id"
```

**API Rate Limit**:
```
⏳ Rate limit reached, waiting 8s...

(The command will automatically retry after the wait period)
```

**Network Error**:
```
❌ Failed to create page: Network error

? Retry? (Y/n): _
```

## Behind the Scenes

This command delegates to the `hubspot-cms-page-publisher` agent:

```javascript
await Task.invoke('opspal-hubspot:hubspot-cms-page-publisher', JSON.stringify({
  action: 'create_page',
  pageData: {
    name: pageName,
    slug: pageSlug,
    templatePath: template,
    language: language,
    domain: domain
  }
}));
```

If `--publish` flag is used, it additionally calls:

```javascript
await Task.invoke('opspal-hubspot:hubspot-cms-page-publisher', JSON.stringify({
  action: 'publish_page',
  pageId: createdPageId,
  publishType: 'immediate'
}));
```

## Tips & Best Practices

1. **Use Descriptive Names**: Page names are internal - make them searchable
2. **SEO-Friendly Slugs**: Keep slugs short, descriptive, and keyword-rich
3. **Test in Draft**: Create pages as drafts first, review, then publish
4. **Template Consistency**: Use the same template for similar pages
5. **Multi-language**: Create separate pages for each language variant

## Related Commands

- `/cms-publish-page` - Publish or schedule a page
- `/cms-audit-pages` - Audit all pages with SEO analysis
- `/hub spot-discovery` - Discover available templates and domains

## Technical Details

**Agent**: hubspot-cms-page-publisher
**API Endpoint**: POST /cms/v3/pages/{page-type}
**Rate Limiting**: 150 requests/10 seconds (automatic)
**Validation**: Pre-creation template and slug validation
**Caching**: Template validation cached for 1 hour

## Troubleshooting

**Problem**: "Template not found" error
**Solution**:
1. Verify template exists in Design Manager
2. Check exact path spelling
3. Ensure template is published (not draft)

**Problem**: "Slug already exists" error
**Solution**:
1. Use a different slug
2. OR: Update existing page with that slug
3. OR: Archive/delete the conflicting page first

**Problem**: Command hangs after creation
**Solution**:
1. Check network connection
2. Verify HubSpot API status
3. Check rate limits aren't exceeded
