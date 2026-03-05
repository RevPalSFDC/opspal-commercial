# Meta Tag Patterns

## Title Tag Templates

### Blog Posts
```
[How to/Guide/Tutorial] Template:
"How to [Action] [Topic] in [Year] | [Brand]"
Example: "How to Set Up HubSpot CRM in 2024 | RevPal"

[List] Template:
"[Number] [Adjective] [Topic] [Benefit] | [Brand]"
Example: "10 Best HubSpot Integrations for Sales Teams | RevPal"

[Comparison] Template:
"[Product A] vs [Product B]: [Year] [Comparison Type] | [Brand]"
Example: "HubSpot vs Salesforce: 2024 CRM Comparison | RevPal"

[Question] Template:
"[Question]? [Answer Preview] | [Brand]"
Example: "Is HubSpot Free? Pricing Guide for 2024 | RevPal"
```

### Landing Pages
```
[Service] Template:
"[Service Name] - [Primary Benefit] | [Brand]"
Example: "HubSpot Implementation - Get Started in 48 Hours | RevPal"

[Product] Template:
"[Product Name]: [Key Feature] + [Benefit] | [Brand]"
Example: "RevOps Platform: Unified Sales & Marketing Data | RevPal"

[Lead Magnet] Template:
"Free [Resource Type]: [Topic] [Benefit] | [Brand]"
Example: "Free Template: HubSpot Migration Checklist | RevPal"
```

### Product Pages
```
[Product] Template:
"Buy [Product] - [Key Benefit] | [Brand]"
"[Product Name] | [Category] | [Brand]"

Examples:
"HubSpot Sales Hub - Close Deals Faster | RevPal"
"Marketing Automation Setup | HubSpot Services | RevPal"
```

## Meta Description Templates

### Blog Posts
```
[How-to] Template:
"Learn [action] with our step-by-step guide. [Specific benefit]. [Time to complete]. Get started now."
Example: "Learn HubSpot CRM setup with our step-by-step guide. Configure pipelines, properties, and automation in under 2 hours. Get started now."

[List] Template:
"Discover [number] [topic] that [benefit]. Includes [specific items]. Updated for [year]."
Example: "Discover 15 HubSpot integrations that boost sales productivity. Includes Slack, LinkedIn, and Zoom. Updated for 2024."

[Comparison] Template:
"[Product A] vs [Product B]: See the [year] comparison of [key factors]. Find which [solution type] fits your needs."
Example: "HubSpot vs Salesforce: See the 2024 comparison of pricing, features, and ease of use. Find which CRM fits your needs."
```

### Landing Pages
```
[Service] Template:
"[Service benefit statement]. [Proof point]. [CTA with specificity]."
Example: "Get HubSpot implemented correctly the first time. 500+ successful implementations. Book your free strategy call today."

[Lead Magnet] Template:
"Download our free [resource]. [What's included]. [Outcome benefit]. No signup required."
Example: "Download our free HubSpot migration checklist. 50-point validation list included. Prevent data loss. No signup required."
```

## Open Graph Tags

### Standard OG Template
```html
<meta property="og:title" content="[Title - shorter than title tag]">
<meta property="og:description" content="[Description optimized for social]">
<meta property="og:image" content="[1200x630 image URL]">
<meta property="og:url" content="[Canonical URL]">
<meta property="og:type" content="[article/website/product]">
<meta property="og:site_name" content="[Brand Name]">
```

### Image Requirements
| Platform | Size | Ratio |
|----------|------|-------|
| Facebook/LinkedIn | 1200x630 | 1.91:1 |
| Twitter | 1200x600 | 2:1 |
| Pinterest | 1000x1500 | 2:3 |

## Twitter Card Tags

### Summary Large Image
```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@username">
<meta name="twitter:title" content="[Title - 70 chars max]">
<meta name="twitter:description" content="[Description - 200 chars max]">
<meta name="twitter:image" content="[Image URL]">
```

## Canonical Tags

### Rules
```html
<!-- Self-referencing canonical (default) -->
<link rel="canonical" href="https://example.com/current-page">

<!-- Cross-domain canonical (syndicated content) -->
<link rel="canonical" href="https://original-source.com/original-page">

<!-- Pagination canonical -->
<link rel="canonical" href="https://example.com/category"> <!-- All pages point to main -->
```

### When to Use
| Scenario | Canonical Points To |
|----------|---------------------|
| Single page | Self |
| Paginated series | First page or self |
| Parameter variations | Base URL without params |
| HTTP/HTTPS | HTTPS version |
| www/non-www | Preferred version |
| Duplicate content | Original page |

## Robots Meta Tags

### Common Configurations
```html
<!-- Index and follow (default) -->
<meta name="robots" content="index, follow">

<!-- Don't index, but follow links -->
<meta name="robots" content="noindex, follow">

<!-- Index, but don't follow links -->
<meta name="robots" content="index, nofollow">

<!-- Don't index or follow -->
<meta name="robots" content="noindex, nofollow">

<!-- Don't show in search snippets -->
<meta name="robots" content="nosnippet">

<!-- Don't cache -->
<meta name="robots" content="noarchive">
```

### When to Use noindex
- Thank you pages
- Duplicate content pages
- Internal search results
- Tag/category archives (sometimes)
- Staging/test environments
- User account pages
