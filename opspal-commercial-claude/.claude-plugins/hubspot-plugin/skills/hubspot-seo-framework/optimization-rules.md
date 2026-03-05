# SEO Optimization Rules

## On-Page SEO Rules

### Title Tag Optimization
```
Rule: Primary keyword within first 60 characters
Format: [Primary Keyword] - [Secondary Context] | [Brand]
Length: 50-60 characters optimal

Examples:
✅ "HubSpot CRM Setup Guide - Complete Tutorial | RevPal"
❌ "The Ultimate Complete Comprehensive Guide to Setting Up HubSpot CRM"
```

### Meta Description
```
Rule: Include keyword + clear value proposition + CTA
Length: 150-160 characters
Format: [What] + [Benefit] + [CTA]

Examples:
✅ "Learn HubSpot CRM setup in 30 minutes. Step-by-step guide with screenshots. Get started free today."
❌ "This article talks about HubSpot and how you can use it for your business needs."
```

### URL Structure
```
Rules:
- Include primary keyword
- Use hyphens (not underscores)
- Keep under 60 characters
- Avoid stop words when possible

✅ /hubspot-crm-setup-guide
❌ /the-ultimate-guide-to-setting-up-your-hubspot-crm-system-2024
```

### Header Hierarchy
```
H1: One per page, includes primary keyword
H2: Main sections (3-7 per article)
H3: Subsections within H2s
H4+: Use sparingly for detailed breakdowns

Structure:
H1: Primary Keyword + Topic
  H2: Major Subtopic 1
    H3: Detail A
    H3: Detail B
  H2: Major Subtopic 2
```

### Keyword Density
```
Target: 1-2% for primary keyword
Pattern:
- First 100 words: Include primary keyword
- Every 200-300 words: Natural mention
- Variations: Use synonyms and related terms
- Avoid: Keyword stuffing (>3%)
```

## Content Structure Rules

### Optimal Content Length by Type
| Content Type | Minimum | Optimal | Maximum |
|--------------|---------|---------|---------|
| Blog Post | 800 | 1,500-2,500 | 5,000 |
| Landing Page | 300 | 500-1,000 | 2,000 |
| Pillar Page | 2,000 | 3,000-5,000 | 10,000 |
| Product Page | 300 | 500-800 | 1,500 |

### Paragraph Rules
```
- 2-4 sentences per paragraph
- One idea per paragraph
- Use transition words between paragraphs
- Break up long sections with subheads
```

### Internal Linking
```
Rules:
- 3-5 internal links per 1,000 words
- Link to related pillar/cluster content
- Use descriptive anchor text (not "click here")
- Link early in content when relevant
- Update old content to link to new

Anchor Text Examples:
✅ "Learn more about HubSpot workflow automation"
❌ "Click here to learn more"
```

## Image Optimization

### Alt Text Rules
```
Format: [Descriptive text of image content]
Include: Keyword if naturally relevant
Length: 125 characters or less
Avoid: "Image of..." or "Picture of..."

✅ alt="HubSpot CRM dashboard showing deal pipeline stages"
❌ alt="image1.jpg"
❌ alt="screenshot"
```

### Image File Naming
```
Format: keyword-descriptive-name.jpg
✅ hubspot-crm-dashboard-pipeline.jpg
❌ IMG_20240115.jpg
❌ screenshot-1.png
```

### Image Sizing
```
Max file size: 200KB for web images
Formats: WebP preferred, then JPEG, then PNG
Dimensions: 1200px max width for blog images
Lazy loading: Enable for below-fold images
```

## Schema Markup

### Required Schema Types
| Page Type | Schema | Purpose |
|-----------|--------|---------|
| Blog Post | Article | Rich snippets |
| Product | Product | Shopping results |
| FAQ | FAQPage | FAQ rich results |
| How-to | HowTo | Step snippets |
| Review | Review | Star ratings |

### Article Schema Example
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "HubSpot CRM Setup Guide",
  "description": "Complete guide to setting up HubSpot CRM",
  "author": {
    "@type": "Organization",
    "name": "RevPal"
  },
  "datePublished": "2024-01-15",
  "dateModified": "2024-01-20"
}
```

## Mobile Optimization

### Core Web Vitals Targets
| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP | < 2.5s | 2.5-4s | > 4s |
| FID | < 100ms | 100-300ms | > 300ms |
| CLS | < 0.1 | 0.1-0.25 | > 0.25 |

### Mobile Rules
```
- Responsive design required
- Text readable without zooming (16px minimum)
- Buttons/links have adequate tap targets (48x48px)
- No horizontal scrolling
- Fast loading on 3G networks
```
