# Authentication Governance Standard

## Purpose

Define one cross-platform auth policy for Marketo, HubSpot, Salesforce, and UI-driven automation.

## Policy

1. API-first for production integrations.
2. UI authentication is fallback-only for API gaps or evidence capture.
3. Login/CAPTCHA/MFA steps are human-in-the-loop.
4. Session artifacts are local secrets and must stay under `instances/`.
5. Token/session details are redacted in logs.

## Approved Auth Methods by Mode

| Mode | Preferred | Allowed Fallback | Blocked |
|---|---|---|---|
| API | OAuth / service credentials | Manual re-auth during incident | Stored credentials in repo files |
| UI | Existing session state + manual checkpoint | Headed manual login then save state | CAPTCHA bypass / anti-bot evasion |
| Hybrid | API primary + UI checkpoint fallback | Temporary manual intervention | Unbounded automated login loops |

## Session Policy

- Default max session age: 24 hours
- Session file paths:
  - Salesforce: `instances/<org>/.salesforce-session.json`
  - HubSpot: `instances/<portal>/.hubspot-session.json`
  - Marketo UI fallback: `instances/<instance>/.marketo-session.json`
- Rotate sessions after privileged auth changes or incident response.

## Required Telemetry Fields

- `platform`
- `instance`
- `auth_method`
- `session_exists`
- `session_age_hours`
- `status`

## Block Conditions

- Missing auth for required mode
- Circuit open for auth calls
- Repeated token refresh failure
- Session policy violation for destructive UI operations
