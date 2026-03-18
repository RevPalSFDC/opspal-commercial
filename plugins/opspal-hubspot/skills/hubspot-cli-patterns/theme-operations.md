# HubSpot CLI Theme Operations

Complete reference for managing HubSpot CMS themes via CLI.

## Theme Lifecycle

### 1. Create New Theme

```bash
# Create from scratch
hs cms create website-theme my-theme

# This creates:
# my-theme/
# ├── theme.json        # Theme configuration
# ├── fields.json       # Theme settings fields
# ├── templates/        # Page templates
# ├── modules/          # Custom modules
# ├── css/              # Stylesheets
# └── js/               # JavaScript
```

### 2. Clone Existing Theme

```bash
# Fetch theme from HubSpot
hs cms fetch @hubspot/existing-theme ./my-theme-clone

# Modify theme.json to change name/label
# Then upload as new theme
hs cms upload ./my-theme-clone @hubspot/my-new-theme --mode=draft
```

### 3. Create Child Theme

HubSpot supports child themes for marketplace themes:

```bash
# In HubSpot Design Manager:
# Right-click parent theme → Create child theme

# Fetch the child theme locally
hs cms fetch @hubspot/my-child-theme ./my-child-theme

# Child theme inherits parent but allows overrides
```

## Upload Operations

### Upload to Draft (Safe Development)

```bash
# Upload entire theme to draft
hs cms upload ./my-theme @hubspot/my-theme --mode=draft

# Upload specific file to draft
hs cms upload ./my-theme/css/main.css @hubspot/my-theme/css/main.css --mode=draft

# Upload specific folder to draft
hs cms upload ./my-theme/templates/ @hubspot/my-theme/templates/ --mode=draft
```

### Upload to Publish (Go Live)

```bash
# Upload entire theme to publish (LIVE IMMEDIATELY)
hs cms upload ./my-theme @hubspot/my-theme --mode=publish

# Upload specific file to publish
hs cms upload ./my-theme/css/main.css @hubspot/my-theme/css/main.css --mode=publish
```

### Overwrite Behavior

```bash
# Default: Overwrites existing files
hs cms upload ./my-theme @hubspot/my-theme --mode=draft

# Remove files in HubSpot that don't exist locally
hs cms upload ./my-theme @hubspot/my-theme --mode=draft --remove
```

## Fetch Operations

### Fetch Entire Theme

```bash
# Fetch theme to local directory
hs cms fetch @hubspot/my-theme ./my-theme

# Fetch with overwrite
hs cms fetch @hubspot/my-theme ./my-theme --overwrite
```

### Fetch Specific Assets

```bash
# Fetch specific template
hs cms fetch @hubspot/my-theme/templates/home.html ./my-theme/templates/home.html

# Fetch specific module
hs cms fetch @hubspot/my-theme/modules/hero ./my-theme/modules/hero
```

## Watch Mode (Development)

### Basic Watch

```bash
# Watch for changes and upload to draft
hs cms watch ./my-theme @hubspot/my-theme --mode=draft
```

### Watch with Initial Upload

```bash
# Upload everything first, then watch
hs cms watch ./my-theme @hubspot/my-theme --mode=draft --initial-upload
```

### Watch Specific Folder

```bash
# Only watch templates folder
hs cms watch ./my-theme/templates @hubspot/my-theme/templates --mode=draft
```

## Theme Configuration

### theme.json Structure

```json
{
  "label": "My Custom Theme",
  "preview_path": "/home",
  "screenshot_path": "./images/template-previews/theme-screenshot.png",
  "enable_domain_stylesheets": false,
  "author": {
    "name": "Company Name",
    "email": "dev@company.com",
    "url": "https://company.com"
  },
  "documentation_url": "https://company.com/docs",
  "license": "MIT",
  "version": "1.0.0"
}
```

### fields.json Structure (Theme Settings)

```json
[
  {
    "id": "brand_colors",
    "name": "brand_colors",
    "label": "Brand Colors",
    "type": "group",
    "children": [
      {
        "id": "primary_color",
        "name": "primary_color",
        "label": "Primary Color",
        "type": "color",
        "default": {
          "color": "#5F3B8C"
        }
      },
      {
        "id": "secondary_color",
        "name": "secondary_color",
        "label": "Secondary Color",
        "type": "color",
        "default": {
          "color": "#E99560"
        }
      }
    ]
  },
  {
    "id": "typography",
    "name": "typography",
    "label": "Typography",
    "type": "group",
    "children": [
      {
        "id": "heading_font",
        "name": "heading_font",
        "label": "Heading Font",
        "type": "font",
        "default": {
          "font": "Montserrat",
          "font_set": "GOOGLE"
        }
      },
      {
        "id": "body_font",
        "name": "body_font",
        "label": "Body Font",
        "type": "font",
        "default": {
          "font": "Figtree",
          "font_set": "GOOGLE"
        }
      }
    ]
  }
]
```

## Template Operations

### Create Template

```bash
# Create page template
hs cms create template page ./my-theme/templates/about.html

# Create section template
hs cms create section ./my-theme/templates/partials/hero-section.html
```

### Template Structure

```html
<!--
  templateType: page
  label: About Page
  isAvailableForNewContent: true
-->
{% extends "./layouts/base.html" %}

{% block body %}
<div class="about-page">
  {% module "hero" path="./modules/hero" %}
  {% module "content" path="@hubspot/rich_text" %}
</div>
{% endblock body %}
```

## Module Operations

### Create Module

```bash
# Create custom module
hs cms create module hero ./my-theme/modules/hero

# This creates:
# modules/hero/
# ├── meta.json    # Module metadata
# ├── fields.json  # Module fields
# └── module.html  # Module template
```

### Module Structure

**meta.json**:
```json
{
  "label": "Hero Banner",
  "content_tags": ["BANNER"],
  "icon": "rocket",
  "smart_type": "NOT_SMART",
  "is_available_for_new_content": true
}
```

**fields.json**:
```json
[
  {
    "name": "heading",
    "label": "Heading",
    "type": "text",
    "default": "Welcome to Our Site"
  },
  {
    "name": "background_image",
    "label": "Background Image",
    "type": "image"
  },
  {
    "name": "cta_button",
    "label": "CTA Button",
    "type": "cta"
  }
]
```

**module.html**:
```html
<section class="hero-banner" style="background-image: url('{{ module.background_image.src }}');">
  <div class="hero-content">
    <h1>{{ module.heading }}</h1>
    {% if module.cta_button %}
      {% module_attribute "cta_button" %}
    {% endif %}
  </div>
</section>
```

## Validation

### Marketplace Validation

```bash
# Validate theme for marketplace requirements
hs cms theme marketplace-validate ./my-theme

# Output includes:
# - Required files check
# - Theme.json validation
# - Accessibility checks
# - Best practice warnings
```

### Lighthouse Performance

```bash
# Run Lighthouse audit on live URL
hs cms lighthouse-score https://example.com

# Specific page
hs cms lighthouse-score https://example.com/about

# Returns:
# - Performance score
# - Accessibility score
# - Best practices score
# - SEO score
```

## Global Content

### Header/Footer Patterns

Global content (header, footer) is managed via:

1. **Global Partials** - Shared HTML includes
2. **Global Groups** - Shared module instances

```html
<!-- In base layout template -->
{% global_partial path="./global/header.html" %}

<main>
  {% block body %}{% endblock %}
</main>

{% global_partial path="./global/footer.html" %}
```

### Updating Global Content via CLI

```bash
# Fetch global partial
hs cms fetch @hubspot/my-theme/global/header.html ./my-theme/global/header.html

# Update locally, then upload
hs cms upload ./my-theme/global/header.html @hubspot/my-theme/global/header.html --mode=draft

# Preview changes before publishing
# Then publish when ready
hs cms upload ./my-theme/global/header.html @hubspot/my-theme/global/header.html --mode=publish
```

## Best Practices

### Version Control Workflow

```bash
# 1. Fetch latest from HubSpot
hs cms fetch @hubspot/my-theme ./my-theme --overwrite

# 2. Create feature branch
git checkout -b feature/new-header

# 3. Make changes locally
# (edit files)

# 4. Upload to draft for testing
hs cms upload ./my-theme @hubspot/my-theme --mode=draft

# 5. Preview and test
# (check in HubSpot preview)

# 6. Commit and merge
git add .
git commit -m "feat: update header design"
git checkout main
git merge feature/new-header

# 7. Publish to live
hs cms upload ./my-theme @hubspot/my-theme --mode=publish
```

### CI/CD Deployment

```yaml
# .github/workflows/deploy-theme.yml
name: Deploy HubSpot Theme

on:
  push:
    branches: [main]
    paths:
      - 'theme/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install HubSpot CLI
        run: npm install -g @hubspot/cli

      - name: Deploy Theme
        env:
          HUBSPOT_ACCOUNT_ID: ${{ secrets.HUBSPOT_ACCOUNT_ID }}
          HUBSPOT_PERSONAL_ACCESS_KEY: ${{ secrets.HUBSPOT_PERSONAL_ACCESS_KEY }}
        run: |
          hs cms upload --use-env ./theme @hubspot/my-theme --mode=publish
```

### Safety Checklist

Before publishing theme changes:

- [ ] Test all templates in preview mode
- [ ] Run marketplace validation
- [ ] Check Lighthouse scores
- [ ] Test on mobile devices
- [ ] Verify global content (header/footer) renders
- [ ] Test all module variations
- [ ] Check for JavaScript errors in console
- [ ] Verify CSS doesn't break existing pages
