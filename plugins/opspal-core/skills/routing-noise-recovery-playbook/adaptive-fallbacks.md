# Adaptive Fallbacks

When low signal + high noise is detected:
- Bypass strict reject flows where safe.
- Route via adaptive continue fallback.
- Emit reason tags for observability.

Fallbacks must be reversible by tightening threshold env vars.
