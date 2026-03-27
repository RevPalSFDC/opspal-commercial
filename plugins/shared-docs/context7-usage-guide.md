# Context7 Usage Guide

Use Context7 when the task depends on current library or platform documentation and the agent declares a Context7 tool.

## When To Use It

- Validate current API signatures, flags, limits, or syntax
- Confirm framework or SDK behavior before generating code or metadata
- Pull canonical examples instead of relying on memory for fast-moving docs

## Working Rules

- Query Context7 before inventing undocumented behavior.
- Prefer short, targeted lookups tied to the exact feature you are implementing.
- Summarize the retrieved guidance in your own words before applying it.
- Do not claim Context7 validated a behavior unless you actually queried it.

## Output Expectations

- Name the doc or topic consulted
- State the specific constraint or example you used
- Call out any uncertainty that still requires local verification
