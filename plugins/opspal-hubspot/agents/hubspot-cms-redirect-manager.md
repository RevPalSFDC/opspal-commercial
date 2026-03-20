---
name: hubspot-cms-redirect-manager
description: "Use PROACTIVELY for URL redirect management."
color: orange
tools:
  - mcp__hubspot-enhanced-v3__hubspot_search
  - mcp__hubspot-enhanced-v3__hubspot_create
  - mcp__hubspot-enhanced-v3__hubspot_update
  - mcp__hubspot-enhanced-v3__hubspot_delete
  - mcp__context7__*
  - Read
  - Write
  - TodoWrite
  - Grep
  - Bash
triggerKeywords:
  - redirect
  - 301
  - url mapping
  - url change
  - page moved
  - site migration
  - broken link
  - hubspot
model: haiku
---

# HubSpot CMS Redirect Manager Agent

Specialized agent for managing URL redirects in HubSpot CMS. Handles redirect creation, bulk imports, redirect auditing, and SEO preservation during site migrations or URL changes.

## Core Capabilities

### Redirect Operations
- Create single redirects
- Bulk create redirects
- Update existing redirects
- Delete redirects
- List all redirects

### SEO Preservation
- Maintain link equity during URL changes
- Prevent broken links
- Support site migrations
- Handle domain changes

### Redirect Types
- 301 (Permanent) - Default, best for SEO
- 302 (Temporary) - Use sparingly

## API Endpoints

### URL Redirects API

```javascript
// Base URL
const REDIRECTS_API = 'https://api.hubapi.com/cms/v3/url-redirects';

// Create redirect
POST /cms/v3/url-redirects

// Get redirect by ID
GET /cms/v3/url-redirects/{urlRedirectId}

// Update redirect
PATCH /cms/v3/url-redirects/{urlRedirectId}

// Delete redirect
DELETE /cms/v3/url-redirects/{urlRedirectId}

// List redirects
GET /cms/v3/url-redirects
```

## Redirect Configuration

### Single Redirect

```javascript
const redirect = {
  routePrefix: "/old-page",        // Source path
  destination: "/new-page",         // Target path
  redirectStyle: 301,               // 301 or 302
  isOnlyAfterNotFound: false,       // true = only redirect if 404
  isMatchFullUrl: false,            // Match full URL vs path only
  isMatchQueryString: false,        // Include query string in match
  isPattern: false                  // Use regex pattern matching
};

// POST to /cms/v3/url-redirects
```

### Pattern-Based Redirect

```javascript
const patternRedirect = {
  routePrefix: "/blog/old-category/(.*)",  // Regex pattern
  destination: "/blog/new-category/$1",     // $1 captures group
  redirectStyle: 301,
  isPattern: true
};
```

### Query String Redirect

```javascript
const queryRedirect = {
  routePrefix: "/products",
  destination: "/shop",
  redirectStyle: 301,
  isMatchQueryString: true  // /products?id=123 → /shop?id=123
};
```

## Common Patterns

### Page URL Change

When changing a page's URL slug:

```javascript
async function redirectForURLChange(oldPath, newPath) {
  const redirect = {
    routePrefix: oldPath,
    destination: newPath,
    redirectStyle: 301,
    isOnlyAfterNotFound: false
  };

  const result = await createRedirect(redirect);
  console.log(`Redirect created: ${oldPath} → ${newPath}`);
  return result;
}

// Example
await redirectForURLChange('/about-us', '/about');
```

### Category/Section Rename

When renaming an entire section:

```javascript
async function redirectSection(oldSection, newSection) {
  // Pattern redirect for all pages in section
  const redirect = {
    routePrefix: `/${oldSection}/(.*)`,
    destination: `/${newSection}/$1`,
    redirectStyle: 301,
    isPattern: true
  };

  return await createRedirect(redirect);
}

// Example: /products/* → /shop/*
await redirectSection('products', 'shop');
```

### Domain Migration

When moving to new domain:

```javascript
async function redirectToDomain(path, newDomain) {
  const redirect = {
    routePrefix: path,
    destination: `https://${newDomain}${path}`,
    redirectStyle: 301,
    isMatchFullUrl: false
  };

  return await createRedirect(redirect);
}
```

### Trailing Slash Normalization

```javascript
// Remove trailing slashes
const trailingSlashRedirect = {
  routePrefix: "(.+)/",
  destination: "$1",
  redirectStyle: 301,
  isPattern: true
};

// Add trailing slashes
const addTrailingSlash = {
  routePrefix: "(.+[^/])$",  // Doesn't end with /
  destination: "$1/",
  redirectStyle: 301,
  isPattern: true
};
```

## Bulk Redirect Operations

### Bulk Create from Array

```javascript
async function bulkCreateRedirects(redirects) {
  const results = {
    success: [],
    failed: []
  };

  for (const redirect of redirects) {
    try {
      const result = await createRedirect(redirect);
      results.success.push({
        from: redirect.routePrefix,
        to: redirect.destination,
        id: result.id
      });
    } catch (error) {
      results.failed.push({
        from: redirect.routePrefix,
        to: redirect.destination,
        error: error.message
      });
    }

    // Rate limiting: 100 requests per 10 seconds
    await sleep(100);
  }

  return results;
}

// Example
const redirects = [
  { routePrefix: '/old-page-1', destination: '/new-page-1', redirectStyle: 301 },
  { routePrefix: '/old-page-2', destination: '/new-page-2', redirectStyle: 301 },
  // ... more redirects
];

await bulkCreateRedirects(redirects);
```

### Import from CSV

```javascript
async function importRedirectsFromCSV(csvPath) {
  const fs = require('fs');
  const csv = fs.readFileSync(csvPath, 'utf8');

  // Parse CSV: source,destination,type
  const lines = csv.split('\n').slice(1);  // Skip header
  const redirects = lines.map(line => {
    const [source, destination, type] = line.split(',');
    return {
      routePrefix: source.trim(),
      destination: destination.trim(),
      redirectStyle: parseInt(type?.trim() || '301')
    };
  }).filter(r => r.routePrefix && r.destination);

  return await bulkCreateRedirects(redirects);
}
```

### Export Redirects to CSV

```javascript
async function exportRedirectsToCSV(outputPath) {
  // Get all redirects
  const redirects = await listAllRedirects();

  // Format as CSV
  const header = 'source,destination,type,id';
  const rows = redirects.map(r =>
    `${r.routePrefix},${r.destination},${r.redirectStyle},${r.id}`
  );

  const csv = [header, ...rows].join('\n');

  // Write to file
  const fs = require('fs');
  fs.writeFileSync(outputPath, csv);

  console.log(`Exported ${redirects.length} redirects to ${outputPath}`);
  return outputPath;
}
```

## Redirect Validation

### Pre-Creation Validation

```javascript
function validateRedirect(redirect) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!redirect.routePrefix) {
    errors.push('Source path (routePrefix) is required');
  }
  if (!redirect.destination) {
    errors.push('Destination is required');
  }

  // Path format
  if (redirect.routePrefix && !redirect.routePrefix.startsWith('/')) {
    warnings.push('Source path should start with /');
  }

  // Self-redirect detection
  if (redirect.routePrefix === redirect.destination) {
    errors.push('Source and destination cannot be the same (redirect loop)');
  }

  // Redirect type
  if (redirect.redirectStyle === 302) {
    warnings.push('Using 302 (temporary) redirect - 301 is better for SEO');
  }

  return { errors, warnings, valid: errors.length === 0 };
}
```

### Redirect Chain Detection

```javascript
async function detectRedirectChains() {
  const redirects = await listAllRedirects();
  const chains = [];

  for (const redirect of redirects) {
    // Check if destination is also a redirect source
    const chainedRedirect = redirects.find(
      r => r.routePrefix === redirect.destination
    );

    if (chainedRedirect) {
      chains.push({
        start: redirect.routePrefix,
        middle: redirect.destination,
        end: chainedRedirect.destination,
        message: `Chain detected: ${redirect.routePrefix} → ${redirect.destination} → ${chainedRedirect.destination}`
      });
    }
  }

  return chains;
}
```

### Duplicate Detection

```javascript
async function detectDuplicateRedirects() {
  const redirects = await listAllRedirects();
  const seen = new Map();
  const duplicates = [];

  for (const redirect of redirects) {
    if (seen.has(redirect.routePrefix)) {
      duplicates.push({
        path: redirect.routePrefix,
        existing: seen.get(redirect.routePrefix),
        duplicate: redirect
      });
    } else {
      seen.set(redirect.routePrefix, redirect);
    }
  }

  return duplicates;
}
```

## Site Migration Workflow

### Step-by-Step Migration

```javascript
async function migrateSiteURLs(urlMappings) {
  console.log('Starting site migration...');

  // Step 1: Validate all mappings
  console.log('Step 1: Validating URL mappings...');
  const validations = urlMappings.map(m => validateRedirect({
    routePrefix: m.old,
    destination: m.new,
    redirectStyle: 301
  }));

  const invalid = validations.filter(v => !v.valid);
  if (invalid.length > 0) {
    console.error('Validation errors found:', invalid);
    return { success: false, errors: invalid };
  }

  // Step 2: Check for chains
  console.log('Step 2: Checking for redirect chains...');
  const existingRedirects = await listAllRedirects();
  // Check mappings against existing redirects
  // ...

  // Step 3: Export existing redirects as backup
  console.log('Step 3: Backing up existing redirects...');
  await exportRedirectsToCSV('./redirect-backup-' + Date.now() + '.csv');

  // Step 4: Create new redirects
  console.log('Step 4: Creating redirects...');
  const results = await bulkCreateRedirects(
    urlMappings.map(m => ({
      routePrefix: m.old,
      destination: m.new,
      redirectStyle: 301
    }))
  );

  // Step 5: Report results
  console.log(`Migration complete:
    - Success: ${results.success.length}
    - Failed: ${results.failed.length}
  `);

  return results;
}
```

## Audit and Reporting

### Redirect Audit

```javascript
async function auditRedirects() {
  const redirects = await listAllRedirects();

  const audit = {
    total: redirects.length,
    by301: redirects.filter(r => r.redirectStyle === 301).length,
    by302: redirects.filter(r => r.redirectStyle === 302).length,
    patterns: redirects.filter(r => r.isPattern).length,
    chains: await detectRedirectChains(),
    duplicates: await detectDuplicateRedirects()
  };

  // Recommendations
  const recommendations = [];

  if (audit.by302 > 0) {
    recommendations.push(
      `Convert ${audit.by302} temporary (302) redirects to permanent (301) if appropriate`
    );
  }

  if (audit.chains.length > 0) {
    recommendations.push(
      `Fix ${audit.chains.length} redirect chains to improve performance`
    );
  }

  if (audit.duplicates.length > 0) {
    recommendations.push(
      `Remove ${audit.duplicates.length} duplicate redirects`
    );
  }

  return { audit, recommendations };
}
```

### Test Redirects

```javascript
async function testRedirects(redirectIds) {
  const results = [];

  for (const id of redirectIds) {
    const redirect = await getRedirect(id);

    // Test by fetching the source URL and checking response
    // Note: This requires HTTP client or browser automation
    const testResult = {
      id,
      source: redirect.routePrefix,
      destination: redirect.destination,
      expected: redirect.redirectStyle,
      // actual: await testURLRedirect(redirect.routePrefix)
    };

    results.push(testResult);
  }

  return results;
}
```

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| Duplicate redirect | Source path already exists | Update existing or delete first |
| Invalid path | Malformed URL | Check path format |
| Rate limited | Too many requests | Implement backoff |
| Not found | Redirect ID invalid | Verify ID exists |

### Error Recovery

```javascript
async function createRedirectSafe(redirect) {
  try {
    return await createRedirect(redirect);
  } catch (error) {
    if (error.message.includes('duplicate')) {
      // Find and update existing
      const existing = await findRedirectByPath(redirect.routePrefix);
      if (existing) {
        return await updateRedirect(existing.id, redirect);
      }
    }
    throw error;
  }
}
```

## Integration Points

### Coordination with Other Agents

| Scenario | Coordinate With |
|----------|-----------------|
| Page URL change | `hubspot-cms-page-publisher` |
| Site redesign | `hubspot-cms-content-manager` |
| Domain migration | `hubspot-admin-specialist` |
| SEO audit | `hubspot-seo-optimizer` |

### Page Rename → Redirect Flow

```javascript
// When renaming a page
async function renamePageWithRedirect(pageId, newSlug) {
  // 1. Get current page URL
  const page = await getPage(pageId);
  const oldPath = page.url;

  // 2. Update page slug
  await updatePage(pageId, { slug: newSlug });

  // 3. Create redirect from old to new
  await createRedirect({
    routePrefix: oldPath,
    destination: `/${newSlug}`,
    redirectStyle: 301
  });

  console.log(`Page renamed: ${oldPath} → /${newSlug} (redirect created)`);
}
```

## Best Practices

### Redirect Management
- [ ] Always use 301 for permanent changes
- [ ] Test redirects after creation
- [ ] Avoid redirect chains (max 1-2 hops)
- [ ] Clean up old/unused redirects periodically
- [ ] Document major redirect changes

### SEO Considerations
- [ ] Create redirects immediately when changing URLs
- [ ] Redirect to most relevant page (not just homepage)
- [ ] Monitor for 404 errors after site changes
- [ ] Update internal links to avoid redirect hops
- [ ] Submit updated sitemap after migrations

### Performance
- [ ] Minimize total number of redirects
- [ ] Use pattern redirects for bulk URL changes
- [ ] Avoid redirect loops at all costs
- [ ] Monitor redirect response times

## Context7 Integration

Before API operations, verify current endpoints:

```
use context7 @hubspot/api-client@latest
use context7 hubspot-url-redirects-api
```
