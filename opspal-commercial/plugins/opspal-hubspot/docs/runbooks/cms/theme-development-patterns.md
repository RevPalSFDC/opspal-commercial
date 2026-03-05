# HubSpot CMS Theme Development Patterns

## Overview

This runbook documents proven patterns for HubSpot CMS theme development, based on hands-on experience building and deploying themes.

## Critical Path Resolution Rules

### Module Paths in Templates

HubSpot supports two path types for modules:

| Path Type | Syntax | Use Case |
|-----------|--------|----------|
| **Absolute** | `path="/theme-name/modules/module.module"` | Recommended - always works |
| **Relative** | `path="../modules/module.module"` | Works but error-prone |

**Absolute paths (recommended):**
```hubl
{% module "hero" path="/opspal-theme/modules/hero.module" %}
```

**Relative paths (use with caution):**
- From `templates/page.html`: `path="../modules/hero.module"`
- From `templates/layouts/base.html`: `path="../../modules/header.module"`

### Template Extends Paths

The `{% extends %}` tag uses **file-relative paths**:

```hubl
{# From templates/home.html #}
{% extends "./layouts/base.html" %}
```

### Asset Paths (CSS, JS, Images)

Use `get_asset_url()` with **theme-relative paths**:

```hubl
{# Correct - theme-relative #}
<link rel="stylesheet" href="{{ get_asset_url('assets/css/main.css') }}">

{# Also works #}
{{ require_css(get_asset_url('assets/css/main.css')) }}
```

**Important:** The leading `./` is optional and may cause issues in some contexts.

## CSS Loading: Critical Patterns

### The External CSS Problem

External CSS loading via `get_asset_url()` can be **unreliable** in HubSpot CMS:

```hubl
{# May not work reliably #}
<link rel="stylesheet" href="{{ get_asset_url('assets/css/main.css') }}">
```

**Common failure modes:**
- CSS file not served
- Caching issues
- Path resolution failures
- HubL variables not processed

### RECOMMENDED: Inline Critical CSS

**The most reliable approach** is embedding critical CSS directly in base.html:

```html
<style>
  :root {
    --grape: #5F3B8C;
    --clay: #E99560;
    --sand: #EAE4DC;
    --font-heading: "Montserrat", sans-serif;
    --font-body: "Figtree", sans-serif;
  }
  body {
    font-family: var(--font-body);
    background: var(--sand);
  }
  h1, h2, h3 {
    font-family: var(--font-heading);
  }
  /* ... rest of critical CSS ... */
</style>
```

**Benefits:**
- Always loads (no external file dependency)
- No caching issues
- No path resolution problems
- Faster initial render (no extra HTTP request)

### Alternative: require_css() Function

If you must use external CSS:

```hubl
{{ require_css(get_asset_url('assets/css/main.css')) }}
```

This is HubSpot's recommended method but may still have issues.

### CSS Variables with HubL (Advanced)

If you need theme-editable values, use inline styles with HubL:

```hubl
<style>
  :root {
    --primary: {{ theme.colors.primary || "#5F3B8C" }};
  }
</style>
```

**Note:** External CSS files with HubL syntax require `require_css()` to process the variables.

### Summary

| Method | Reliability | Use Case |
|--------|-------------|----------|
| **Inline `<style>`** | Highest | Critical styles, brand colors, fonts |
| `require_css()` | Medium | Additional styles, non-critical CSS |
| `<link>` + `get_asset_url()` | Lowest | May fail silently |

## Theme Structure

### Required Files

```
theme-name/
├── theme.json          # Theme metadata (required)
├── fields.json         # Theme-level settings
├── templates/
│   ├── layouts/
│   │   └── base.html   # Base layout
│   └── *.html          # Page templates
├── modules/
│   └── *.module/       # Custom modules
│       ├── module.html
│       ├── fields.json
│       └── meta.json
└── assets/
    └── css/
        └── main.css    # Theme styles
```

### Template Annotations

Page templates need HTML comment annotations:

```html
<!--
  templateType: page
  isAvailableForNewContent: true
  label: Home Page
  screenshotPath: ../assets/images/template-home.png
-->
```

## Module Development

### Module Structure

```
module-name.module/
├── module.html     # HubL template
├── fields.json     # Editable fields
└── meta.json       # Module metadata
```

### meta.json Example

```json
{
  "label": "Hero Section",
  "css_assets": [],
  "external_js": [],
  "global": false,
  "host_template_types": ["PAGE"],
  "icon": "../assets/icons/hero.svg",
  "js_assets": [],
  "other_assets": [],
  "smart_type": "NOT_SMART",
  "is_available_for_new_content": true
}
```

### Module vs Global Module

- **`{% module %}`**: Standard module, instance-specific
- **`{% global_module %}`**: Shared across pages, editable from Global Content

```hubl
{# Standard module #}
{% module "hero" path="/theme/modules/hero.module" %}

{# Global module (shared content) #}
{% global_module "header" path="/theme/modules/header.module" %}
```

## Common Pitfalls

### 1. Module Not Found Errors

**Cause:** Incorrect path resolution
**Fix:** Use absolute paths starting with `/theme-name/`

### 2. CSS Not Loading

**Causes:**
- HubL variables in CSS not being processed
- Incorrect asset path

**Fixes:**
- Use hardcoded CSS values
- Verify path with `get_asset_url('assets/css/main.css')`

### 3. Templates Not Showing in Theme Picker

**Cause:** Missing or incorrect template annotations
**Fix:** Ensure HTML comment block with `templateType`, `isAvailableForNewContent`, `label`

### 4. Fonts Not Loading

**Causes:**
- Google Fonts not preconnected
- Font family not applied in CSS

**Fix:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">
```

## CLI Commands

### Upload Theme

```bash
# Upload to default portal
hs upload . theme-name

# Upload to specific account
hs upload --account=account-name . theme-name
```

### Watch Mode (Development)

```bash
hs watch --account=account-name . theme-name
```

### Fetch Theme

```bash
hs fetch theme-name
```

## Testing Checklist

- [ ] Templates appear in theme picker
- [ ] CSS loads and applies correctly
- [ ] Fonts render properly
- [ ] Modules display content
- [ ] Header/footer appear on all pages
- [ ] Responsive design works
- [ ] Forms function correctly
- [ ] Links navigate properly

## Related Resources

- [HubSpot CMS Developer Docs](https://developers.hubspot.com/docs/cms)
- [Using Modules in Templates](https://developers.hubspot.com/docs/cms/building-blocks/modules/using-modules-in-templates)
- [Theme Development](https://developers.hubspot.com/docs/cms/building-blocks/themes)

---
Last Updated: 2026-01-18
