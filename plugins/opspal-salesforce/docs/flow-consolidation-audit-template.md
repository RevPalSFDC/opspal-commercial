# Flow Consolidation Audit Template

## Objective

Verify that subscription interval stamping logic covers every opportunity motion, not just renewals.

## Required Opportunity Types

- Renewal
- New Business
- Upsell
- Downgrade

## Discovery Queries

```bash
sf data query --query "SELECT Id, DeveloperName, Status, ProcessType FROM FlowDefinitionView WHERE DeveloperName LIKE '%Subscription%' OR DeveloperName LIKE '%Interval%'" --use-tooling-api --target-org <org>
```

```bash
sf data query --query "SELECT Id, Name, Type FROM Opportunity WHERE Type IN ('Renewal','New Business','Upsell','Downgrade') LIMIT 200" --target-org <org>
```

## Audit Checklist

- Identify every active Flow that stamps subscription interval fields.
- Confirm each Flow (or one consolidated Flow) handles `Renewal`, `New Business`, `Upsell`, and `Downgrade`.
- Confirm the stamping path is not isolated to a single record-trigger entry condition.
- Confirm downstream field updates use one canonical interval source.
- Confirm test evidence exists for all four opportunity types.

## Verification Notes

- If multiple flows stamp the same interval field, prefer consolidation or explicit ownership boundaries.
- If one motion type is intentionally excluded, document the reason and the compensating process.
- Save audit output under `instances/{org}/flow-consolidation-audit/`.
