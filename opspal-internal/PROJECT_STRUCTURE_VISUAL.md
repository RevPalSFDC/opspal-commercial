# 🏗️ RevPal Multi-Platform Project Structure

## 📊 Visual Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     RevPal Agent System                             │
│                   Multi-Customer Platform                           │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        platforms/                                    │
│                   (Central Hub Directory)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │   instance-      │  │  agent-registry  │  │     MULTI_       │ │
│  │  pairings.json   │  │      .json       │  │   CUSTOMER_      │ │
│  │                  │  │                  │  │ ARCHITECTURE.md  │ │
│  │  8 Customers     │  │  19 Agents       │  │                  │ │
│  │  15 SF Instances │  │  Categorized     │  │  Documentation   │ │
│  │  3 HS Instances  │  │  Registry        │  │                  │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                    │                │                │
        ┌───────────┴──────┐ ┌──────┴──────┐ ┌──────┴──────────┐
        ▼                  ▼              ▼                    ▼
```

## 🗂️ Detailed Directory Structure

```
/home/chris/Desktop/RevPal/Agents/
├── 📁 platforms/                           🌐 PLATFORM HUB
│   │
│   ├── 📄 instance-pairings.json          🔗 Customer Registry
│   ├── 📄 agent-registry.json             🤖 Agent Catalog
│   ├── 📄 MULTI_CUSTOMER_ARCHITECTURE.md  📚 Architecture Guide
│   ├── 📄 PROJECT_STRUCTURE_VISUAL.md     📊 This Document
│   │
│   ├── 📁 SFDC/                           ☁️ SALESFORCE PLATFORM
│   │   ├── 📁 instances/                  💼 Customer Instances
│   │   │   ├── 📁 rentable-production/
│   │   │   ├── 📁 rentable-sandbox/
│   │   │   ├── 📁 wedgewood-production/
│   │   │   ├── 📁 wedgewood-uat/
│   │   │   ├── 📁 wedgewood-sandbox/
│   │   │   ├── 📁 peregrine-main/
│   │   │   ├── 📁 peregrine-staging/
│   │   │   ├── 📁 revpal-production/
│   │   │   ├── 📁 neonone/
│   │   │   ├── 📁 bluerabbit2021-revpal/
│   │   │   └── 📁 opspal/
│   │   ├── 📁 .claude/
│   │   │   └── 📁 agents/                 🤖 SF-Specific Agents
│   │   ├── 📁 scripts/                    🔧 SF Tools
│   │   ├── 📁 docs/                       📚 SF Documentation
│   │   └── 📄 CLAUDE.md                   📋 SF Guidelines
│   │
│   ├── 📁 HS/                             🎯 HUBSPOT PLATFORM
│   │   ├── 📁 instances/                  💼 Customer Instances
│   │   │   ├── 📁 rentable/
│   │   │   ├── 📁 filmhub/
│   │   │   └── 📁 revpal-production/
│   │   ├── 📁 .claude/
│   │   │   └── 📁 agents/                 🤖 HS-Specific Agents
│   │   ├── 📁 scripts/                    🔧 HS Tools
│   │   └── 📄 CLAUDE.md                   📋 HS Guidelines
│   │
│   └── 📁 cross-platform-ops/             🔄 CROSS-PLATFORM HUB
│       ├── 📁 lib/                        📚 Core Libraries
│       │   └── 📄 instance-context-manager.js  ✨ NEW: Context Manager
│       ├── 📁 cli/                        🖥️ Command Line Interface
│       │   ├── 📄 xplat-cli.js
│       │   └── 📄 customer-commands.js    ✨ NEW: Customer CLI
│       ├── 📁 core/                       🎯 Core Modules
│       │   ├── 📁 connectors/
│       │   └── 📁 data-models/
│       ├── 📁 modules/                    🔧 Operation Modules
│       ├── 📁 scripts/                    🔨 Utility Scripts
│       ├── 📁 reports/                    📊 Operation Reports
│       ├── 📄 .env.template               ✨ ENHANCED: Multi-Customer
│       ├── 📄 .env.rentable-production
│       ├── 📄 package.json
│       └── 📄 INSTANCE_AGNOSTIC_FRAMEWORK.md
│
├── 📁 .claude/                            🤖 GLOBAL AGENTS
│   ├── 📁 agents/
│   │   ├── 📄 release-coordinator.md
│   │   ├── 📄 project-orchestrator.md
│   │   └── ... (15 core agents)
│   └── 📄 AGENT_REMINDER.md
│
└── 📄 CLAUDE.md                           📋 Master Guidelines
```

## 🔗 Instance Pairing Visualization

```
┌────────────────────────────────────────────────────────────────────┐
│                     CUSTOMER INSTANCE PAIRINGS                      │
└────────────────────────────────────────────────────────────────────┘

RENTABLE (Active - Full Sync)
├── Production: [SF: rentable-production] ←→ [HS: rentable] ✅ SYNC
└── Sandbox:    [SF: rentable-sandbox]    ←→ [HS: rentable] ❌ NO SYNC

REVPAL (Active - Full Sync)
└── Production: [SF: revpal-production] ←→ [HS: revpal-production] ✅ SYNC

WEDGEWOOD (Active - SF Only)
├── Production: [SF: wedgewood-production] → No HubSpot
├── UAT:        [SF: wedgewood-uat]        → No HubSpot
└── Sandbox:    [SF: wedgewood-sandbox]    → No HubSpot

PEREGRINE (Active - SF Only)
├── Main:       [SF: peregrine-main]       → No HubSpot
└── Staging:    [SF: peregrine-staging]    → No HubSpot

FILMHUB (Active - HS Only)
└── Production: No Salesforce ← [HS: filmhub]

NEONONE (Active - SF Only)
└── Production: [SF: neonone] → No HubSpot

BLUERABBIT (Active - SF Only)
└── Production: [SF: bluerabbit2021-revpal] → No HubSpot

OPSPAL (Maintenance - SF Only)
└── Production: [SF: opspal] → No HubSpot
```

## 🎯 Component Interactions

```
┌─────────────────────────────────────────────────────────────┐
│                    xplat CLI Interface                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Instance Context Manager                       │
│                                                              │
│  • switchContext(customer, environment)                     │
│  • validatePairing()                                        │
│  • loadEnvironmentFiles()                                   │
│  • getCurrentContext()                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
        ┌──────────────┐ ┌──────────┐ ┌────────────┐
        │ Instance     │ │  .env    │ │ Customer   │
        │ Pairings     │ │  Files   │ │ Workspaces │
        │   Registry   │ │          │ │            │
        └──────────────┘ └──────────┘ └────────────┘
```

## 📈 Statistics Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│                    PLATFORM STATISTICS                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Customers:     ████████████████████ 8 Total                │
│                 ███████████████████  7 Active               │
│                 ██                   1 Maintenance          │
│                                                              │
│  Salesforce:    ███████████████████  7 Customers            │
│                 ████████████████████ 15 Instances           │
│                                                              │
│  HubSpot:       ████████             3 Customers            │
│                 ████████             3 Instances            │
│                                                              │
│  Both Platforms:████                 2 Customers            │
│  Sync Enabled:  ████                 2 Pairings            │
│                                                              │
│  Environments:                                              │
│  ├── Production ████████████████████ 8                      │
│  ├── Sandbox    ████                 2                      │
│  ├── UAT        ██                   1                      │
│  └── Staging    ██                   1                      │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow Architecture

```
User Request
     │
     ▼
┌─────────────┐
│  xplat CLI  │
└─────────────┘
     │
     ▼
┌─────────────────────────────┐
│  Customer Context Manager    │──────→ Load Customer Config
└─────────────────────────────┘              │
     │                                        ▼
     ▼                              ┌──────────────────┐
┌─────────────────────────────┐    │ .env.customer-   │
│  Operation Selection        │◄───│    environment   │
└─────────────────────────────┘    └──────────────────┘
     │
     ├──────────────┬──────────────┐
     ▼              ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│Salesforce│ │ HubSpot  │ │  Cross-  │
│Operations│ │Operations│ │ Platform │
└──────────┘ └──────────┘ └──────────┘
     │              │              │
     └──────────────┴──────────────┘
                    │
                    ▼
            ┌──────────────┐
            │   Results    │
            │   & Logs     │
            └──────────────┘
```

## 🚀 Quick Command Reference

```bash
# Customer Management
xplat customer list                    # List all customers
xplat customer switch rentable prod    # Switch context
xplat customer status                  # Current context
xplat customer validate wedgewood uat  # Validate pairing
xplat customer info filmhub           # Customer details
xplat customer stats                   # Platform statistics

# Operations (Context-Aware)
xplat dedupe -p salesforce            # Run on current context
xplat sync -d sf-to-hs                # Sync current pairing
xplat analyze -p both                 # Analyze both platforms

# Environment Management
export CURRENT_CUSTOMER=rentable      # Set via env
export CURRENT_ENVIRONMENT=production # Set environment
```

## 🔒 Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      Security Architecture                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: Customer Isolation                                │
│  ├── Separate .env files per customer-environment           │
│  └── No cross-customer data access                          │
│                                                              │
│  Layer 2: Credential Management                             │
│  ├── Environment-specific API keys                          │
│  └── OAuth tokens isolated per instance                     │
│                                                              │
│  Layer 3: Access Control                                    │
│  ├── Environment restrictions (prod vs sandbox)             │
│  └── Operation permissions per customer                     │
│                                                              │
│  Layer 4: Audit Trail                                       │
│  ├── Context switch logging                                 │
│  └── Operation tracking per customer                        │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Configuration Hierarchy

```
1. Instance Pairing Registry (instance-pairings.json)
                    │
                    ▼
2. Customer Context (.current-context.json)
                    │
                    ▼
3. Environment Files (.env.customer-environment)
                    │
                    ▼
4. Platform Configs (SFDC/HS specific)
                    │
                    ▼
5. Operation Execution
```

---

*Visual representation of RevPal Multi-Platform Architecture v1.0*
*Generated: 2025-09-21*