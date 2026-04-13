---
name: trigger-development-framework
description: Salesforce Apex trigger development lifecycle for design, handler architecture, bulkification, testing, deployment, and troubleshooting. Use when building or modifying triggers beyond basic references, especially for production-safe rollout.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Trigger Development Framework

## When to Use This Skill

Use this skill when:
- Building a new Apex trigger for any Salesforce object
- Implementing the one-trigger-per-object handler pattern
- Ensuring trigger logic is bulk-safe (200+ records per batch)
- Troubleshooting trigger execution order conflicts with Flows
- Writing test classes for trigger coverage (75% minimum for production)

**Not for**: Declarative validation rules (use `validation-rule-patterns`), Flow development (use `flow-xml-lifecycle-framework`), or general Apex development (use `sfdc-apex-developer` agent).

## One-Trigger-Per-Object Pattern

```
MyObject_Trigger.trigger → MyObjectTriggerHandler.cls → Domain logic classes
```

| Component | Responsibility |
|-----------|---------------|
| **Trigger** | Dispatches to handler; no logic here |
| **Handler** | Routes to methods by context (before/after, insert/update/delete) |
| **Logic classes** | Actual business logic, testable independently |

## Execution Order

Salesforce executes automations in this order on a record save:
1. Before-save record-triggered Flows
2. System validation rules
3. Before triggers (Apex)
4. Custom validation rules
5. After triggers (Apex)
6. Assignment rules, escalation rules
7. After-save record-triggered Flows
8. Workflow rules (legacy)
9. Processes (legacy)

## Bulkification Rules

| Pattern | Wrong | Right |
|---------|-------|-------|
| SOQL in loop | `for(Account a : Trigger.new) { query... }` | Query before loop, use Map |
| DML in loop | `for(Account a : Trigger.new) { update... }` | Collect in List, single DML |
| Hardcoded IDs | `if(a.OwnerId == '005...')` | Use Custom Metadata or Custom Settings |

## Testing Requirements

```apex
@IsTest
static void testBulkInsert() {
    // Always test with 200+ records to verify bulkification
    List<Account> accounts = new List<Account>();
    for (Integer i = 0; i < 200; i++) {
        accounts.add(new Account(Name = 'Test ' + i));
    }
    Test.startTest();
    insert accounts;
    Test.stopTest();
    // Assert expected outcomes
}
```

## Workflow

1. Create trigger file dispatching to handler (no inline logic)
2. Implement handler with recursion guard (`static Boolean hasRun`)
3. Write bulk-safe logic (no SOQL/DML in loops)
4. Test with 200+ record batches, negative cases, and mixed DML
5. Deploy with `RunSpecifiedTests` targeting trigger test classes

## Routing Boundaries

Use this skill when trigger architecture, rollout safety, or troubleshooting is required.
Use `validation-rule-patterns` for declarative validation-only work.
Use `flow-segmentation-guide` or `flow-xml-lifecycle-framework` for Flow implementation.

## References

- [fundamentals](./fundamentals.md)
- [handler architecture](./handler-architecture.md)
- [bulkification and testing](./bulkification-testing.md)
- [deployment and troubleshooting](./deployment-troubleshooting.md)
