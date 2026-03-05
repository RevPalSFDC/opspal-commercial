# Injection Priority

Prioritize injected context in this order:
1. org/environment identity and task risk class,
2. object/field/flow identifiers,
3. compact historical context,
4. verbose diagnostics only when budget remains.

Targets include context loader and metadata-manager pre-invocation hooks.
