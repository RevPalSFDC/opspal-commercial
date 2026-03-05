# OPSPAL Plugin Architecture Restructuring Proposal

## 1. Executive Summary
This proposal outlines a strategic restructuring of the `opspal-internal-plugins` repository. Based on feedback, we are moving to a **Tiered Capability Model** (Low/Medium/High). This allows users to install a lightweight "Core" for general tasks while reserving heavy automation and architectural tools for specialized tiers.

The goal is to transition from a flat collection of plugins to a structure where **Core** acts as the generalist (similar to the current `cross-platform-plugin`), and specialized plugins offer deepened tiers of capability.

## 2. Current State Analysis
Currently, the ecosystem consists of independent plugins (defined in `marketplace-catalog.json`) that often bundle their own utility scripts and dependencies.
- **Redundant Utilities:** Logging, configuration, and project management logic are scattered.
- **`cross-platform-plugin` Identity:** Currently acts as a catch-all for Asana, Diagrams, and PDF generation, but lacks a formalized role as the "Base OS".
- **Binary Capability:** You either have the full Salesforce plugin (75+ agents) or nothing. There is no "light" mode for generalists who just need to look up an Account.

## 3. Proposed Architecture: The "Low / Medium / High" Tier Model

We propose organizing capabilities by depth of access and complexity.

### Tier 1: OPSPAL Core (The "Low" Tier)
*Equivalent to: Current `cross-platform-plugin` + Light CRM.*

The "Operating System" for all agents. It provides general productivity tools and **light, read-heavy connectivity** to platforms.

**Core Capabilities:**
*   **Productivity & Outputs:**
    *   Diagram Generation (Mermaid/Lucid).
    *   PDF Report Generation.
    *   Task Management (Asana/Jira wrappers).
*   **AI Services:**
    *   AI Consultation (Gemini/Claude synthesis).
*   **Light CRM (The "Low Tier" Dusters):**
    *   *Salesforce Light:* `sfdc-cli-executor` (basic shell), `sfdc-query-specialist` (read-only data fetching), `sfdc-csv-enrichment`.
    *   *HubSpot Light:* Simple Contact/Company lookups, basic "read" access to verify data.
    *   *Goal:* Allow an agent to say "I found this Account in Salesforce" without needing the power to deploy metadata.

### Tier 2: Standard Platform Providers (The "Medium" Tier)
*Equivalent to: The standard working sets of `salesforce-plugin` and `hubspot-plugin`.*

For day-to-day Administration, Development, and Operations. This is the "Workhorse" tier.

*   **`@opspal/salesforce-standard`**
    *   *Focus:* Metadata management, Flow creation, Field creation, Layout adjustments.
    *   *Agents:* `sfdc-metadata-manager`, `flow-builder`, `sfdc-admin`.
*   **`@opspal/hubspot-standard`**
    *   *Focus:* Workflow automation, Email campaigns, Content/CMS publishing.
    *   *Agents:* `hubspot-workflow-builder`, `hubspot-cms-manager`.
*   **`@opspal/marketo-standard`**
    *   *Focus:* Campaign creation, Email blast management.

### Tier 3: Enterprise & Advanced Solutions (The "High" Tier)
*Equivalent to: Specialized Solution Plugins + Deep Architectural Agents.*

For Architects, complex migrations, and high-stakes planning. These depend on the lower tiers but add heavy logic.

*   **`@opspal/salesforce-enterprise`**
    *   *Focus:* **CPQ** configuration (`sfdc-cpq-specialist`), **Deep Audits** (`sfdc-architecture-auditor`), **Data Migrations** (Merge orchestrators).
*   **`@opspal/gtm-strategy`**
    *   *Focus:* Annual Planning, Territory Design, Quota Modeling.
    *   *Dependency:* Uses "High Tier" data capabilities to analyze full historical trends.
*   **`@opspal/revenue-intelligence`**
    *   *Focus:* Deep funnel diagnostics, Attribution modeling (Multi-touch), Cross-platform deduplication (`data-hygiene`).

## 4. Implementation Plan

### Phase 1: Core Consolidation ("Low Tier")
1.  **Refactor `cross-platform-plugin` into `@opspal/core`:**
    *   Standardize the `Asana` and `PDF` tools.
2.  **Extract "Light" Agents:**
    *   Move `sfdc-cli-executor` and `sfdc-query-specialist` from `salesforce-plugin` into `Core`.
    *   Create a generic `hubspot-reader` agent for Core.

### Phase 2: Platform Segmentation ("Medium Tier")
1.  **Refine `salesforce-plugin`:**
    *   Remove the "Light" agents moved to Core.
    *   Identify "High Tier" agents (CPQ, Architecture) for potential separation.
2.  **Refine `hubspot-plugin`:**
    *   Ensure standard workflow/content agents are robust and separated from "Revenue Intelligence" deep dives.

### Phase 3: Advanced Modules ("High Tier")
1.  **Formalize Solution Plugins:**
    *   Ensure `gtm-planning` explicitly requests High Tier permissions/agents.
    *   Group complex auditors (RevOps Auditor, Architecture Auditor) into the Enterprise tier to keep the Standard tier lightweight and fast.

## 5. Benefits of this Approach
*   **Performance:** Loading "Core" is fast and cheap. Generalist agents don't need to load 75 Salesforce definitions just to write a PDF.
*   **Safety:** "Low Tier" access prevents accidental metadata destruction by generalist agents.
*   **Clarity:** "Medium Tier" is for doing the work. "High Tier" is for planning the work and fixing the architecture.
