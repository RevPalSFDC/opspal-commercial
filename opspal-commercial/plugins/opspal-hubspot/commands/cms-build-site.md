---
name: cms-build-site
description: Guided website build process for HubSpot CMS with theme selection, page creation, forms, CTAs, and workflows
argument-hint: "[options]"
arguments:
  - name: type
    description: "Build type: 'new' for new site or 'update' for redesign"
    required: true
  - name: template
    description: "Site template: corporate, ecommerce, saas, blog, or custom"
    required: false
    default: corporate
  - name: governed
    description: "Enable approval workflows for content publishing"
    required: false
    default: "false"
invocations:
  - /cms-build-site --type new --template corporate
  - /cms-build-site --type update --governed true
  - /cms-build-site --type new --template saas --governed true
---

# CMS Build Site Command

Interactive wizard for building or redesigning a HubSpot CMS website.

## Overview

This command guides you through the complete website build process:
1. Prerequisites validation
2. Theme selection and configuration
3. Page structure creation
4. Form setup
5. CTA configuration
6. Workflow automation
7. SEO optimization
8. Publishing preparation

## Prerequisites Check

Before starting, I'll verify:

### Required
- [ ] HubSpot CMS Hub access (Professional or Enterprise)
- [ ] HubSpot CLI installed (`npm install -g @hubspot/cli`)
- [ ] CLI authenticated (`hs auth`)

### Recommended
- [ ] Brand guidelines document
- [ ] Content inventory/sitemap
- [ ] Image assets prepared

## Build Type: {{ type }}

{% if type == "new" %}

### New Site Build

Starting fresh with a new HubSpot CMS website.

**Process:**
1. Connect domain (or use temporary HubSpot domain)
2. Select and configure theme
3. Build all pages from scratch
4. Set up forms, CTAs, and workflows
5. Configure SEO
6. Launch when ready

{% elif type == "update" %}

### Site Redesign/Update

Updating an existing HubSpot CMS website.

**Process:**
1. Audit existing pages and content
2. Select approach: keep, modify, or replace theme
3. Use Content Staging for safe redesign
4. Migrate/update content
5. Set up redirects for URL changes
6. Replace live pages when approved

{% endif %}

## Site Template: {{ template }}

{% if template == "corporate" %}

### Corporate Template

Standard business website structure:

| Page | URL | Template |
|------|-----|----------|
| Home | / | home.html |
| About | /about | about.html |
| Services | /services | services.html |
| Team | /team | team.html |
| Contact | /contact | contact.html |
| Blog | /blog | blog-listing.html |
| Privacy | /privacy | legal.html |
| Terms | /terms | legal.html |

**Forms:**
- Contact Us
- Newsletter Signup

**CTAs:**
- Header: "Contact Us"
- Homepage Hero: "Learn More"

{% elif template == "saas" %}

### SaaS Template

Software/product-focused structure:

| Page | URL | Template |
|------|-----|----------|
| Home | / | home.html |
| Product | /product | product.html |
| Features | /features | features.html |
| Pricing | /pricing | pricing.html |
| Demo | /demo | demo.html |
| Docs | /docs | docs.html |
| Blog | /blog | blog-listing.html |
| Contact | /contact | contact.html |

**Forms:**
- Demo Request
- Newsletter Signup
- Contact/Support

**CTAs:**
- Header: "Get a Demo"
- Homepage Hero: "Start Free Trial"
- Pricing: "Get Started"

{% elif template == "ecommerce" %}

### E-commerce Template

Product catalog focused structure:

| Page | URL | Template |
|------|-----|----------|
| Home | / | home.html |
| Shop | /shop | catalog.html |
| Categories | /shop/[category] | category.html |
| Products | /shop/[product] | product.html |
| Cart | /cart | cart.html |
| About | /about | about.html |
| Contact | /contact | contact.html |
| Blog | /blog | blog-listing.html |

**Forms:**
- Contact Us
- Newsletter (with discount offer)

**CTAs:**
- Header: "Shop Now"
- Product Pages: "Add to Cart"

{% elif template == "blog" %}

### Blog/Content Template

Content-focused structure:

| Page | URL | Template |
|------|-----|----------|
| Home | / | home.html |
| Blog | /blog | blog-listing.html |
| Categories | /blog/category/[cat] | category.html |
| About | /about | about.html |
| Contact | /contact | contact.html |
| Resources | /resources | resources.html |

**Forms:**
- Newsletter Signup
- Contact Us

**CTAs:**
- Header: "Subscribe"
- Post Footer: "Subscribe to Newsletter"

{% endif %}

## Governance Mode: {{ governed }}

{% if governed == "true" %}

### Governed Mode (Approvals Enabled)

All content will require approval before publishing:

1. **Content Creation**: Draft state only
2. **Review Process**: Submit for approval
3. **Approval Chain**: Designated approvers review
4. **Publishing**: Only after approval

**Setup Required:**
- Configure user roles (Author, Editor, Approver)
- Enable content approval in HubSpot settings
- Define approval workflows

{% else %}

### Standard Mode (Direct Publishing)

Content can be published immediately:

1. **Content Creation**: Draft or publish
2. **Review Process**: Optional internal review
3. **Publishing**: Direct publish when ready

{% endif %}

## Build Steps

### Step 1: Theme Setup

**Agent: `hubspot-cms-theme-manager`**

I'll help you:
1. Select a base theme (default or marketplace)
2. Create child theme if customizing
3. Configure brand colors and typography
4. Set up global header/footer

```bash
# Create child theme
hs cms create website-theme my-company-theme

# Or fetch existing
hs cms fetch @hubspot/default-theme ./my-theme
```

**What are your brand colors?**
- Primary color: _______
- Secondary color: _______
- Accent color: _______

**What fonts should we use?**
- Heading font: _______
- Body font: _______

### Step 2: Page Creation

**Agent: `hubspot-cms-page-publisher`**

Based on your template, I'll create these pages:

[Pages listed based on template]

For each page:
- Select appropriate template
- Add content modules
- Configure SEO (title, description)
- Set URL slug

**Do you have content ready for:**
- [ ] Homepage copy
- [ ] About page copy
- [ ] Product/service descriptions
- [ ] Contact information

### Step 3: Blog Setup

**Agent: `hubspot-cms-content-manager`**

I'll configure your blog:
1. Set blog URL (/blog)
2. Configure blog templates
3. Add authors
4. Create categories/tags
5. Set up subscription

**Blog configuration:**
- Blog name: _______
- Authors to add: _______
- Initial categories: _______

### Step 4: Form Creation

**Agent: `hubspot-cms-form-manager`**

Based on your template, I'll create:

[Forms listed based on template]

For each form:
- Configure fields
- Set follow-up action (thank you message/redirect)
- Configure email notifications
- Set GDPR consent (if required)

### Step 5: CTA Setup

**Agent: `hubspot-cms-cta-manager`**

Based on your template, I'll create:

[CTAs listed based on template]

For each CTA:
- Set button text
- Apply brand styling
- Configure destination
- Enable tracking

### Step 6: Workflow Automation

**Agent: `hubspot-workflow-builder`**

I'll create these workflows:

1. **Contact Form → Notification**
   - Trigger: Contact form submission
   - Actions: Notify team, set lifecycle stage

2. **Demo Request → Sales Assignment**
   - Trigger: Demo form submission
   - Actions: Assign to sales, send follow-up

3. **Newsletter → Welcome**
   - Trigger: Newsletter signup
   - Actions: Send welcome email

### Step 7: SEO Configuration

**Agent: `hubspot-seo-optimizer`**

For all pages:
- Verify page titles (unique, 50-60 chars)
- Verify meta descriptions (unique, 150-160 chars)
- Check header structure (single H1)
- Validate image alt text
- Run SEO scan

### Step 8: Final Review

Before launching, I'll verify:

- [ ] All pages created and content added
- [ ] All forms working (test submissions)
- [ ] All CTAs linked correctly
- [ ] All workflows activated
- [ ] SEO scores acceptable (60+ for each page)
- [ ] Mobile responsiveness verified
- [ ] Analytics tracking confirmed

## Ready to Start?

To begin the build process, confirm:

1. Build type: **{{ type }}**
2. Template: **{{ template }}**
3. Governance: **{{ governed }}**

I'll guide you through each step, using the specialized agents for each task.

## Related Commands

- `/cms-launch-site` - Pre-launch checklist and go-live
- `/cms-audit-pages` - Audit existing pages
- `/seo-audit` - Full SEO audit

## Runbook Reference

See `docs/runbooks/cms/01-website-build.md` for detailed procedures.
