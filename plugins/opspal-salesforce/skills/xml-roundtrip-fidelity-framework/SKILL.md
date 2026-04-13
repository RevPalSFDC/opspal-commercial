---
name: xml-roundtrip-fidelity-framework
description: Preserve Salesforce metadata XML semantic fidelity across parse, transform, and reserialization paths.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# XML Roundtrip Fidelity

## When to Use This Skill

Use this skill when:
- Parsing Salesforce metadata XML, transforming it, and reserializing for deployment
- Ensuring XML modifications don't introduce semantic drift (element ordering, namespace, encoding)
- Building scripts that programmatically edit Flow XML, layout XML, or profile XML
- Debugging deployment failures caused by XML corruption during automated transforms

**Not for**: Flow XML authoring (use `flow-xml-lifecycle-framework`), manifest governance (use `package-xml-manifest-governance-framework`), or general deployment (use `deployment-validation-framework`).

## Roundtrip Fidelity Rules

| Rule | Description |
|------|-------------|
| **Preserve element order** | Salesforce XML is order-sensitive — reordering `<decisions>` elements changes Flow behavior |
| **Preserve whitespace in text nodes** | CDATA and text content must not be trimmed |
| **Preserve XML declaration** | Always keep `<?xml version="1.0" encoding="UTF-8"?>` |
| **Namespace preservation** | Keep `xmlns="http://soap.sforce.com/2006/04/metadata"` on root element |
| **No attribute reordering** | While XML spec allows it, some Salesforce tools are sensitive to attribute order |
| **Encoding consistency** | Always output UTF-8; never introduce BOM or encoding changes |

## Common Corruption Patterns

| Pattern | Cause | Prevention |
|---------|-------|-----------|
| Missing namespace | Regex-based XML editing strips xmlns | Use DOM parser, not regex |
| Element duplication | Append without checking if element exists | Query before insert |
| Empty text nodes | Trim operation removes whitespace-only content | Preserve original whitespace |
| BOM insertion | Editor or tool adds UTF-8 BOM | Use `--no-bom` flags or strip in pipeline |

## Verification Pattern

```bash
# Retrieve original, transform, compare
sf project retrieve start --metadata "Flow:My_Flow" --target-org <org> --output-dir ./original/
cp -r ./original/ ./modified/
# ... apply transforms to modified/ ...
diff -r ./original/ ./modified/  # Should show ONLY intentional changes
```

## Workflow

1. Always use a DOM parser (not regex) for XML transforms
2. Compare pre/post transform to verify only intended changes
3. Validate transformed XML can be deployed (`--dry-run`)
4. Preserve encoding, namespace, and element ordering

## References

- [Parse Contract](./parse-contract.md)
- [Transform Invariants](./transform-invariants.md)
- [Roundtrip Verification](./roundtrip-verification.md)
