# Metric Change Policy

## Purpose

Prevent metric sprawl and untracked semantic changes by enforcing a structured change policy.

## Semantic Versioning

- **MAJOR**: Meaning change (breaks comparisons).
  - Example: ARR definition changes numerator/denominator or inclusion rules.
- **MINOR**: Additive metadata or new dimensions.
  - Example: new allowed fallback field or new segment dimension.
- **PATCH**: Documentation or clarification only.
  - Example: wording updates, no calculation changes.

## Change Requirements

Every proposed metric change must include:

1. **metricId**
2. **Definition update** (numerator/denominator, inclusion/exclusion)
3. **Required objects/fields** and allowed fallbacks
4. **Validation tests** (sample queries + expected values)
5. **Owner + governance tier**
6. **Impact analysis** (who uses it, dashboards affected)

## Governance Tiers

- **Tier 0 (Personal)**: Minor changes allowed with logging.
- **Tier 1 (Team)**: Requires team lead review.
- **Tier 2 (Exec/Finance)**: Requires RevOps + Finance review.
- **Tier 3 (System-of-Record)**: Requires governance council + versioned rollout.

## Approval Checklist

- [ ] Semantics defined and tested
- [ ] Drift impact analyzed
- [ ] Affected reports/dashboards listed
- [ ] Deprecation plan included (if replacing)
