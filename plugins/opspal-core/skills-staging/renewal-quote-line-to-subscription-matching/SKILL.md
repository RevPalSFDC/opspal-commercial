---
name: renewal-quote-line-to-subscription-matching
description: "When quote lines have null SBQQ__RenewedSubscription__c, match them to contract subscriptions by product ID. Query both the quote lines (with [COMPANY]__c) and the contract subscriptions (with [COMPANY]__c), then pair them by matching product. Handle edge cases: new products with no prior subscription (skip), and multiple subscriptions for the same product (match by quantity or subscription number)."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-salesforce:sfdc-cpq-assessor
---

# Renewal Quote Line To Subscription Matching

When quote lines have null SBQQ__RenewedSubscription__c, match them to contract subscriptions by product ID. Query both the quote lines (with [COMPANY]__c) and the contract subscriptions (with [COMPANY]__c), then pair them by matching product. Handle edge cases: new products with no prior subscription (skip), and multiple subscriptions for the same product (match by quantity or subscription number).

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. When quote lines have null SBQQ__RenewedSubscription__c, match them to contract subscriptions by product ID
2. Query both the quote lines (with [COMPANY]__c) and the contract subscriptions (with [COMPANY]__c), then pair them by matching product
3. Handle edge cases: new products with no prior subscription (skip), and multiple subscriptions for the same product (match by quantity or subscription number)

## Source

- **Reflection**: 3d9302ff-b7d3-4c58-908d-acfecfd4a827
- **Agent**: sfdc-cpq-assessor
- **Enriched**: 2026-04-03
