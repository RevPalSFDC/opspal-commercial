{{> header}}

## Platform Overview

{{#if platformDescription}}
{{platformDescription}}
{{else}}
This Salesforce instance runbook documents operational patterns, workflows, and known exceptions. Run operations and use `/reflect` to populate this runbook with institutional knowledge.
{{/if}}

---

{{> data-model}}

---

{{> workflows}}

---

{{#if hasLeadLifecycle}}
{{> lead-lifecycle}}

---

{{/if}}
{{#if hasOpportunityPipeline}}
{{> opportunity-pipeline}}

---

{{/if}}
{{#if hasDataQualityRules}}
{{> data-quality}}

---

{{/if}}
{{#if hasIntegrations}}
{{> integrations}}

---

{{/if}}
{{#if hasUserAccessComplexity}}
{{> user-access}}

---

{{/if}}
{{#if hasCPQ}}
{{> cpq}}

---

{{/if}}
{{#if hasServiceCloud}}
{{> service-cloud}}

---

{{/if}}
{{> exceptions}}

---

{{> recommendations}}

---

{{> footer}}
