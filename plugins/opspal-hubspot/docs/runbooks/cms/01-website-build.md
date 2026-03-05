# HubSpot CMS Website Build Runbook

Complete operational guide for building and managing a full website on HubSpot CMS, including marketing pages, product pages, support section, and blog.

## Overview

This runbook provides step-by-step instructions for:
- Building a new website from scratch
- Updating/redesigning an existing site
- Integrating forms, CTAs, workflows, and reporting
- Managing both governed (approval-based) and non-governed content workflows

## Prerequisites

### Required Access

| Requirement | Details |
|-------------|---------|
| HubSpot CMS Hub | Professional or Enterprise |
| Domain | Connected to HubSpot or ready to connect |
| HubSpot CLI | Installed: `npm install -g @hubspot/cli` |
| Authentication | `hs auth` completed or env vars set |

### Brand Guidelines Ready

- [ ] Brand colors (primary, secondary, accent)
- [ ] Typography (heading font, body font)
- [ ] Logo files (SVG, PNG)
- [ ] Tone of voice guidelines
- [ ] Image style guidelines

### Content Inventory

For **new site**:
- [ ] Sitemap or page list defined
- [ ] Content copy prepared or outlined
- [ ] Images/media assets ready

For **existing site update**:
- [ ] Current page audit complete
- [ ] URLs to preserve identified
- [ ] Content to reuse vs deprecate decided

### Team & Roles

- [ ] Content creators identified
- [ ] Approvers identified (if governed)
- [ ] Publisher roles assigned in HubSpot

---

## Decision: New Site vs. Existing Site Update

| Aspect | New Site Build | Existing Site Update |
|--------|----------------|----------------------|
| **Initial Setup** | Connect domain, set up DNS, establish theme | Verify domain, audit existing pages/theme |
| **Theme Selection** | Choose base theme, build from scratch | Keep, clone/child, or replace theme |
| **Content** | Create all content fresh | Preserve/migrate existing content |
| **URL Strategy** | Define new URL structure | Plan redirects for URL changes |
| **Publishing** | Launch all at once | Use Content Staging for safe redesign |
| **Governance** | Set up approval workflows from start | Apply approval to existing content edits |

---

## Phase 1: Theme Selection & Configuration

### Agent: `hubspot-cms-theme-manager`

### Step 1.1: Choose a Theme

```bash
# Option A: Use default HubSpot theme
# Navigate to Website Pages > Create > Select theme

# Option B: Download from marketplace
# HubSpot Marketplace > Themes > Download

# Option C: Create custom theme
hs cms create website-theme my-company-theme
```

### Step 1.2: Activate Theme

1. Go to **Settings > Website > Themes**
2. Select the theme
3. Click **Set as active theme**

### Step 1.3: Create Child Theme (Optional)

For marketplace themes you want to customize:

1. In Design Manager, right-click parent theme
2. Select **Create child theme**
3. Fetch locally:
```bash
hs cms fetch @hubspot/my-child-theme ./my-child-theme
```

### Step 1.4: Configure Theme Settings

Update `fields.json` with brand settings:

```json
{
  "brand_colors": {
    "primary": "#5F3B8C",
    "secondary": "#E99560",
    "background": "#EAE4DC"
  },
  "typography": {
    "heading_font": "Montserrat",
    "body_font": "Figtree"
  }
}
```

Upload to draft:
```bash
hs cms upload ./my-theme @hubspot/my-theme --mode=draft
```

### Step 1.5: Configure Global Content

Edit header and footer:

```bash
# Fetch global content
hs cms fetch @hubspot/my-theme/global/header.html ./my-theme/global/header.html
hs cms fetch @hubspot/my-theme/global/footer.html ./my-theme/global/footer.html

# Edit locally with:
# - Company logo
# - Navigation menu
# - Social media links
# - Footer text (copyright, contact)

# Upload
hs cms upload ./my-theme/global/ @hubspot/my-theme/global/ --mode=draft
```

### Step 1.6: Create Navigation Menu

1. Go to **Settings > Website > Navigation**
2. Create menu with main sections:
   - Home
   - Product(s)
   - About
   - Blog
   - Support/Contact

---

## Phase 2: Build Site Structure & Pages

### Agent: `hubspot-cms-page-publisher`

### Step 2.1: Homepage

```javascript
// Create homepage via API
const homepage = {
  name: "Home",
  slug: "",  // Root URL
  language: "en",
  templatePath: "my-theme/templates/home.html",
  widgets: {
    hero: {
      headline: "Welcome to Company",
      subheadline: "Your success starts here",
      cta_text: "Get Started",
      cta_url: "/contact"
    },
    value_props: {
      // Value proposition content
    },
    testimonials: {
      // Testimonial content
    }
  },
  metaDescription: "Company homepage - Your success starts here",
  htmlTitle: "Home | Company Name"
};
```

**Checklist:**
- [ ] Hero section with headline, subtext, CTA
- [ ] Value propositions section
- [ ] Product/service highlights
- [ ] Testimonials or social proof
- [ ] Blog highlights (optional)
- [ ] SEO: Title, meta description, alt text

### Step 2.2: About Page

```javascript
const aboutPage = {
  name: "About Us",
  slug: "about",
  templatePath: "my-theme/templates/about.html",
  widgets: {
    hero: { headline: "About Company" },
    mission: { /* Mission content */ },
    team: { /* Team members */ },
    history: { /* Company history */ }
  },
  metaDescription: "Learn about Company - our mission, team, and story",
  htmlTitle: "About Us | Company Name"
};
```

### Step 2.3: Product/Service Pages

For each product or service:

```javascript
const productPage = {
  name: "Product Name",
  slug: "products/product-name",
  templatePath: "my-theme/templates/product.html",
  widgets: {
    hero: { headline: "Product Name" },
    features: { /* Feature list */ },
    screenshots: { /* Product images */ },
    pricing: { /* Pricing info */ },
    cta: {
      text: "Request Demo",
      url: "/demo"
    }
  },
  metaDescription: "Product Name - Key benefit in 155 characters",
  htmlTitle: "Product Name | Company Name"
};
```

**For multiple products:**
- Create dropdown in navigation
- Use consistent template across product pages
- Clone pages for efficiency, swap content

### Step 2.4: Support/Contact Page

```javascript
const contactPage = {
  name: "Contact Us",
  slug: "contact",
  templatePath: "my-theme/templates/contact.html",
  widgets: {
    hero: { headline: "Get in Touch" },
    contact_info: {
      email: "support@company.com",
      phone: "(555) 123-4567"
    },
    form_module: {
      form_id: "CONTACT_FORM_GUID"  // From Form Manager
    }
  },
  metaDescription: "Contact Company - reach out for support or inquiries",
  htmlTitle: "Contact Us | Company Name"
};
```

### Step 2.5: Additional Marketing Pages

Create as needed:
- Pricing (`/pricing`)
- Features (`/features`)
- FAQ (`/faq`)
- Case Studies (`/case-studies`)
- Privacy Policy (`/privacy`)
- Terms of Service (`/terms`)

---

## Phase 3: Blog Setup

### Agent: `hubspot-cms-content-manager`

### Step 3.1: Configure Blog

1. Go to **Content > Blog**
2. Create blog or verify existing
3. Set blog name (e.g., "Company Blog")

### Step 3.2: Configure Blog Settings

**Settings > Content > Blog:**

| Setting | Value |
|---------|-------|
| Root URL | `/blog` |
| Blog listing template | Theme blog listing |
| Blog post template | Theme blog post |
| Authors | Add team members |
| Comments | Enable/disable |
| Subscriptions | Enable email notifications |

### Step 3.3: Create Blog Tags/Categories

Organize content with tags:
- Product Updates
- Industry Insights
- How-To Guides
- Company News
- Customer Stories

### Step 3.4: Create Sample Post

```javascript
const samplePost = {
  name: "Welcome to Our Blog",
  slug: "welcome-to-our-blog",
  blogAuthorId: "AUTHOR_ID",
  contentGroupId: "BLOG_ID",
  postBody: "<p>Welcome content...</p>",
  metaDescription: "Welcome to the Company blog...",
  featuredImage: "https://cdn.../welcome-image.jpg",
  tags: ["Company News"]
};
```

### Step 3.5: Link Blog in Navigation

Add "Blog" to main navigation menu.

---

## Phase 4: Form Integration

### Agent: `hubspot-cms-form-manager`

### Step 4.1: Create Forms

| Form | Purpose | Key Fields |
|------|---------|------------|
| Contact Us | General inquiries | Name, Email, Phone, Message |
| Newsletter Signup | Email subscribers | Email, First Name |
| Demo Request | Sales leads | Name, Email, Company, Job Title, Size |
| Support Request | Support tickets | Email, Category, Subject, Description |

### Step 4.2: Configure Form Settings

For each form:
- [ ] Post-submit action (thank you message or redirect)
- [ ] Email notifications to team
- [ ] Lifecycle stage assignment
- [ ] GDPR consent (if applicable)

### Step 4.3: Embed Forms on Pages

Update pages with form modules:

```javascript
// Contact page
pageUpdate = {
  widgets: {
    form_module: {
      form_id: "CONTACT_FORM_GUID"
    }
  }
};

// Newsletter (footer or sidebar)
globalUpdate = {
  newsletter_form: {
    form_id: "NEWSLETTER_FORM_GUID"
  }
};

// Product pages
pageUpdate = {
  demo_form: {
    form_id: "DEMO_FORM_GUID"
  }
};
```

### Step 4.4: Test Forms

- [ ] Submit test entry
- [ ] Verify contact created in CRM
- [ ] Verify email notification received
- [ ] Verify thank you message/redirect
- [ ] Test on mobile

---

## Phase 5: CTA Setup

### Agent: `hubspot-cms-cta-manager`

### Step 5.1: Identify CTA Placements

| Location | CTA Text | Destination |
|----------|----------|-------------|
| Header (nav) | "Get a Demo" | /demo |
| Homepage hero | "Get Started" | /contact |
| Product pages | "Request Demo" | /demo |
| Blog posts | "Subscribe" | Newsletter signup |
| Footer | "Contact Us" | /contact |

### Step 5.2: Create CTAs

Use Playwright automation via `hubspot-cms-cta-manager`:
1. Navigate to Marketing > Lead Capture > CTAs
2. Create Button CTA
3. Configure styling (brand colors)
4. Set destination URL

### Step 5.3: Embed CTAs

In theme modules or page widgets:

```html
<!-- HubL -->
{% cta guid="CTA_GUID" %}

<!-- Or module -->
{% module "cta_button"
    path="@hubspot/cta"
    cta_id="CTA_GUID"
%}
```

### Step 5.4: Track CTA Performance

CTAs automatically track clicks. View in:
- Marketing > Lead Capture > CTAs > Analytics

---

## Phase 6: Workflow Automation

### Agent: `hubspot-workflow-builder`

### Step 6.1: Contact Form Workflow

```javascript
const contactWorkflow = {
  name: "Contact Form - Notification",
  type: "CONTACT_BASED",
  trigger: {
    type: "FORM_SUBMISSION",
    formId: "CONTACT_FORM_GUID"
  },
  actions: [
    {
      type: "SEND_INTERNAL_EMAIL",
      to: "support@company.com",
      subject: "New Contact Form Submission"
    },
    {
      type: "SET_PROPERTY",
      propertyName: "lifecyclestage",
      value: "lead"
    }
  ]
};
```

### Step 6.2: Demo Request Workflow

```javascript
const demoWorkflow = {
  name: "Demo Request - Sales Assignment",
  type: "CONTACT_BASED",
  trigger: {
    type: "FORM_SUBMISSION",
    formId: "DEMO_FORM_GUID"
  },
  actions: [
    {
      type: "SET_PROPERTY",
      propertyName: "lifecyclestage",
      value: "marketingqualifiedlead"
    },
    {
      type: "ROTATE_OWNER",
      userIds: ["sales_rep_1", "sales_rep_2"]
    },
    {
      type: "SEND_EMAIL",
      templateId: "FOLLOW_UP_EMAIL_TEMPLATE"
    },
    {
      type: "CREATE_TASK",
      taskType: "CALL",
      subject: "Follow up with demo request",
      daysFromNow: 1
    }
  ]
};
```

### Step 6.3: Newsletter Workflow

```javascript
const newsletterWorkflow = {
  name: "Newsletter Signup - Welcome",
  type: "CONTACT_BASED",
  trigger: {
    type: "FORM_SUBMISSION",
    formId: "NEWSLETTER_FORM_GUID"
  },
  actions: [
    {
      type: "SET_PROPERTY",
      propertyName: "lifecyclestage",
      value: "subscriber"
    },
    {
      type: "SEND_EMAIL",
      templateId: "WELCOME_EMAIL_TEMPLATE"
    }
  ]
};
```

### Step 6.4: Support Ticket Workflow

```javascript
const supportWorkflow = {
  name: "Support Form - Ticket Creation",
  type: "CONTACT_BASED",
  trigger: {
    type: "FORM_SUBMISSION",
    formId: "SUPPORT_FORM_GUID"
  },
  actions: [
    {
      type: "CREATE_TICKET",
      subject: "{{contact.ticket_subject}}",
      content: "{{contact.ticket_description}}",
      pipeline: "SUPPORT_PIPELINE",
      status: "NEW"
    },
    {
      type: "SEND_EMAIL",
      templateId: "TICKET_CONFIRMATION"
    }
  ]
};
```

---

## Phase 7: Analytics & Reporting

### Agent: `hubspot-analytics-reporter`

### Step 7.1: Verify Tracking

HubSpot tracking is automatic on CMS pages. Verify:
1. Check page source for HubSpot script
2. Visit page and check **Reports > Analytics Tools > Traffic Analytics**

### Step 7.2: Google Analytics (Optional)

Add GA tracking ID:
1. **Settings > Website > Pages > Analytics**
2. Enter Google Analytics Tracking ID
3. Or add GTM container to Head HTML

### Step 7.3: Create Dashboard

Create "Website Performance" dashboard:

| Report | Metrics |
|--------|---------|
| Traffic Over Time | Sessions, pageviews |
| Traffic by Source | Organic, direct, referral, paid |
| Top Pages | Most viewed pages |
| Form Submissions | Submissions by form |
| Conversions | Contacts created |
| CTA Performance | Clicks, click rate |

---

## Phase 8: SEO Optimization

### Agent: `hubspot-seo-optimizer`

### Step 8.1: Pre-Publish SEO Checklist

For each page:

| Element | Requirement |
|---------|-------------|
| Page Title | Unique, 50-60 chars, includes keyword |
| Meta Description | Unique, 150-160 chars, includes keyword |
| H1 | Single H1 per page, matches topic |
| Headers | Proper hierarchy (H2, H3) |
| Images | Optimized size, alt text |
| Internal Links | Link to related pages |
| URL | Clean, includes keyword, no special chars |

### Step 8.2: Run SEO Scan

Use HubSpot's SEO tool:
1. **Marketing > Planning > SEO**
2. Run scan for issues
3. Address all errors and warnings

### Step 8.3: XML Sitemap

1. **Settings > Website > Domains & URLs**
2. Verify sitemap enabled
3. Submit to Google Search Console
4. Submit to Bing Webmaster Tools

### Step 8.4: Performance Optimization

```bash
# Run Lighthouse audit
hs cms lighthouse-score https://your-site.com

# Target scores:
# - Performance: 80+
# - Accessibility: 90+
# - Best Practices: 90+
# - SEO: 90+
```

---

## Phase 9: Publishing & Launch

### Step 9.1: Final Review

- [ ] All pages reviewed for content accuracy
- [ ] All forms tested and working
- [ ] All workflows activated
- [ ] All CTAs linked correctly
- [ ] All images optimized
- [ ] Mobile responsiveness verified
- [ ] SEO checklist complete

### Step 9.2: Governance Check (if applicable)

For governed workflow:
- [ ] All pages approved by designated approvers
- [ ] Content staging pages ready to replace
- [ ] Approval chain documented

### Step 9.3: Domain Verification

1. Verify domain connected in **Settings > Domains & URLs**
2. Verify SSL certificate active (https://)
3. Test domain resolution

### Step 9.4: Publishing

**Non-Governed (Direct Publish):**
```javascript
// Publish pages
for (const pageId of pageIds) {
  await publishPage(pageId, { type: 'immediate' });
}
```

**Governed (Content Staging):**
1. Go to **Content > Content Staging**
2. Select all staged pages
3. Click **Publish to production**
4. Verify all pages replaced correctly

### Step 9.5: Post-Publish Verification

- [ ] Visit all pages on live domain
- [ ] Submit test form
- [ ] Click all navigation links
- [ ] Check on mobile device
- [ ] Verify analytics tracking
- [ ] Check for console errors

---

## Phase 10: Post-Launch Monitoring

See `02-site-launch.md` and `03-post-launch.md` for detailed procedures.

### Quick Checklist

**Week 1:**
- [ ] Monitor uptime daily
- [ ] Check for 404 errors
- [ ] Review form submissions
- [ ] Verify workflow execution

**Month 1:**
- [ ] Review traffic analytics
- [ ] Check SEO rankings
- [ ] Optimize underperforming pages
- [ ] Add fresh blog content

**Ongoing:**
- [ ] Monthly analytics review
- [ ] Quarterly SEO audit
- [ ] Regular content updates
- [ ] Performance monitoring

---

## Governance: Controlled vs. Open Publishing

| Process | Governed (Approval Required) | Non-Governed (Free Publish) |
|---------|------------------------------|----------------------------|
| **Content Creation** | Draft → Approval → Publish | Draft → Publish |
| **Publishing Rights** | Restricted roles | Any editor |
| **Theme Changes** | Version control + review | Direct edits allowed |
| **Workflows** | Manager approval before activation | Immediate activation |
| **Content Updates** | Content staging + approval | Live editing |

### Setting Up Governed Workflow

1. **Enable Content Approvals:**
   - Settings > Users & Teams > Teams
   - Configure approval permissions

2. **Configure Approval Chain:**
   - Assign approvers per content type
   - Set up notification preferences

3. **Use Content Staging:**
   - Create staged versions of pages
   - Submit for approval
   - Bulk publish when approved

---

## Related Documentation

- `02-site-launch.md` - Pre-launch checklist and go-live process
- `03-post-launch.md` - Post-launch monitoring and maintenance
- `hubspot-cli-patterns` skill - CLI command reference
- Agent references:
  - `hubspot-cms-theme-manager`
  - `hubspot-cms-page-publisher`
  - `hubspot-cms-content-manager`
  - `hubspot-cms-form-manager`
  - `hubspot-cms-cta-manager`
  - `hubspot-workflow-builder`
  - `hubspot-seo-optimizer`
