---
name: okr-benchmark-calibration
description: Benchmark calibration method for OKR targets using revops KPI definitions adjusted for stage, momentum, and GTM model. Use when testing whether targets are stretched, sandbagged, or appropriately calibrated before approval.
allowed-tools: Read, Grep, Glob
---

# OKR Benchmark Calibration

## When to Use This Skill

- Benchmarking a proposed OKR target or initiative assumption
- Stress-testing whether a target is too easy or too aggressive
- Adjusting peer comparisons for stage, GTM model, or current momentum
- Explaining why a target is above, within, or below peer range

## Core Principle

Benchmarks are context, not truth. Always compare the org’s actual baseline to peer ranges before using the benchmark to calibrate a target.

## Calibration Inputs

Read these inputs together:

- Company stage
- GTM model
- ACV tier
- Recent momentum or trend direction
- Data quality and freshness

## Calibration Sequence

1. Identify the canonical metric in `revops-kpi-definitions.json`
2. Pull the peer range relevant to stage, GTM model, and ACV tier
3. Compare the org’s actual baseline to the peer range
4. Adjust the target posture based on momentum:
   - weakening momentum -> lower confidence and tighter stretch
   - stable momentum -> normal calibration
   - strong momentum -> allow more aggressive stretch if evidence supports it
5. Label the result:
   - `sandbagged`
   - `within_range`
   - `stretched_but_supported`
   - `unsupported_moonshot`

## Momentum Adjustment Guidance

| Momentum | Calibration Effect |
|----------|--------------------|
| Deteriorating | Bias toward conservative/base stance unless recovery levers are proven |
| Flat | Stay close to benchmark-informed base stance |
| Improving | Allow higher stretch if the driver is durable and evidence-backed |

## Warning Signs

- Benchmark segment does not actually match the company profile
- Benchmark is cited without a real org baseline
- The target sits above P90 with no evidence for why
- A vanity or activity metric is being compared as if it were an outcome metric

## References

- KPI catalog: `../../opspal-core/config/revops-kpi-definitions.json`
- Initiative scoring: `skills/initiative-scoring-methodology/SKILL.md`
- OKR methodology: `skills/okr-methodology-framework/SKILL.md`
