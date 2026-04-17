# 5-Track Backlog Triage — 2026-04-17

**Context:** On 2026-03-17, 22 reflections were deferred with `deferred_until: 2026-03-24` as part of a "5-track remediation plan" (Track 1 data-quality, Track 2 schema/parse, Track 3 tool-contract, Track 4 external-api, Track 5 concurrency/idempotency). That date passed 3+ weeks ago without follow-through. This triage reviews each and re-routes it into one of four buckets.

**Source:** Supabase `reflections` table, `status=deferred AND deferred_reason contains "5-track"`.
**Span:** 2026-03-13 to 2026-03-17.
**Orgs:** Client-A (21), revpal-internal (1).
**Total root causes across all 22:** 85 (median ~4 per reflection).

**Supabase update:** 22/22 updated successfully using service role key. Verified with --verify pass immediately after. Note: anon key is read-only (RLS); `SUPABASE_SERVICE_ROLE_KEY` required for writes.

**Batch script:** `reports/scripts/batch-5track-triage-update-2026-04-17.js`

---

## Summary

| Bucket | Count | New Status |
|--------|-------|------------|
| resolved-by-phase-1 | 4 | `implemented` |
| needs-feature-plan | 8 | `accepted` |
| duplicate | 4 | `deferred` (Duplicate reason) |
| stale | 6 | `deferred` (Stale reason) |
| **Total** | **22** | |

---

## Classification

### resolved-by-phase-1 (4)

These reflections had routing-enforcement and output-path root causes directly closed by commits in `reflection-remediation-2026-04-17`.

| Reflection | Primary root cause | Closed by | Commit |
|------------|-------------------|-----------|--------|
| e685157c | MANDATORY routing blocks + env-var inheritance gap in hooks | Advisory-only routing migration | 55c9300 + 23e0449 |
| d3d8f764 | Routing bypass (direct SF query) + workspace-rooted output path | Advisory routing + observe hook path fix | 55c9300/23e0449 + 93e763f/434df1b |
| 64f2ff47 | Agent executed all report/dashboard phases directly instead of delegating | Advisory-only routing (sub-agent delegation no longer blocks) | 55c9300 |
| e84c385a | Agent ran Python data analysis directly instead of delegating to sub-agent | Advisory-only routing migration | 55c9300 |

### needs-feature-plan (8)

These reflections require substantive work that exceeds the scope of this branch. Each is routed to a Phase 5 follow-up plan stub.

| Reflection | Primary root cause | Target follow-up plan |
|------------|-------------------|----------------------|
| e2b86f4b | Analytics REST API chart-config absence, Tooling API soft-delete, MATRIX sort rejection, FLS auto-grant gap | `reports/plans/2026-04-17-salesforce-api-schema-gaps.md` |
| 4972466d | No redaction tooling for client→showcase artifact conversion | `reports/plans/2026-04-17-content-redaction-tooling.md` |
| cf4f30c1 | HubSpot v3 API operator vocabulary differences across Lists/Emails/Workflows | `reports/plans/2026-04-17-hubspot-api-operator-enrichment.md` |
| bc233c54 | Asana MCP tools in agent definition but unavailable in spawned sub-agent context | `reports/plans/2026-04-17-mcp-tool-availability-enforcement.md` |
| b3ce86e8 | Dedup methodology too conservative (blocks all cross-ID matches even with strong domain evidence) | `reports/plans/2026-04-17-cross-platform-dedup-methodology.md` |
| 867ce333 | Web scraping enrichment produces garbage names from bot-detection pages | `reports/plans/2026-04-17-cross-platform-dedup-methodology.md` |
| 011c05a4 | WSL2 file locking + multi-word city parsing failures + expired-domain garbage + free-email-as-domain | `reports/plans/2026-04-17-cross-platform-dedup-methodology.md` |
| 4194b290 | Puppeteer page.waitForTimeout removal + single-process crash + address parsing brittleness | `reports/plans/2026-04-17-cross-platform-dedup-methodology.md` |

**Phase 5 gap note:** Four of the eight `needs-feature-plan` reflections (b3ce86e8, 867ce333, 011c05a4, 4194b290) map to a new `cross-platform-dedup-methodology` plan that was not in the original 4-plan Phase 5 list (hubspot-data-hygiene, cross-platform-impact-analyzer, reflection-telemetry, wsl-tooling). The Phase 5 stub list needs expansion with this plan.

### duplicate (4)

| Reflection | Duplicates | Rationale |
|------------|-----------|-----------|
| 15175270 | 8304aba1 (primary) | Same root causes: SF Bulk API INSERT default, formula-field DML block, blank-cell upsert behavior, name-collision record matching |
| 53e4c274 | 8304aba1 (primary) | CSV upload execution gap and name-matched duplicate SF IDs are the same root cause cluster |
| e29b5d80 | 3ced6263 (primary) | Flow activation without field validation and VR referencing missing fields — same deployment/UAT gap |
| 8ed1c818 | 33c1d941 (primary) | Empty root_cause fields; flow execution order issues overlap with 33c1d941 Salesforce implementation cluster |

### stale (6)

| Reflection | Rationale |
|------------|-----------|
| 4e7a734e | Org-specific Python scorecard script with hardcoded args; one-time remediation applied inline; no general plugin pattern |
| 8304aba1 | Org-specific bulk import active-user constraint and name-collision matching; addressed by data-hygiene plugin guidance; serves as primary for 15175270/53e4c274 duplicates |
| be6bcc34 | Single-issue reflection: FlexiPage App Default requirement is well-documented Salesforce behavior, fixed inline during session |
| 9d642c3c 	| Tooling API PATCH full-Metadata + shell single-quote escaping + FLS visibility now documented in salesforce-metadata-standards and salesforce-query-safety-framework skills |
| 3ced6263 | Deployment batch ordering + flow XML variable concatenation fixed inline; flow-xml-lifecycle-framework skill captures systemic pattern |
| 33c1d941 | Flow XML element grouping, Layout XML naming, Forecast category mapping now covered by xml-roundtrip-fidelity-framework and salesforce-metadata-standards skills |

---

## Per-Reflection Detail

### resolved-by-phase-1

**e685157c** | Client-A | data-quality | 2026-03-16
Primary root cause: `unified-router.sh` defaulted `ENABLE_COMPLEXITY_HARD_BLOCKING=1`, causing false-positive hard blocks; env vars only read from inherited process env.
Bucket: `resolved-by-phase-1`
Commits: 55c9300 (advisory-only migration), 23e0449 (MANDATORY→SUGGESTED rename in pre-task-mandatory.sh)
Notes: The MANDATORY routing block pattern was removed; all routing is now advisory-only.

---

**d3d8f764** | Client-A | automation/configuration | 2026-03-13
Primary root cause: Agent executed SF data queries directly instead of delegating (routing bypass); plugin cache cwd differed from workspace root where .env lives; `FlowDefinition.ActiveVersionNumber` not a direct field.
Bucket: `resolved-by-phase-1`
Commits: 55c9300/23e0449 (routing advisory-only), 93e763f/434df1b (workspace-rooted output path for observe hook)
Notes: .env path gap is a follow-up concern; the blocking behavior was the primary.

---

**64f2ff47** | Client-A | reports-dashboards | 2026-03-17
Primary root cause: Agent executed all phases (discovery, report cloning, dashboard generation, folder operations) directly rather than delegating to specialist sub-agents. Secondary: Salesforce REST API asymmetric field naming (shareWithId/sharedWithId), folder DeveloperName uniqueness across hierarchy, boolean normalization.
Bucket: `resolved-by-phase-1`
Commit: 55c9300 — routing is now advisory-only; sub-agent delegation no longer blocked by mandatory enforcement.
Notes: API quirks (issues 1-4) are stale operational context; the delegation failure was the actionable root cause.

---

**e84c385a** | Client-A | data-quality | 2026-03-15
Primary root cause: Agent ran Python analysis directly instead of delegating to sfdc-data-operations sub-agent (routing bypass). Secondary: HubSpot State field free-text, pipe buffer truncation on large JSON.
Bucket: `resolved-by-phase-1`
Commit: 55c9300 — routing advisory-only; sub-agents now surfaced as suggestions not blockers.
Notes: Pipe buffer truncation is a separate operational concern; addressed in data hygiene enrichment plan.

---

### needs-feature-plan

**e2b86f4b** | Client-A | schema/parse | 2026-03-17
Primary root cause: Analytics REST API does not expose chart configuration; Tooling API cannot access soft-deleted CustomField records; MATRIX reports reject sortBy; FLS not auto-granted on deploy.
Bucket: `needs-feature-plan`
Plan: `reports/plans/2026-04-17-salesforce-api-schema-gaps.md`
Notes: All four issues require SF API knowledge enrichment in salesforce-metadata-standards skill and/or deployment-validation-framework updates.

---

**4972466d** | revpal-internal | content-curation | 2026-03-17
Primary root cause: No standardized redaction pipeline for converting client deliverables into anonymized showcase artifacts; regex name-replace misses API-name references.
Bucket: `needs-feature-plan`
Plan: `reports/plans/2026-04-17-content-redaction-tooling.md`
Notes: New capability required in opspal-core; no overlap with existing Phase 5 plans.

---

**cf4f30c1** | Client-A | hubspot-email-workflow-build | 2026-03-13
Primary root cause: Sub-agents lack internalized HubSpot v3 API operator vocabulary (IS_ANY_OF vs IS_EQUAL_TO, SET_NOT_ANY/IN_LIST, type vs subcategory) across Lists/Emails/Workflows.
Bucket: `needs-feature-plan`
Plan: `reports/plans/2026-04-17-hubspot-api-operator-enrichment.md`
Notes: 7 distinct API schema gaps across 3 HubSpot endpoints; requires skill enrichment in opspal-hubspot agent knowledge base.

---

**bc233c54** | Client-A | project-management/asana | 2026-03-13
Primary root cause: asana-task-manager agent definition lists mcp_asana_* tools but they are unavailable in the spawned sub-agent context; all 3 parallel agents silently fell back to Node.js scripts.
Bucket: `needs-feature-plan`
Plan: `reports/plans/2026-04-17-mcp-tool-availability-enforcement.md`
Notes: Relates to opspal-core:tool-contract-engineering; the silent fallback without surfacing an error to the user is the systemic concern.

---

**b3ce86e8** | Client-A | data-quality | 2026-03-14
Primary root cause: Dedup methodology blocked ALL matches where HubSpot Company IDs differed, even when domain evidence strongly suggested same entity. Also: FLS auto-grant gap (overlaps e2b86f4b), web scraping garbage.
Bucket: `needs-feature-plan`
Plan: `reports/plans/2026-04-17-cross-platform-dedup-methodology.md`
Notes: Confidence scoring algorithm in opspal-data-hygiene needs domain-evidence weighting above Company ID mismatch.

---

**867ce333** | Client-A | data-quality | 2026-03-14
Primary root cause: Web scraping enrichment produced garbage company names from bot-detection pages; initial dedup too conservative (same as b3ce86e8).
Bucket: `needs-feature-plan`
Plan: `reports/plans/2026-04-17-cross-platform-dedup-methodology.md`
Notes: Overlaps with b3ce86e8 on dedup methodology; bot-detection page filtering is a distinct sub-problem.

---

**011c05a4** | Client-A | data-quality | 2026-03-14
Primary root cause: WSL2-mounted filesystem reflects Windows file locks; multi-word city parsing failures (3 cleaning passes needed); expired/hijacked domains return garbage; free-email-as-company-domain not filtered.
Bucket: `needs-feature-plan`
Plan: `reports/plans/2026-04-17-cross-platform-dedup-methodology.md`
Notes: WSL2 file lock issue also appears in project_desktop_cli_parity memory; cross-cutting concern with platform detection.

---

**4194b290** | Client-A | data-quality | 2026-03-14
Primary root cause: `page.waitForTimeout` removed in newer Puppeteer; single browser process crash kills all tabs; naive comma-based address parsing fails on multi-word cities (29% of rows).
Bucket: `needs-feature-plan`
Plan: `reports/plans/2026-04-17-cross-platform-dedup-methodology.md`
Notes: Puppeteer architecture issues require robust scraping sub-system; address parsing overlaps with 011c05a4.

---

### duplicate

**15175270** | Client-A | data-quality | 2026-03-13
Primary root cause: `sf data import bulk` defaults to INSERT not UPDATE; Territory_Segment__c formula field cannot be set via DML; bulk upsert blanks fields with empty CSV cells; territory rules don't match Local Government segment.
Bucket: `duplicate` of `8304aba1`
Notes: Active-user ownership constraint in 8304aba1 is the same cluster; territory rules gap also in b3ce86e8.

---

**53e4c274** | Client-A | data-quality | 2026-03-13
Primary root cause: Owner reassignment CSVs generated but never uploaded; inactive SF users assigned; name-based matching produced duplicate SF record IDs; agent investigated instead of executing.
Bucket: `duplicate` of `8304aba1`
Notes: CSV upload and name-collision matching root causes are a strict subset of 8304aba1.

---

**e29b5d80** | Client-A | uat-testing | 2026-03-13
Primary root cause: Salesforce allows flow activation even when referenced fields don't exist; VRs can reference non-existent fields (ISBLANK(null) always true = deadlock); flow concatenates wrong variable.
Bucket: `duplicate` of `3ced6263`
Notes: Issues 1-2 are the same deployment/UAT activation gap in 3ced6263; issue 3 (variable concatenation) is also in 3ced6263.

---

**8ed1c818** | Client-A | [SFDC_ID] | 2026-03-16
Primary root cause: Empty root_cause fields — reflection was not fully populated. Issues mention GradientWorks afterInsert flow order, managed package not inspectable, no fault connectors.
Bucket: `duplicate` of `33c1d941`
Notes: Flow execution order and XML schema issues overlap with 33c1d941 Salesforce implementation cluster; empty root_causes suggest a data capture failure.

---

### stale

**4e7a734e** | Client-A | reporting/scorecard | 2026-03-16
Primary root cause: `get_active_ams()` only queries specific UserRole.Name patterns (misses Inside Sales Manager); `run-task.sh` hardcodes args without reading scheduler-config.json.
Bucket: `stale`
Rationale: Org-specific Python script bugs, fixed inline during session. No general plugin pattern warranted.

---

**8304aba1** | Client-A | data-quality | 2026-03-13
Primary root cause: Salesforce active-user ownership constraint on Bulk API; 4-step waterfall matching for name-collision handling; duplicate SF record IDs from name-based lookup.
Bucket: `stale`
Rationale: Org-specific bulk import constraints, fixed inline. Serves as primary for 15175270 and 53e4c274 duplicates. General pattern covered by data-hygiene plugin guidance.

---

**be6bcc34** | Client-A | deployment | 2026-03-13
Primary root cause: FlexiPage Org Default alone insufficient; App Default assignment also required for Lightning app rendering.
Bucket: `stale`
Rationale: Single-issue reflection; well-documented Salesforce behavior; fixed inline during session. No plugin change needed.

---

**9d642c3c** | Client-A | deployment/remediation | 2026-03-13
Primary root cause: Tooling API ValidationRule PATCH requires full Metadata compound field; shell single-quote escaping breaks ISPICKVAL formulas; source tracking marks undeployed fields as Unchanged; sf sobject describe hides fields due to FLS on connected user; Tooling API CustomField queries require EntityDefinition DurableId for custom objects.
Bucket: `stale`
Rationale: All five issues are now documented in `salesforce-metadata-standards` and `salesforce-query-safety-framework` skills. Org-specific source tracking cache issue was one-time. `feedback_tooling_api_customfield_columns` memory also captures the DurableId pattern.

---

**3ced6263** | Client-A | deployment/metadata | 2026-03-13
Primary root cause: Sub-agents used deploy source paths that included object-level metadata; Flow activation does not validate field references; VRs activated during UAT without confirming fields existed; flow text template uses wrong variable.
Bucket: `stale`
Rationale: Deployment batch ordering fixed inline; flow-xml-lifecycle-framework skill captures activation validation pattern; VR UAT process is operational guidance not plugin code.

---

**33c1d941** | Client-A | salesforce-implementation | 2026-03-13
Primary root cause: `<restricted>` element placement error in CustomField XML; Layout XML naming differences; Flow XML same-type element grouping requirement; `recordTriggerType` child vs sibling placement; self-referencing loop connector rejection; Forecast category XML enum mapping.
Bucket: `stale`
Rationale: All six XML schema quirks are now covered by `xml-roundtrip-fidelity-framework` and `salesforce-metadata-standards` skills. Org-specific deployment session; no open action items.

---

## Phase 5 Gap

The `needs-feature-plan` bucket revealed a fifth follow-up plan not in the original Phase 5 list:

| New Plan | Covering reflections | Description |
|----------|---------------------|-------------|
| `reports/plans/2026-04-17-cross-platform-dedup-methodology.md` | b3ce86e8, 867ce333, 011c05a4, 4194b290 | Dedup confidence-scoring overhaul, scraping architecture hardening (Puppeteer isolation), address parsing robustness, domain classification, WSL2 file lock handling |

Original Phase 5 plans (hubspot-data-hygiene, cross-platform-impact-analyzer, reflection-telemetry, wsl-tooling) should be augmented with this fifth stub.

---

## Supabase Update Record

- **Script:** `reports/scripts/batch-5track-triage-update-2026-04-17.js`
- **Auth note:** Anon key is read-only (RLS). Writes require `SUPABASE_SERVICE_ROLE_KEY`.
- **First attempt:** Used anon key — 22 PATCH calls returned HTTP 200 but 0 rows updated (RLS silent no-op).
- **Second attempt:** Used service role key — all 22 PATCH calls updated rows successfully.
- **Verification:** `--verify` pass confirmed all 22 show expected status in Supabase.
- **Fields updated per row:** `reflection_status`, `reviewed_at`, `reviewed_by`, and `implementation_notes` or `deferred_reason` + `deferred_until: null` (clears stale 2026-03-24 date).
