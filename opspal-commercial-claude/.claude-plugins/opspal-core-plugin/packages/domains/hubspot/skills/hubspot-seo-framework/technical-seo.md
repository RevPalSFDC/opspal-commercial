# Technical SEO Requirements

## Site Structure

### URL Architecture
```
Best Practice Hierarchy:
domain.com/
├── /blog/
│   ├── /blog/category-name/
│   │   └── /blog/category-name/post-slug
├── /products/
│   └── /products/product-name
├── /services/
│   └── /services/service-name
└── /resources/
    └── /resources/resource-type/resource-name
```

### URL Rules
- Maximum 3-4 levels deep
- Use hyphens, not underscores
- Lowercase only
- No special characters
- No session IDs or tracking params in canonical
- Keep under 75 characters when possible

## XML Sitemap

### Requirements
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/page</loc>
    <lastmod>2024-01-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

### Priority Guidelines
| Page Type | Priority | Change Frequency |
|-----------|----------|------------------|
| Homepage | 1.0 | weekly |
| Category pages | 0.8 | weekly |
| Blog posts | 0.6 | monthly |
| Product pages | 0.8 | weekly |
| Static pages | 0.5 | monthly |

### Sitemap Best Practices
- Max 50,000 URLs per sitemap
- Max 50MB uncompressed
- Submit to Google Search Console
- Keep updated automatically
- Exclude noindex pages

## Robots.txt

### Standard Template
```
User-agent: *
Allow: /
Disallow: /private/
Disallow: /admin/
Disallow: /search
Disallow: /*?*utm_
Disallow: /*?*ref=

Sitemap: https://example.com/sitemap.xml
```

### HubSpot-Specific Rules
```
# Block HubSpot system pages
Disallow: /hs/
Disallow: /_hcms/
Disallow: /cs/
Disallow: /hubfs/preview/

# Block form submission confirmations
Disallow: /*submitted=true

# Block filtered views
Disallow: /*topic=*
```

## Page Speed Optimization

### Core Web Vitals Targets
| Metric | Good | Description |
|--------|------|-------------|
| LCP | < 2.5s | Largest contentful paint |
| FID | < 100ms | First input delay |
| CLS | < 0.1 | Cumulative layout shift |
| TTFB | < 600ms | Time to first byte |
| FCP | < 1.8s | First contentful paint |

### Speed Optimization Checklist
```
Image Optimization:
[ ] Convert to WebP format
[ ] Compress images < 200KB
[ ] Implement lazy loading
[ ] Use responsive images (srcset)
[ ] Specify width/height attributes

Code Optimization:
[ ] Minify CSS and JavaScript
[ ] Defer non-critical JS
[ ] Inline critical CSS
[ ] Remove unused CSS
[ ] Enable compression (gzip/brotli)

Caching:
[ ] Browser caching headers
[ ] CDN caching
[ ] Cache static resources (1 year)
[ ] Cache HTML appropriately

Server:
[ ] HTTP/2 or HTTP/3
[ ] TTFB < 600ms
[ ] SSL/TLS optimized
```

## Mobile Optimization

### Mobile-First Requirements
```
Viewport Meta Tag:
<meta name="viewport" content="width=device-width, initial-scale=1">

Font Sizes:
- Body text: 16px minimum
- Line height: 1.5 minimum
- Paragraph spacing: 1em minimum

Touch Targets:
- Minimum 48x48 CSS pixels
- 8px minimum spacing between targets

Layout:
- No horizontal scrolling
- Content width adapts to screen
- Images scale responsively
```

### Mobile Testing Checklist
- [ ] Google Mobile-Friendly Test passes
- [ ] Text readable without zooming
- [ ] Tap targets appropriately sized
- [ ] No horizontal scroll
- [ ] Fast loading on 3G

## HTTPS/Security

### SSL Requirements
```
- Valid SSL certificate
- All pages served over HTTPS
- HTTP → HTTPS redirects (301)
- HSTS header enabled
- Mixed content eliminated
```

### Security Headers
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: [appropriate policy]
```

## Structured Data

### Required Schema Types
| Page Type | Schema | Testing Tool |
|-----------|--------|--------------|
| Organization | Organization | Schema Validator |
| Blog | Article, BlogPosting | Rich Results Test |
| Product | Product | Rich Results Test |
| FAQ | FAQPage | Rich Results Test |
| How-to | HowTo | Rich Results Test |
| Local | LocalBusiness | Rich Results Test |

### Validation Process
1. Implement schema markup
2. Test with Schema Markup Validator
3. Test with Google Rich Results Test
4. Monitor in Search Console
5. Fix any errors/warnings

## Crawl Management

### Internal Linking Structure
```
Goal: Every page reachable within 3 clicks from homepage

Hierarchy:
Homepage (Level 0)
├── Main Nav (Level 1)
│   ├── Category Pages (Level 2)
│   │   └── Content Pages (Level 3)
```

### Crawl Budget Optimization
- Remove duplicate content
- Fix broken links (404s)
- Reduce redirect chains
- Block low-value pages
- Update sitemap regularly
- Submit important pages manually

## Internationalization (if applicable)

### hreflang Implementation
```html
<link rel="alternate" hreflang="en-us" href="https://example.com/page">
<link rel="alternate" hreflang="en-gb" href="https://example.co.uk/page">
<link rel="alternate" hreflang="es" href="https://example.es/page">
<link rel="alternate" hreflang="x-default" href="https://example.com/page">
```

### Language/Region Rules
- Use ISO 639-1 language codes
- Use ISO 3166-1 Alpha 2 country codes
- Include x-default for fallback
- Ensure bidirectional linking
- Consistent across all pages
