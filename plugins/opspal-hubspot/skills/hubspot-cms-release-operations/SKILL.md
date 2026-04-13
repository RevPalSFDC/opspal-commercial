---
name: hubspot-cms-release-operations
description: Operate hook workflows for HubSpot CMS release readiness, publish controls, and post-publish telemetry/notifications.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-cms-release-operations

## When to Use This Skill

- Running prepublish validation gates before a HubSpot CMS page or blog post goes live (SEO checks, broken link scan, template validation)
- Hooking into the `cms-publish-page` command lifecycle to enforce brand/compliance guardrails before content is pushed to production
- Capturing post-publish telemetry — page publish timestamps, author, portal ID — for audit and notification pipelines
- Managing release force/bypass when a content owner needs to skip a non-critical gate (e.g., publish before SEO score threshold is met)
- Coordinating multi-page release batches where ordering and rollback must be tracked

**Not for**: CMS theme development, HubDB schema changes, or SEO content optimization (use `hubspot-seo-framework`).

## Prepublish Gate Reference

| Gate | Tool/Script | Blocking | Bypass Flag |
|---|---|---|---|
| Broken link scan | `scripts/seo-broken-links.js` | Yes | `--skip-links` |
| SEO score >= 60 | `scripts/seo-audit.js` | Warn | `--force-publish` |
| Template validation | HubSpot CLI `hs upload --validate` | Yes | None |
| Brand copy check | `scripts/cms-brand-validator.sh` | Warn | `--bypass-brand` |
| Redirect conflict | `scripts/redirect-conflict-check.js` | Yes | None |

## Workflow

1. **Intercept the publish trigger** — hook fires on `cms-publish-page` or `cms-launch-site` command. Parse the page ID and portal ID from the hook event JSON.
2. **Run prepublish gates sequentially** — execute each gate script; collect pass/fail/warn status. A single blocking failure halts publishing and emits an actionable error to stderr.
3. **Evaluate bypass flags** — if `--force-publish` is present, log the bypass with operator identity and skip warn-level gates only. Blocking gates cannot be bypassed.
4. **Publish via HubSpot CMS API** — call `POST /cms/v3/pages/{pageId}/publish` or invoke `hs upload` for theme assets. Capture the response `publishedAt` timestamp.
5. **Emit post-publish telemetry** — write a JSON record `{pageId, portalId, publishedAt, gates, bypasses, operator}` to `logs/cms-release-history.jsonl`.
6. **Send notifications** — if `SLACK_WEBHOOK_URL` is set, POST a release summary; if email notifications are configured, trigger via HubSpot transactional email API.

## Routing Boundaries

Use this skill for CMS publish hook lifecycle only.
Defer to `hubspot-seo-framework` for SEO strategy and to `hubspot-cms-release-operations` agents for content authoring decisions.

## References

- [Prepublish Validation Gates](./prepublish-gates.md)
- [Postpublish Notification and History](./postpublish-notify.md)
- [Release Force/Bypass Policy](./release-policy.md)
