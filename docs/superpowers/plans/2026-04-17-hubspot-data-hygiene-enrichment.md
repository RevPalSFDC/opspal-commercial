# HubSpot Data-Hygiene Enrichment: Junk Detection & Address Normalization

> **Status:** follow-up spec — run `superpowers:brainstorm` before writing implementation tasks.
> **Filed:** 2026-04-17
> **Origin:** reflection-remediation-2026-04-17 branch, Task 5

## Problem

The current HubSpot dedup and enrichment pipeline discovers junk contact and company records
reactively, one pattern at a time. Each dedup wave closes a gap that the previous wave missed,
but because junk detection is not systematic, users must manually flag new patterns (Exteriors,
Awning, After Hours, etc.) after every run. Additionally, web-scraping enrichment actively
introduces garbage: bot-detection interstitials ("robot challenge screen", "mysite",
"squarespace") end up stored as company names. A separate failure class is company-level
contacts (`info@`, `sales@`) whose business name populates person name fields, and domains from
free email providers (gmail, yahoo) used as a company's domain. Finally, address normalization
has a regex bug: multi-word cities such as San Luis Obispo and West Palm Beach are split
incorrectly, requiring manual cleanup passes.

## Source reflections

- `e84c385a`: "Iterative rather than comprehensive approach to junk detection. Each wave only covered patterns identified so far. User had to flag Exteriors, Awning, After Hours…" (org: Client-A, 2026-03-15)
- `867ce333`: "Web scraping enrichment phase created garbage company names from bot-detection pages ('jamestown fitness factory', 'robot challenge screen', 'client challenge', 'mysite', 'squarespace')" (org: Client-A, 2026-03-14)
- `e84c385a`: "HubSpot allows company-level contacts (info@, sales@) where the business name populates person name fields. Spam bots also pollute HubSpot databases. No single detection pass catches all patterns." (org: Client-A, 2026-03-15)
- `011c05a4`: "Body-regex address extraction captures raw text without delimiters; multi-word cities (San Luis Obispo, West Palm Beach) get split incorrectly. Required 3 cleanup passes." (org: Client-A, 2026-03-14)
- `011c05a4`: "Source HubSpot data contained free email domains as company domain names — these are not real companies" (org: Client-A, 2026-03-14)
- `a2f870b1`: Iterative junk detection anti-pattern also observed in aspireiq corpus — patterns missed in wave 1 reappear in later enrichment cycles (org: aspireiq, 2026-02-02)

## Target plugins

- `opspal-data-hygiene` (primary: owns junk detection catalog, address normalization logic)
- `opspal-hubspot` (consumer: enrichment scripts call into data-hygiene classifiers)

## Open questions for brainstorm

1. Should junk detection be a static catalog of known bad patterns maintained in config (easy to audit, requires human curation) or an LLM-driven classifier (catches novel patterns, harder to explain decisions to clients)?
2. What's the boundary between "junk" (auto-delete candidate) and "low-confidence" (flag for human review)? Is a confidence score the right primitive, or something coarser?
3. How do we prevent enrichment from re-introducing junk? Should the scraper validate output against the junk catalog before writing, or should there be a post-enrichment guard?
4. How do we retrofit existing dedup outputs that ran under the old wave-by-wave logic — is a re-run of the full detection pass safe, or does it risk re-opening already-merged records?

## Out of scope

- Salesforce-side contact junk detection (that's a separate `opspal-salesforce` concern)
- The HubSpot State/City field free-text normalization beyond address parsing (locale tables, abbreviation expansion)
- Dedup merge execution — this stub is about detection and classification, not merge orchestration

## Pre-requisites

- None blocking; can start independently of other stubs in this cohort

---
**Next step:** Run `superpowers:brainstorm` with this stub as input.
