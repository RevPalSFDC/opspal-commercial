# Documentation System Evaluation

**Status**: Research Complete | **Date**: 2025-10-20
**Purpose**: Evaluate Sphinx and alternative documentation systems for customer-facing documentation

---

## Executive Summary

### Key Findings

**Sphinx Recommendation**: ❌ **NOT RECOMMENDED** for this use case

**Reason**: Sphinx is designed for **API reference documentation** (code → docs) via autodoc/JSDoc extraction. Your needs are **process and system documentation** (guides, workflows, customer instances) - fundamentally different documentation types.

**Alternative Recommendation**: ✅ **Docusaurus + Netlify**
- **Tool**: Docusaurus (user-facing documentation framework)
- **Hosting**: Netlify (zero-infrastructure, free tier)
- **Architecture**: Separate site per major customer
- **Cost**: $0 for most use cases
- **Setup Time**: ~15 minutes per customer site

---

## Background: Documentation Requirements

### User Needs (Clarified 2025-10-20)

| Requirement | Details |
|-------------|---------|
| **Primary Goal** | External user documentation |
| **Audience** | External plugin users (not internal developers) |
| **Content Type** | Systems and processes for customer instances and data |
| **Pain Point** | No cross-linking between components |

### Current Documentation State

**Existing Assets:**
- 285+ JavaScript files with JSDoc comments (`.claude-plugins/*/scripts/lib/*.js`)
- Agent definitions (`.claude-plugins/*/agents/*.md`) with YAML frontmatter
- Command documentation (`.claude-plugins/*/commands/*.md`)
- Instance-specific docs (`instances/*/`)
- Project guides (`docs/DEVELOPER_TOOLS_GUIDE.md`, etc.)

**Existing Documentation Tools:**
- `readme-generator.js` - Generates plugin READMEs from metadata
- `documentation-validator.js` - Validates markdown documentation quality
- `documentation-batch-updater.js` - Batch updates for consistency

**What's Missing:**
- Centralized, cross-linked user documentation site
- Search across all documentation
- Navigation structure for customer instances
- Version-specific documentation (plugin v1.0 vs v2.0)
- Customer-specific isolation and privacy

---

## Sphinx Feasibility Assessment

### What is Sphinx?

**Source**: https://sphinx-doc.org, https://github.com/sphinx-doc/sphinx

**Description**: Sphinx is a documentation generator written in Python, originally created for Python documentation but extensible to other languages.

**Latest Version**: Released March 2, 2025

### Core Capabilities

| Feature | Description | Relevance to Your Needs |
|---------|-------------|------------------------|
| **autodoc** | Extracts Python docstrings → API documentation | ❌ Low - You need process docs, not API docs |
| **sphinx-js** | Extracts JSDoc from JavaScript → API documentation | ❌ Low - You have JSDoc but need process docs |
| **Cross-references** | Automatic links for functions, classes, modules | ⚠️ Medium - Useful but overkill for guides |
| **Multiple outputs** | HTML, PDF, EPub, man pages | ✅ High - Multiple formats useful |
| **Code highlighting** | Pygments syntax highlighting | ✅ High - Useful for code examples |
| **Theming** | Customizable themes (ReadTheDocs, Alabaster) | ✅ Medium - Nice but not critical |

### JavaScript Support (sphinx-js Extension)

**Repository**: https://github.com/pyodide/sphinx-js (transferred from Mozilla to Pyodide in 2025)

**What It Does:**
- Extracts JSDoc/TypeDoc comments from JavaScript/TypeScript
- Generates API reference documentation (classes, functions, parameters, return types)
- Works similar to Python's autodoc

**Example Output:**
```
SafeQueryExecutor
=================

.. js:function:: safeChildRecords(relationshipObject, defaultValue)

   Safely access child relationship records

   :param object relationshipObject: Child relationship from query result
   :param array defaultValue: Default value if null (default: [])
   :returns: Array of records or default value
   :rtype: array
```

### Why Sphinx is NOT Recommended for Your Use Case

#### Mismatch: Code Documentation vs Process Documentation

**What Sphinx Excels At:**
- "Here's the API for the `SafeQueryExecutor` class"
- "This function takes these parameters and returns this type"
- "Navigate the codebase by module/class/function"

**What You Actually Need:**
- "Here's how to run a CPQ assessment for eta-corp"
- "Follow these steps to deploy metadata to a customer instance"
- "Here's the quirks documentation for delta-corp's Salesforce org"
- "Cross-reference this assessment with related processes"

#### Technical Limitations

1. **Over-engineered for your needs**: Sphinx requires Python, reStructuredText (not Markdown), and complex configuration
2. **Wrong content model**: Optimized for API references with inheritance trees, not process guides with workflows
3. **Poor customer isolation**: No built-in way to create separate docs per customer instance
4. **Steep learning curve**: reStructuredText is less common than Markdown, harder for team adoption

#### Better Tool Exists

Docusaurus (see below) is **purpose-built** for exactly your use case:
- User-facing documentation (not API reference)
- Markdown-based (your team already uses this)
- Excellent cross-linking and navigation
- Versioning built-in (plugin v1.0 vs v2.0)
- Modern, fast, searchable

---

## Alternative Documentation Tools

### Option 1: Docusaurus (RECOMMENDED)

**Source**: https://docusaurus.io (Facebook/Meta)

**What It Is**: Documentation framework designed for user-facing documentation sites

**Key Features:**

| Feature | Benefit | Example |
|---------|---------|---------|
| **Markdown-first** | Easy to write, team already knows it | Existing `.md` files can be migrated directly |
| **Versioning** | Multiple plugin versions side-by-side | Show docs for salesforce-plugin v3.15.0 vs v4.0.0 |
| **Search** | Built-in Algolia search | Users find "CPQ assessment" across all docs |
| **Cross-linking** | Smart link validation | Link from agent docs to related commands |
| **Sidebar navigation** | Auto-generated or custom | Group by customer, plugin, or process type |
| **i18n** | Multi-language support | English + Spanish for global customers |

**Technology Stack:**
- React-based (Node.js required)
- Markdown + MDX (Markdown + React components)
- Static site generation (fast, SEO-friendly)

**Setup Time**: 2-4 hours for initial site, 15 minutes per customer section

**Example Structure:**
```
docs/
├── salesforce-plugin/
│   ├── getting-started.md
│   ├── agents/
│   │   ├── sfdc-orchestrator.md
│   │   └── sfdc-conflict-resolver.md
│   └── commands/
│       └── dedup.md
├── customer-instances/
│   ├── eta-corp/
│   │   ├── cpq-assessment.md
│   │   ├── org-quirks.md
│   │   └── deployment-guide.md
│   └── delta-corp/
│       ├── revops-audit.md
│       └── field-mappings.md
└── processes/
    ├── running-assessments.md
    └── deployment-workflows.md
```

**Pros:**
- ✅ Purpose-built for user documentation
- ✅ Excellent cross-linking and navigation
- ✅ Versioning built-in
- ✅ Great search (Algolia)
- ✅ Active community, well-maintained
- ✅ Can integrate custom React components
- ✅ Markdown-based (easy to write)

**Cons:**
- ❌ Requires React/Node.js knowledge for customization
- ❌ Heavier than alternatives (but still fast)
- ❌ Initial setup takes a few hours

**Best For**: Large, multi-faceted documentation with versioning needs

---

### Option 2: MkDocs Material

**Source**: https://www.mkdocs.org, https://squidfunk.github.io/mkdocs-material/

**What It Is**: Simple, fast, Python-based documentation generator with Material Design theme

**Key Features:**

| Feature | Benefit |
|---------|---------|
| **Simple setup** | Single config file (`mkdocs.yml`) |
| **Material theme** | Beautiful, professional UI out-of-box |
| **Fast** | Static site generation, instant page loads |
| **Search** | Built-in client-side search |
| **Markdown** | Pure Markdown, no React/JSX |

**Technology Stack:**
- Python-based (similar to Sphinx)
- Pure Markdown (simpler than MDX)
- Jinja2 templating

**Setup Time**: 1-2 hours for initial site

**Example `mkdocs.yml`:**
```yaml
site_name: OpsPal Documentation
theme:
  name: material
  features:
    - navigation.tabs
    - navigation.sections
    - toc.integrate
    - search.suggest

nav:
  - Home: index.md
  - Salesforce Plugin:
    - Overview: salesforce/index.md
    - Agents: salesforce/agents.md
    - Commands: salesforce/commands.md
  - Customer Instances:
    - eta-corp: customers/eta-corp.md
    - delta-corp: customers/delta-corp.md
```

**Pros:**
- ✅ Extremely simple setup (2 hours vs 4 hours for Docusaurus)
- ✅ Beautiful Material theme out-of-box
- ✅ Pure Markdown (no React learning curve)
- ✅ Fast page loads
- ✅ Good search (client-side)

**Cons:**
- ❌ No built-in versioning (requires manual setup)
- ❌ Less flexible than Docusaurus
- ❌ Requires Python (like Sphinx)
- ❌ Smaller community than Docusaurus

**Best For**: Simpler documentation needs, faster setup, team prefers Python

---

### Option 3: VitePress

**Source**: https://vitepress.dev (Vue.js team)

**What It Is**: Modern, lightweight documentation framework built on Vite

**Key Features:**

| Feature | Benefit |
|---------|---------|
| **Fast** | Vite-powered, instant HMR |
| **Modern** | Vue 3, latest web standards |
| **Markdown** | Markdown + Vue components |
| **Lightweight** | Smaller bundle than Docusaurus |

**Technology Stack:**
- Vue.js-based
- Vite build tool
- Markdown + Vue SFC

**Pros:**
- ✅ Very fast (faster than Docusaurus)
- ✅ Modern, clean UI
- ✅ Lightweight bundle
- ✅ Good for developers familiar with Vue

**Cons:**
- ❌ Newer (less mature than Docusaurus/MkDocs)
- ❌ Smaller ecosystem
- ❌ Less documentation and examples
- ❌ Versioning not as robust as Docusaurus

**Best For**: Teams already using Vue.js, value speed over features

---

## Comparison Matrix

| Feature | Sphinx + sphinx-js | Docusaurus | MkDocs Material | VitePress |
|---------|-------------------|------------|-----------------|-----------|
| **Primary Use Case** | API reference | User docs | User docs | User docs |
| **Content Type** | Code → Docs | Process guides | Process guides | Process guides |
| **Markup** | reStructuredText | Markdown + MDX | Markdown | Markdown + Vue |
| **Versioning** | Manual | Built-in ✅ | Manual | Manual |
| **Search** | Sphinx search | Algolia ✅ | Client-side | Client-side |
| **Cross-linking** | Good | Excellent ✅ | Good | Good |
| **Setup Time** | 6-8 hours | 2-4 hours | 1-2 hours | 2-3 hours |
| **Learning Curve** | Steep | Moderate | Easy ✅ | Moderate |
| **Customer Isolation** | Manual | Manual | Manual | Manual |
| **Tech Stack** | Python | React/Node | Python | Vue/Node |
| **Fit for Your Needs** | ❌ Low | ✅ High | ✅ Medium | ⚠️ Medium |

**Recommendation Ranking:**
1. 🥇 **Docusaurus** - Best overall fit (user docs, versioning, cross-linking)
2. 🥈 **MkDocs Material** - Simplest/fastest setup if versioning not critical
3. 🥉 **VitePress** - Good if team uses Vue, value speed
4. ❌ **Sphinx** - Wrong tool for this job

---

## Hosting Options Analysis

### Requirement: Zero-Infrastructure Hosting

**User Need**: "Provide a customer with a link to their own personal documentation without us having to worry about hosting architecture"

### Option 1: Netlify (RECOMMENDED)

**Source**: https://www.netlify.com

**What It Is**: Modern web hosting platform with git-based deployments

**Key Features:**

| Feature | Details | Benefit |
|---------|---------|---------|
| **Free tier** | Unlimited sites, 100GB bandwidth/month | $0 cost for most use cases |
| **Auto-deploy** | Git push → live in 30 seconds | Zero manual deployment |
| **Custom domains** | `eta-corp.docs.revpal.io` | Professional URLs |
| **Password protection** | Built-in password per site | Customer privacy without auth system |
| **Subdomains** | `eta-corp-ops.netlify.app` free | Easy customer isolation |
| **Edge CDN** | Global edge network | Fast worldwide |
| **SSL** | Automatic HTTPS | Security included |

**Setup Workflow:**
```bash
# One-time per customer (10-15 min)
cd docs-eta-corp
netlify init
# Answer prompts → get eta-corp-ops.netlify.app

# Set password protection
netlify env:set SITE_PASSWORD "customer-secret-123"

# Every update after (30 seconds)
git push origin main
# Site auto-updates
```

**Pricing:**

| Tier | Sites | Bandwidth | Build Minutes | Cost |
|------|-------|-----------|---------------|------|
| **Free** | Unlimited | 100GB/month | 300/month | $0 |
| **Pro** | Unlimited | 400GB/month | 1000/month | $19/month |

**Pros:**
- ✅ Zero infrastructure management
- ✅ Unlimited free sites (one per customer)
- ✅ Password protection built-in
- ✅ Custom domains easy
- ✅ Auto-deploy from git
- ✅ Global CDN included
- ✅ Great developer experience

**Cons:**
- ❌ 100GB bandwidth might be tight for very large docs (unlikely)
- ❌ Password protection is simple (not OAuth/SAML)

**Best For**: Most use cases, especially customer-specific sites

---

### Option 2: GitHub Pages

**Source**: https://pages.github.com

**What It Is**: Free static site hosting from GitHub

**Key Features:**

| Feature | Details |
|---------|---------|
| **Free** | Unlimited public sites |
| **Custom domains** | CNAME support |
| **Auto-deploy** | GitHub Actions integration |
| **SSL** | Automatic HTTPS |

**Setup Workflow:**
```bash
# In repo settings
Settings → Pages → Source: main branch /docs folder

# Get URL
https://revpal.github.io/customer-eta-corp-docs
```

**Pricing:**

| Tier | Sites | Bandwidth | Cost |
|------|-------|-----------|------|
| **Free (public)** | Unlimited | 100GB/month | $0 |
| **Free (private)** | Unlimited | 100GB/month | $0 (with GitHub Pro/Team) |

**Pros:**
- ✅ Completely free
- ✅ Tight GitHub integration
- ✅ Simple setup
- ✅ Good for open source

**Cons:**
- ❌ Public by default (need private repos for customer docs)
- ❌ No built-in password protection
- ❌ URL structure less flexible (`github.io/repo-name`)
- ❌ Less features than Netlify

**Best For**: Public documentation, already on GitHub, cost is critical

---

### Option 3: Read the Docs

**Source**: https://readthedocs.org

**What It Is**: Purpose-built documentation hosting (designed for Sphinx/MkDocs)

**Key Features:**

| Feature | Details |
|---------|---------|
| **Free** | Unlimited public/private projects |
| **Versioning** | Built-in version management |
| **Search** | Elasticsearch search |
| **Custom domains** | Subdomain support |

**Pricing:**

| Tier | Projects | Features | Cost |
|------|----------|----------|------|
| **Free** | Unlimited | All features | $0 |
| **Business** | Unlimited | Priority support, analytics | $50/month |

**Pros:**
- ✅ Purpose-built for documentation
- ✅ Excellent versioning
- ✅ Great search
- ✅ Completely free

**Cons:**
- ❌ Locked into Sphinx or MkDocs (can't use Docusaurus)
- ❌ Less customization
- ❌ reStructuredText preferred over Markdown

**Best For**: If you choose MkDocs (not Docusaurus), versioning is critical

---

## Customer-Specific Content Strategies

### Strategy A: Single Site, Multiple Sections

**Architecture:**
```
docs.revpal.io/
├── plugins/
│   ├── salesforce/
│   └── hubspot/
├── customers/
│   ├── eta-corp/
│   ├── delta-corp/
│   └── gamma-corp/
└── processes/
    ├── assessments/
    └── deployments/
```

**Access Control:**
- Netlify path-based password protection
- OR customer sees all customer names but only their content

**Pros:**
- ✅ Single deployment
- ✅ Easy maintenance
- ✅ Shared search across all content
- ✅ Easy cross-linking

**Cons:**
- ❌ Customers see other customer names in navigation
- ❌ Less privacy
- ❌ Harder to customize per customer

**Best For**: Internal documentation, trusted partners, not sensitive

---

### Strategy B: Separate Site Per Customer (RECOMMENDED)

**Architecture:**
```
# Separate Netlify sites
eta-corp.docs.revpal.io    → Password: eta-corp-secret-123
delta-corp.docs.revpal.io  → Password: delta-corp-secret-456
internal.docs.revpal.io  → Public or private
```

**Folder Structure:**
```
opspal-docs-eta-corp/       (git repo)
├── docs/
│   ├── cpq-assessment.md
│   ├── org-quirks.md
│   └── deployment-guide.md
└── netlify.toml

opspal-docs-delta-corp/     (git repo)
├── docs/
│   ├── revops-audit.md
│   └── field-mappings.md
└── netlify.toml
```

**Access Control:**
- Password per site (simple)
- OR OAuth via Netlify Identity (advanced)
- OR IP whitelist

**Pros:**
- ✅ Complete customer isolation
- ✅ Can customize branding per customer
- ✅ Easy to control access (password per site)
- ✅ Customer can't see other customer names
- ✅ Can delete customer site easily

**Cons:**
- ❌ More repos to manage (still minimal with automation)
- ❌ Duplicate shared content (plugins, processes)
- ❌ No cross-customer search

**Best For**: Customer privacy is important, compliance requirements

---

### Strategy C: Dynamic Doc Generation

**Architecture:**
```
# Template-based generation
templates/
├── customer-docs/
│   ├── cpq-assessment.md.tpl
│   └── org-quirks.md.tpl
└── plugins/
    └── salesforce.md.tpl

# Generate on-demand
generate-docs.js --customer eta-corp --output ./eta-corp-docs
netlify deploy --dir ./eta-corp-docs --site eta-corp-ops
```

**How It Works:**
1. Store content as templates with variables (`{{customer_name}}`, `{{org_alias}}`)
2. Script generates customer-specific docs on-demand
3. Deploy to unique URL per customer
4. Update templates → regenerate all customer sites

**Pros:**
- ✅ DRY - shared content in templates
- ✅ Easy to update all customers at once
- ✅ Can inject customer-specific data (org name, instance URL)
- ✅ Ultimate flexibility

**Cons:**
- ❌ More complex setup (2-3 days initial)
- ❌ Requires build/generation step
- ❌ Harder to debug template issues

**Best For**: Large customer base (10+ customers), lots of shared content

---

## Recommended Architecture

### For Your Use Case: **Docusaurus + Netlify + Separate Sites**

**Why This Combination:**

| Requirement | Solution | Why |
|-------------|----------|-----|
| User-facing docs | Docusaurus | Purpose-built for guides, not API docs |
| Cross-linking | Docusaurus | Excellent internal linking |
| Versioning | Docusaurus | Built-in versioning (plugin v1.0 vs v2.0) |
| Zero hosting | Netlify | Free tier, auto-deploy, zero config |
| Customer privacy | Separate sites | Each customer has isolated site |
| Easy updates | Git + Netlify | `git push` → live in 30 seconds |

**Architecture Diagram:**

```
┌─────────────────────────────────────────────────────┐
│ Git Repositories (GitHub)                           │
├─────────────────────────────────────────────────────┤
│ opspal-docs-eta-corp/       → eta-corp-ops.netlify.app  │
│ opspal-docs-delta-corp/     → delta-corp-ops.netlify.app│
│ opspal-docs-internal/     → internal.docs.revpal.io │
└─────────────────────────────────────────────────────┘
                     ↓ git push
┌─────────────────────────────────────────────────────┐
│ Netlify (Auto-deploy)                               │
├─────────────────────────────────────────────────────┤
│ Build: npm run build                                │
│ Deploy: ./build → CDN                               │
│ Time: ~30 seconds                                   │
└─────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│ Customer Access                                     │
├─────────────────────────────────────────────────────┤
│ eta-corp → eta-corp-ops.netlify.app (password protected)│
│ delta-corp → delta-corp-ops.netlify.app (password)      │
│ Internal → internal.docs.revpal.io (public)         │
└─────────────────────────────────────────────────────┘
```

**Workflow:**

```bash
# Initial Setup (per customer, 15 min)
npx create-docusaurus@latest opspal-docs-eta-corp classic
cd opspal-docs-eta-corp
# Customize sidebars, add content
git init && git add . && git commit -m "Initial eta-corp docs"
netlify init  # Get eta-corp-ops.netlify.app
netlify env:set SITE_PASSWORD "eta-corp-secret-123"

# Ongoing Updates (30 seconds)
# Edit docs/cpq-assessment.md
git add . && git commit -m "Update CPQ guidance"
git push  # Live in 30 seconds
```

---

## Implementation Roadmap

### Phase 1: Proof of Concept (4-6 hours)

**Goal**: Validate Docusaurus + Netlify with one customer

**Tasks:**
1. Install Docusaurus (`npx create-docusaurus@latest opspal-docs-poc classic`)
2. Migrate 2-3 existing docs:
   - One customer instance doc (e.g., eta-corp CPQ assessment)
   - One plugin guide (e.g., Salesforce plugin overview)
   - One process guide (e.g., running assessments)
3. Set up cross-linking between pages
4. Deploy to Netlify (get `poc-ops.netlify.app`)
5. Test password protection
6. Get team feedback

**Success Criteria:**
- [ ] Can navigate between cross-linked docs
- [ ] Search works
- [ ] Password protection prevents access
- [ ] `git push` → live in <60 seconds
- [ ] Team approves look and feel

**Output**: Working POC at `poc-ops.netlify.app`

---

### Phase 2: First Customer Site (8-12 hours)

**Goal**: Complete documentation for one customer (eta-corp or delta-corp)

**Tasks:**
1. Create customer-specific repo (`opspal-docs-eta-corp`)
2. Migrate all instance docs from `instances/eta-corp/`:
   - CPQ assessment results
   - Org quirks documentation
   - Deployment guides
   - Field mappings
3. Add plugin guides they use (Salesforce, HubSpot)
4. Create process guides:
   - How to run assessments
   - How to deploy metadata
   - How to request changes
5. Set up navigation sidebar
6. Deploy to custom domain (`eta-corp.docs.revpal.io`)
7. Add password protection
8. Send to customer for feedback

**Success Criteria:**
- [ ] All customer docs migrated
- [ ] Customer can find any doc in <3 clicks
- [ ] Search returns relevant results
- [ ] Customer approves content and navigation

**Output**: `eta-corp.docs.revpal.io` (password protected)

---

### Phase 3: Automation & Scaling (4-6 hours)

**Goal**: Automate doc generation and add more customers

**Tasks:**
1. Create shared content templates (plugins, processes)
2. Script to scaffold new customer site:
   ```bash
   ./scripts/create-customer-docs.sh delta-corp
   # Creates opspal-docs-delta-corp/
   # Copies shared content
   # Initializes Netlify
   # Sets up git
   ```
3. Set up CI/CD for auto-deploy on merge
4. Create contribution guidelines for team
5. Add 2-3 more customer sites

**Success Criteria:**
- [ ] New customer site in <30 minutes
- [ ] Shared content updates all customer sites
- [ ] Team can contribute without Claude

**Output**: 3-5 customer sites live

---

### Phase 4: Integration with Existing Tools (4-6 hours)

**Goal**: Integrate with existing readme-generator and documentation-validator

**Tasks:**
1. Update `readme-generator.js` to also output Docusaurus pages
2. Add validation for Docusaurus sidebar links
3. Create hook to auto-generate docs when agents/commands change
4. Set up monitoring for broken links
5. Add version switcher (plugin v3.15.0 vs v4.0.0)

**Success Criteria:**
- [ ] Agent changes → docs update automatically
- [ ] Broken links detected in CI
- [ ] Can view docs for any plugin version

**Output**: Fully integrated documentation system

---

## Cost Analysis

### Free Tier Limits (Netlify)

| Resource | Free Tier | Typical Usage per Customer | Customers Supported |
|----------|-----------|----------------------------|---------------------|
| **Sites** | Unlimited | 1 site per customer | Unlimited |
| **Bandwidth** | 100GB/month | ~500MB/month (100 visitors) | 200 customers |
| **Build minutes** | 300/month | ~5 min/customer/month | 60 customer sites |
| **Storage** | Unlimited | ~50MB per site | Unlimited |

**Conclusion**: Free tier easily supports 20-30 customer sites with normal traffic

### Scaling Considerations

**When to upgrade to Pro ($19/month):**
- More than 30 customer sites (build minutes)
- More than 100GB bandwidth/month (high traffic)
- Need faster build times (Pro: priority builds)
- Need team collaboration features

**Cost per Customer:**
- Free tier: $0
- Pro tier: $19/month ÷ 100 customers = $0.19/customer/month

**ROI:**
- Alternative (self-hosted): $100-500/month server + maintenance time
- Netlify: $0-19/month, zero maintenance

---

## Migration Path from Current State

### Existing Documentation Assets

**You Already Have:**

| Asset Type | Location | Migration Effort |
|-----------|----------|------------------|
| Instance docs | `instances/*/` | Low - Copy markdown files |
| Agent docs | `.claude-plugins/*/agents/*.md` | Medium - Extract descriptions |
| Command docs | `.claude-plugins/*/commands/*.md` | Medium - Format as user guides |
| Process guides | `docs/*.md` | Low - Copy directly |
| Scripts JSDoc | `.claude-plugins/*/scripts/lib/*.js` | High - Not needed for user docs |

### Migration Strategy

**Step 1: Inventory Content**
```bash
# List all documentation
find instances -name "*.md"
find .claude-plugins -name "*.md"
find docs -name "*.md"
```

**Step 2: Categorize by Audience**
- **User-facing**: Instance docs, command guides, process workflows → Migrate to Docusaurus
- **Developer-facing**: JSDoc, architecture docs → Keep separate (or add later)

**Step 3: Organize by Customer**
```
eta-corp/
  ├── assessments/
  │   ├── cpq-assessment-2025-10.md
  │   └── revops-audit-2025-09.md
  ├── org-config/
  │   ├── quirks.md
  │   └── field-mappings.md
  └── guides/
      ├── deployment.md
      └── troubleshooting.md
```

**Step 4: Migrate Incrementally**
- Week 1: POC with 5-10 docs
- Week 2: First customer (eta-corp)
- Week 3: Second customer (delta-corp)
- Week 4: Remaining customers

---

## Appendix: Quick Start Commands

### Docusaurus Setup

```bash
# Install
npx create-docusaurus@latest my-docs classic
cd my-docs

# Run locally
npm start  # Opens http://localhost:3333

# Build for production
npm run build  # Output in ./build/
```

### Netlify Setup

```bash
# Install CLI
npm install -g netlify-cli

# Deploy
cd my-docs
netlify init  # Follow prompts
netlify deploy --prod

# Set password
netlify env:set SITE_PASSWORD "secret-123"
```

### MkDocs Setup (Alternative)

```bash
# Install
pip install mkdocs-material

# Create site
mkdocs new my-docs
cd my-docs

# Run locally
mkdocs serve  # Opens http://localhost:8000

# Build for production
mkdocs build  # Output in ./site/
```

---

## References

### Documentation Tools
- **Sphinx**: https://sphinx-doc.org
- **sphinx-js**: https://github.com/pyodide/sphinx-js
- **Docusaurus**: https://docusaurus.io
- **MkDocs Material**: https://squidfunk.github.io/mkdocs-material/
- **VitePress**: https://vitepress.dev

### Hosting Platforms
- **Netlify**: https://www.netlify.com
- **GitHub Pages**: https://pages.github.com
- **Read the Docs**: https://readthedocs.org

### Related OpsPal Docs
- `docs/DEVELOPER_TOOLS_GUIDE.md` - Developer tools overview
- `docs/SUPERVISOR_AUDITOR_SYSTEM.md` - Agent orchestration system
- `docs/AUTOMATION_BOUNDARIES_GUIDE.md` - Automation best practices

---

## Conclusion

**Final Recommendation**: Use **Docusaurus + Netlify** with separate sites per customer

**Rationale:**
1. ✅ Docusaurus is purpose-built for user-facing documentation (not API docs like Sphinx)
2. ✅ Netlify provides zero-infrastructure hosting ($0 cost, zero maintenance)
3. ✅ Separate sites ensure customer privacy and isolation
4. ✅ Markdown-based workflow matches team's existing practices
5. ✅ Cross-linking and search solve the stated pain point
6. ✅ Versioning supports plugin evolution
7. ✅ ~15 minutes per customer site, minimal ongoing overhead

**Next Steps:**
1. Review this evaluation with team
2. Decide: Proceed with POC or explore further?
3. If proceeding: Allocate 4-6 hours for Phase 1 POC
4. If uncertain: Schedule demo/walkthrough of Docusaurus examples

---

**Document Status**: Complete
**Last Updated**: 2025-10-20
**Author**: Claude Code (Documentation Research)
**Review Status**: Pending team review
