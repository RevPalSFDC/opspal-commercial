# Operational Workflows and Incident Response

## Purpose

Provide step-by-step governance workflows for deployments, audits, and urgent incidents in Marketo.

## Workflow 1: Sandbox to Production Deployment (Program Import)

**Scenario**: A program is built in sandbox and must be promoted to production.

**Prerequisites**:
- Matching tags, channels, and fields in production
- Approval from governance owner

**Steps**:
1. **Preparation**
   - Confirm field and tag parity
   - Freeze changes in production for related assets
   - Document rollback plan

2. **Export Program (Sandbox)**
   - Marketing Activities > Program > Export
   - Save the .mkpx file

3. **Import Program (Production)**
   - Marketing Activities > Import Program
   - Map templates and missing assets
   - Exclude members unless required

4. **Verification**
   - Validate smart lists and filters
   - Confirm tokens and URLs
   - Check approval status for emails and landing pages

5. **Activation**
   - Activate triggers
   - Schedule batches
   - Run a test lead through the program

**Rollback**:
- Deactivate triggers
- Unschedule batches
- Remove test members and fix assets

**Evidence**:
- Import summary screenshot
- Test lead activity log

---

## Workflow 2: Routine Instance Health Audit (Quarterly)

**Scenario**: Quarterly audit to ensure governance compliance and instance health.

**Steps**:
1. Run `../assessments/quarterly-audit-procedure.md`
2. Capture evidence for user access, triggers, data quality, and sync health
3. Document remediation tasks and owners

**Evidence**:
- Quarterly report pack
- Remediation plan

**Operationalization**:
```
/marketo-governance-audit [instance] --mode=hybrid
```

---

## Workflow 3: Trigger Campaign Storm

**Scenario**: A trigger floods the system due to a bulk change.

**Steps**:
1. **Detect**
   - Campaign Queue shows backlog
   - Notifications show processing warnings

2. **Contain**
   - Deactivate the offending trigger(s)
   - Pause related campaigns if needed

3. **Diagnose**
   - Review recent imports or field changes
   - Check Audit Trail for recent changes

4. **Remediate**
   - Add constraints or convert to batch
   - Re-activate only after test validation

**Rollback**:
- Keep campaign inactive until logic is corrected
- Use a controlled batch to catch missed leads

**Evidence**:
- Campaign queue screenshots
- Audit Trail export

---

## Workflow 4: Emergency Halt of All Email Sends

**Scenario**: A live send must be stopped due to error or compliance issue.

**Steps**:
1. Identify send type (batch, trigger, engagement)
2. Abort batch campaign if running
3. Deactivate trigger campaigns sending the email
4. Unapprove the email asset if needed
5. Pause engagement program casts if applicable

**Rollback**:
- Re-approve corrected email
- Resume campaigns in controlled order

**Evidence**:
- Campaign status screenshots
- Email approval status

## Escalation Triggers

- Persistent queue backlog for > 2 hours
- Email sends with compliance risk
- Sync failures lasting > 1 hour

## Related Runbooks

- `../assessments/quarterly-audit-procedure.md`
- `../campaign-operations/trigger-campaign-best-practices.md`
- `../integrations/salesforce-sync-troubleshooting.md`
- `../campaign-diagnostics/README.md`
