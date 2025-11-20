# Get Started with RevOps Essentials

Welcome to **RevOps Essentials**! This guide will help you get up and running quickly.

---

## Choose Your Platform

Which platform do you want to connect first?

### 🔷 Salesforce

**Best for:**
- Salesforce admins and developers
- Sales operations teams
- Complex object/field management
- CPQ and enterprise sales automation

**Start here:**
```
/getstarted  (in salesforce-essentials)
```

Or ask:
```
Show me the Salesforce getting started guide
```

---

### 🟠 HubSpot

**Best for:**
- Marketing and sales teams
- Inbound marketing automation
- Contact/pipeline management
- Simpler, faster setup

**Start here:**
```
/getstarted  (in hubspot-essentials)
```

Or ask:
```
Show me the HubSpot getting started guide
```

---

### 🚀 Both Platforms

**Working with both?** Set them up one at a time:

1. **Start with your primary platform** (where most of your data lives)
2. Once that's working, set up the secondary platform
3. Use cross-platform agents for unified operations

**Recommended order:**
- If you're a sales-heavy org → Start with Salesforce
- If you're a marketing-heavy org → Start with HubSpot

---

## Quick Start Overview

No matter which platform you choose, the setup process is:

### 1️⃣ **Install the Plugin** (Already Done!)

You've already installed RevOps Essentials. Verify with:
```
/agents
```

You should see agents from:
- ✅ salesforce-essentials (12 agents)
- ✅ hubspot-essentials (10 agents)
- ✅ cross-platform-essentials (4 agents)

### 2️⃣ **Connect Your Platform**

Follow the platform-specific guide:
- **Salesforce:** `/getstarted` command in salesforce-essentials
- **HubSpot:** `/getstarted` command in hubspot-essentials

This typically takes 5-10 minutes.

### 3️⃣ **Run Your First Discovery**

Once connected, discover what's in your org/portal:
- **Salesforce:** `Use sfdc-discovery agent to analyze my org`
- **HubSpot:** `Use hubspot-property-manager to analyze my properties`

### 4️⃣ **Start Automating**

Now you're ready! Common next steps:
- Create fields/properties
- Build reports
- Export data
- Create workflows
- Generate documentation

---

## What You Get (Free Forever)

### 📦 **26 Specialized Agents**

| Plugin | Agents | What They Do |
|--------|--------|--------------|
| **Salesforce Essentials** | 12 | Discovery, queries, metadata, data ops, reports |
| **HubSpot Essentials** | 10 | Properties, contacts, workflows, analytics |
| **Cross-Platform** | 4 | Diagrams, PDFs, planning, instance management |

### ✅ **Core Capabilities**

- **Discovery & Analysis** - Understand what's in your systems
- **Basic CRUD** - Create, read, update data and metadata
- **Reporting** - Build standard reports and dashboards
- **Documentation** - Generate diagrams and PDF deliverables
- **Data Operations** - Import/export, basic transformations
- **Basic Automation** - Simple workflows and triggers

### ❌ **What's NOT Included (Professional Only)**

- Comprehensive assessments (CPQ, RevOps audits)
- Automation conflict detection
- Advanced orchestration (merges, consolidations)
- Multi-document PDF collation
- Sales funnel diagnostics
- Living Runbooks
- Deduplication workflows

**[See full comparison →](../../../COMPARISON.md)**

---

## Common First Tasks

### For Salesforce Users

```
# Discover your org
Use sfdc-discovery to analyze my org and show top recommendations

# Find unused fields
Use sfdc-field-analyzer to identify unused fields on the Account object

# Export data
Use sfdc-data-operations to export all Contacts created this month

# Create a report
Use sfdc-reports-dashboards to create a report of open opportunities by stage
```

### For HubSpot Users

```
# Analyze properties
Use hubspot-property-manager to find unused properties on contacts

# Check workflows
Use hubspot-workflow to list all active workflows and their status

# Find duplicates
Use hubspot-data-hygiene-specialist to identify duplicate contacts

# Create a property
Use hubspot-property-manager to create a "customer_tier" property on companies
```

### Cross-Platform

```
# Create a process diagram
Use diagram-generator to create a flowchart of my lead-to-opportunity process

# Generate documentation
Use pdf-generator to create a PDF of my discovery findings

# Plan an implementation
Use implementation-planner to create a plan for implementing lead scoring
```

---

## Need Help?

### 📚 **Documentation**

- **Salesforce Guide:** [docs/SALESFORCE_ESSENTIALS.md](../../../docs/SALESFORCE_ESSENTIALS.md)
- **HubSpot Guide:** [docs/HUBSPOT_ESSENTIALS.md](../../../docs/HUBSPOT_ESSENTIALS.md)
- **Full Comparison:** [COMPARISON.md](../../../COMPARISON.md)

### 🐛 **Issues & Features**

- **Report bugs:** [GitHub Issues](https://github.com/RevPalSFDC/opspal-plugin-essentials/issues)
- **Request features:** [GitHub Issues](https://github.com/RevPalSFDC/opspal-plugin-essentials/issues)
- **Ask questions:** [GitHub Discussions](https://github.com/RevPalSFDC/opspal-plugin-essentials/discussions)

### 💬 **Community**

- **Discussions:** [GitHub Discussions](https://github.com/RevPalSFDC/opspal-plugin-essentials/discussions)
- **Examples:** Check the docs for real-world use cases
- **Contributing:** We welcome contributions! See [CONTRIBUTING.md](../../../CONTRIBUTING.md)

### 💼 **Professional Help**

Need more than the free tier provides?

- **Book a consultation:** [Free 30-minute call](https://calendly.com/revpal-engineering)
- **Email us:** engineering@gorevpal.com
- **Explore Professional:** [COMPARISON.md](../../../COMPARISON.md)

---

## Success Stories

### "Found 200 Unused Fields in 5 Minutes"

> "The discovery agent found issues I didn't know existed. Booked a consultation to orchestrate the cleanup - saved 40+ hours."
>
> — *Director of Sales Operations, SaaS Company*

### "Automated My Weekly Reports"

> "Used to spend 2 hours every Monday building reports. Now it's automated with sfdc-reports-dashboards. Game changer."
>
> — *Revenue Operations Analyst*

### "Learned RevOps Automation Fast"

> "As a new Salesforce admin, Essentials taught me best practices while automating my work. The agents guide you through proper patterns."
>
> — *Junior Salesforce Administrator*

---

## What's Next?

### 🎯 **Short Term (This Week)**

1. Connect your primary platform (Salesforce or HubSpot)
2. Run discovery to understand your current state
3. Try 3-5 basic operations (queries, reports, exports)
4. Create your first diagram or documentation

### 🚀 **Medium Term (This Month)**

1. Build automations for repetitive tasks
2. Create dashboards and reports
3. Clean up unused fields/properties
4. Document your key processes

### 📈 **Long Term (This Quarter)**

1. Optimize your data model
2. Standardize naming conventions
3. Build comprehensive documentation
4. Consider Professional Edition if you hit limitations

---

## Platform-Specific Getting Started

Ready to dive in? Choose your platform:

### 🔷 Salesforce
```
/getstarted (in salesforce-essentials plugin)
```

Or read: [Salesforce Getting Started Guide](../../salesforce-essentials/commands/getstarted.md)

### 🟠 HubSpot
```
/getstarted (in hubspot-essentials plugin)
```

Or read: [HubSpot Getting Started Guide](../../hubspot-essentials/commands/getstarted.md)

---

## You're Ready! 🎉

**Essentials gives you:**
- ✅ Professional-grade automation tools (free forever)
- ✅ 26 specialized agents at your fingertips
- ✅ Best practices built-in
- ✅ Active community support
- ✅ Clear upgrade path when you need more

**Start your journey:**
1. Choose a platform above
2. Follow the setup guide
3. Run your first automation
4. Join the community

**Questions?** We're here to help: engineering@gorevpal.com

---

**Happy automating!** 🚀
