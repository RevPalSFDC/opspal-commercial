{{> header}}

## Platform Overview

{{#if platformDescription}}
{{platformDescription}}
{{else}}
This HubSpot portal runbook documents operational patterns, workflows, and known exceptions. Run operations and use `/reflect` to populate this runbook with institutional knowledge.
{{/if}}

---

{{> data-model}}

---

{{> workflows}}

---

{{#if hasContactLifecycle}}
{{> contact-lifecycle}}

---

{{/if}}
{{#if hasDealPipeline}}
{{> deal-pipeline}}

---

{{/if}}
{{#if hasMarketingAutomation}}
{{> marketing-automation}}

---

{{/if}}
{{#if hasContentStrategy}}
{{> content}}

---

{{/if}}
{{#if hasIntegrations}}
{{> integrations}}

---

{{/if}}
{{> exceptions}}

---

{{> recommendations}}

---

{{> footer}}
