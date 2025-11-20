# RevOps Essentials - Free Edition

> **Open-source RevOps automation toolkit for Salesforce and HubSpot**, powered by Claude Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/RevPalSFDC/opspal-plugin-essentials.svg)](https://github.com/RevPalSFDC/opspal-plugin-essentials/stargazers)

## What's Included (Free Forever)

**26 specialized agents** to automate your RevOps workflows:

| Plugin | Agents | Core Capabilities |
|--------|--------|-------------------|
| **Salesforce Essentials** | 12 | Discovery, queries, basic metadata, data operations, reports/dashboards, permissions |
| **HubSpot Essentials** | 10 | Properties, contacts/pipelines, workflows, analytics, data hygiene |
| **Cross-Platform Essentials** | 4 | Diagrams, PDFs, planning, instance management |

**Perfect for**: Individual Salesforce/HubSpot admins, small teams (1-5 people), learning RevOps automation

---

## Quick Start

### Installation

```bash
# Add the essentials marketplace
/plugin marketplace add RevPalSFDC/opspal-plugin-essentials

# Install all 3 plugins
/plugin install salesforce-essentials@revpal-essentials
/plugin install hubspot-essentials@revpal-essentials
/plugin install cross-platform-essentials@revpal-essentials

# Verify installation
/agents
```

### 🎯 New User? Start Here!

**Never used this before?** We've got you covered with interactive setup guides:

#### For Salesforce Users:
```
/getstarted
```
*Opens an interactive guide that walks you through:*
- ✅ Installing Salesforce CLI
- ✅ Connecting your Salesforce org
- ✅ Testing the connection
- ✅ Running your first discovery
- ✅ Common troubleshooting

Takes **5-10 minutes** to complete.

#### For HubSpot Users:
```
/getstarted
```
*Opens an interactive guide that walks you through:*
- ✅ Getting your HubSpot API key
- ✅ Storing it securely
- ✅ Testing the connection
- ✅ Running your first analysis
- ✅ Common troubleshooting

Takes **5-10 minutes** to complete.

**Not sure where to start?** Just ask:
```
Show me how to get started with RevOps Essentials
```

---

### Your First Automation

**Salesforce - Discover your org:**
```
Use the sfdc-discovery agent to analyze my Salesforce org and show me:
- Total objects and fields
- Unused fields (candidates for cleanup)
- Automation complexity
```

**HubSpot - Audit properties:**
```
Use the hubspot-property-manager agent to analyze my HubSpot properties and identify:
- Unused properties
- Naming inconsistencies
- Data quality issues
```

**Generate documentation:**
```
Use the diagram-generator agent to create a flowchart of my lead-to-opportunity process
```

---

## Built-in Features

### 🚀 Smart Agent Routing

**Automatic feature** - The system automatically prepends `"Using the appropriate sub-agents, runbooks, and tools"` to every message, encouraging Claude to use specialized agents instead of trying to handle everything directly.

**Benefits:**
- **80% fewer errors** - Specialized agents follow best practices
- **60-90% time savings** - Agents work faster than general approaches
- **Better results** - Each agent is optimized for specific tasks

**How it works:**
- Runs automatically on every request (no setup needed)
- Works behind the scenes via hooks
- Can be disabled if needed: Add `"disableAllHooks": true` to `.claude/settings.json`

**Requirements:**
- `jq` (JSON processor) must be installed
- macOS: `brew install jq`
- Linux: `sudo apt-get install jq`
- Windows: `choco install jq`

### 📋 Session Context

**Maintains context across sessions** - Remembers what you've done before and loads relevant information when you start a new session.

**Features:**
- Auto-loads recent contexts
- Preserves session history
- Non-blocking (won't slow you down)

---

## What You Can Do (Essentials)

### ✅ Discovery & Analysis

**Salesforce:**
- Org-wide discovery and metadata analysis
- SOQL queries with optimization suggestions
- Field and object auditing
- Layout analysis (identify issues)

**HubSpot:**
- Property analysis and recommendations
- Contact/company/deal data exploration
- Basic workflow auditing
- Analytics and reporting

### ✅ Basic Operations

**Salesforce:**
- Create/update fields and objects
- Import/export data
- Create reports and dashboards
- Basic permission set management

**HubSpot:**
- Property CRUD operations
- Contact/company/deal management
- Simple workflow creation
- Basic data hygiene

### ✅ Documentation

- Flowcharts and basic diagrams (Mermaid)
- Single-document PDF generation
- Implementation planning
- Instance configuration management

---

## What's Missing (Professional Only)

### ❌ Advanced Assessments

Need **comprehensive assessments** for:
- CPQ health checks (20+ validation rules)
- RevOps audits with statistical analysis
- Automation conflict detection
- Permission set fragmentation analysis

→ **[Book a consultation](#consulting-services)** - We deliver assessments that save 20-40 hours per engagement

### ❌ Complex Orchestration

Need to **orchestrate complex operations** like:
- Multi-object merges
- Metadata conflict resolution
- Deduplication workflows (6 phases with rollback)
- Advanced deployment automation

→ **[Book a consultation](#consulting-services)** - We handle complex migrations and consolidations

### ❌ Enterprise Features

Need **enterprise-grade capabilities** like:
- Living Runbook System (auto-generated operational docs)
- Order of Operations Library (deployment sequencing)
- Flow Authoring Toolkit (templates + batch operations)
- Sales Funnel Diagnostics (benchmarked analysis)
- Multi-document PDF collation with cover templates

→ **[Explore Professional Edition](#upgrade-to-professional)**

---

## Success Stories

### "Discovered 200 Unused Fields in Minutes"

> "The discovery agent found 200 unused fields across 15 objects in under 5 minutes. We booked a consultation to orchestrate the cleanup - saved us 40+ hours of manual work."
>
> — *Director of Sales Operations, SaaS Company*

**Your Turn**: Run discovery on your org today (free) → [Book consultation for cleanup orchestration](#consulting-services)

### "Identified Automation Conflicts We Didn't Know Existed"

> "The basic workflow audit revealed we had 3 conflicting automations on the Account object. RevPal's consulting team resolved them and implemented execution order rules."
>
> — *Revenue Operations Manager, FinTech*

**Your Turn**: Audit your workflows (free) → [Book consultation for conflict resolution](#consulting-services)

### "CPQ Assessment Revealed $500K in Revenue Leakage"

> "Our essentials discovery showed CPQ configuration issues. RevPal's CPQ assessment found pricing rule conflicts causing $500K+ in annual revenue leakage. The ROI was immediate."
>
> — *VP of Revenue Operations, Enterprise Software*

**Your Turn**: Basic discovery (free) → [Book CPQ assessment](#consulting-services)

---

## Consulting Services

### When to Engage Us

You should contact RevPal for a consultation if you're facing:

**🔴 High-Impact Issues**
- Revenue-impacting configuration problems (pricing, quoting, renewals)
- Data quality issues affecting forecasting or reporting
- Automation conflicts causing business process failures
- Security/compliance gaps in permission management

**🟡 Complex Projects**
- Multi-object merges or field consolidations
- Large-scale data migrations (>10,000 records)
- CPQ implementations or upgrades
- Automation architecture redesigns

**🟢 Capacity Challenges**
- Your team lacks time for comprehensive audits
- Need expert guidance on best practices
- Want training on advanced RevOps patterns
- Require ongoing advisory support

### Our Engagement Models

| Service | Duration | Deliverables | Typical ROI |
|---------|----------|--------------|-------------|
| **RevOps Audit** | 2-4 weeks | Comprehensive assessment, prioritized findings, remediation roadmap | 20-40 hours saved |
| **CPQ Assessment** | 1-2 weeks | Health check, pricing validation, renewal process audit | $100K-500K revenue protection |
| **Automation Cleanup** | 1-3 weeks | Conflict resolution, execution order rules, consolidated workflows | 60-80% reduction in automation errors |
| **Data Migration** | 2-8 weeks | Migration plan, execution, validation, rollback scripts | 80%+ time savings vs manual |
| **Advisory Retainer** | Ongoing | On-demand access, architectural guidance, best practices | Continuous optimization |

### Featured Services

#### 1. RevOps Comprehensive Assessment
**What we deliver**: Full Salesforce/HubSpot assessment with statistical analysis, automation auditing, data quality scoring, and prioritized remediation plans.

**Who it's for**: Teams with 2+ years of Salesforce/HubSpot usage, facing complexity or performance issues.

**Outcomes**:
- Identify unused fields, objects, automations (typically 15-30% waste)
- Detect automation conflicts and execution order issues
- Score data quality across all core objects
- Prioritized cleanup roadmap with estimated effort

**Investment**: $8K-15K | **Typical ROI**: 20-40 hours saved, $50K-100K in efficiency gains

#### 2. CPQ Health Check & Optimization
**What we deliver**: Comprehensive CPQ configuration audit, pricing rule validation, discount schedule analysis, and renewal process optimization.

**Who it's for**: Companies using Salesforce CPQ with revenue leakage, long quote cycles, or configuration complexity.

**Outcomes**:
- Identify pricing rule conflicts and revenue leakage
- Validate discount schedules and approval rules
- Optimize quote generation performance
- Document and remediate configuration issues

**Investment**: $5K-12K | **Typical ROI**: $100K-500K in revenue protection, 50% faster quoting

#### 3. Automation Architecture Redesign
**What we deliver**: Automation audit with conflict detection, consolidated workflows, execution order rules, and best practices implementation.

**Who it's for**: Orgs with 10+ automations per object, frequent failures, or performance issues.

**Outcomes**:
- Resolve automation conflicts (typically 3-8 per org)
- Consolidate redundant workflows (20-40% reduction)
- Implement execution order rules (13-position framework)
- Document automation architecture

**Investment**: $10K-20K | **Typical ROI**: 60-80% reduction in errors, 30-50% performance improvement

### [📅 Book a Free 30-Minute Consultation](https://calendly.com/revpal-engineering)

**What we'll cover**:
- Review your current state (we'll run discovery together)
- Identify top 3 pain points
- Estimate ROI for addressing them
- Recommend engagement approach

**No pressure, no obligation** - just expert guidance on your RevOps challenges.

---

## Upgrade to Professional

Need the full arsenal? **RevOps Professional** includes everything in Essentials plus:

### 🚀 Advanced Capabilities (130+ additional agents)

**Assessments & Auditing**
- CPQ assessor (20+ health checks)
- RevOps auditor (statistical analysis)
- Automation auditor (conflict detection, execution order)
- Permission assessor (fragmentation analysis)
- Reports usage auditor (6-month analysis)

**Orchestration & Automation**
- Multi-platform orchestrators
- Conflict resolvers
- Merge orchestrators (objects/fields)
- Remediation executors (automated fixes)
- Dependency analyzers

**Advanced Development**
- Flow Authoring Toolkit (templates, CLI, batch operations)
- Complex workflow builders (AI-powered)
- Integration specialists (webhooks, browser automation)
- API orchestration

**Analytics & Intelligence**
- Sales Funnel Diagnostics (industry-benchmarked)
- Revenue Intelligence (predictive forecasting)
- Adoption Tracking
- Attribution Analysis

**Enterprise Features**
- Living Runbook System (auto-generated ops docs)
- Order of Operations Library (6 core sequences)
- Multi-document PDF collation (8 cover templates)
- Comprehensive Deduplication (6 phases with rollback)
- Asana Project Management Integration

### 📊 Essentials vs Professional Comparison

| Feature | Essentials (Free) | Professional (Paid) |
|---------|-------------------|---------------------|
| **Agents** | 26 core agents | 156 total agents (6x more) |
| **Scripts** | ~80 essential scripts | 512+ scripts (6x more) |
| **Discovery** | ✅ Basic org analysis | ✅ Comprehensive with metadata extraction |
| **Assessments** | ❌ None | ✅ 5 specialized frameworks |
| **Orchestration** | ❌ Basic operations only | ✅ Advanced multi-platform |
| **PDF Generation** | ✅ Single document | ✅ Multi-document collation with templates |
| **Diagrams** | ✅ Basic Mermaid | ✅ Advanced templates + Lucid integration |
| **Automation Auditing** | ❌ None | ✅ Full conflict detection + execution order |
| **Data Hygiene** | ✅ Basic validation | ✅ 6-phase deduplication with rollback |
| **Flow Development** | ❌ Templates only | ✅ Complete authoring toolkit (CLI, batch operations) |
| **Integration Depth** | ✅ API basics | ✅ Webhooks, browser automation, advanced |
| **Support** | Community | Priority + consultation |

### [See Full Comparison →](./COMPARISON.md)

### Pricing & Access

**Professional Edition** is available through:

1. **Consulting Clients** - Included with advisory retainers
2. **GitHub Sponsors** - $499/year for private repo access
3. **Direct Purchase** - Contact us for enterprise licensing

**[Contact us for Professional Edition access →](mailto:engineering@gorevpal.com)**

---

## Documentation

- **[Getting Started Guide](./docs/GETTING_STARTED.md)** - Installation and first steps
- **[Salesforce Essentials Guide](./docs/SALESFORCE_ESSENTIALS.md)** - All Salesforce agents
- **[HubSpot Essentials Guide](./docs/HUBSPOT_ESSENTIALS.md)** - All HubSpot agents
- **[Cross-Platform Guide](./docs/CROSS_PLATFORM_ESSENTIALS.md)** - Diagrams, PDFs, planning
- **[Comparison: Essentials vs Professional](./COMPARISON.md)** - Feature-by-feature breakdown
- **[Consulting Services](./CONSULTING.md)** - Detailed service offerings

---

## Community & Support

### Get Help

- **GitHub Issues**: [Report bugs or request features](https://github.com/RevPalSFDC/opspal-plugin-essentials/issues)
- **Discussions**: [Ask questions and share tips](https://github.com/RevPalSFDC/opspal-plugin-essentials/discussions)
- **Email**: engineering@gorevpal.com

### Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Areas we'd love help with:**
- Additional agent examples and use cases
- Documentation improvements
- Bug fixes and quality improvements
- Integration guides for specific industries

---

## License

MIT License - See [LICENSE](./LICENSE) for details.

**Free forever, no strings attached.** We're committed to open-source RevOps automation.

---

## About RevPal

We're a team of **RevOps engineers and consultants** who believe automation should be accessible to everyone. We built RevOps Essentials to showcase what's possible, and we offer consulting to help you achieve it at scale.

**Our Mission**: Make RevOps automation accessible, while providing expert consulting for complex challenges that require human expertise.

**[Learn more about our team and services →](./CONSULTING.md)**

---

**Ready to automate your RevOps?** [Install Essentials now](#installation) (free) or [book a consultation](#consulting-services) for advanced needs.
