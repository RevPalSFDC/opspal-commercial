# API Queries and Payload Templates

Use these snippets for diagnostics. Replace placeholders with actual ids and tokens.

## Campaign Metadata

```
GET /rest/asset/v1/smartCampaign/{id}.json
```

## Program Tokens

```
GET /rest/asset/v1/folder/{programId}/tokens.json?folderType=Program
```

## Lead Activities (Trigger + Campaign Run)

```
GET /rest/v1/activities.json?activityTypeIds={triggerTypeId},{campaignRunTypeId}&nextPageToken={TOKEN}&leadIds={LEAD_ID}
```

## Program Members (Status Distribution)

```
GET /rest/v1/programs/{programId}/members.json?page=1&pageSize=300&fields=status
```

## Change Program Status (Diagnostic or Backfill)

```
POST /rest/v1/leads/programs/{programId}/status.json

id={LEAD_ID}&status={STATUS_NAME}
```

## Email Asset Status

```
GET /rest/asset/v1/email/{id}.json
```

## Email Approval (Surface Missing Token Errors)

```
POST /rest/asset/v1/email/{id}/approveDraft.json
```

## Bulk Activity Export Create

```
POST /bulk/v1/activities/export/create.json

{
  "format": "CSV",
  "startAt": "2026-01-01T00:00:00Z",
  "endAt": "2026-01-31T23:59:59Z",
  "activityTypeIds": [6,7,8,9]
}
```

## Bulk Activity Export Status

```
GET /bulk/v1/activities/export/{exportId}/status.json
```

## Bulk Activity Export Cancel

```
DELETE /bulk/v1/activities/export/{exportId}.json
```

## Error Code Reference (Common)

- 606: Rate limit exceeded (100 calls/20 sec)
- 607: Daily quota reached
- 615: Concurrent request limit (10 max)
- 1029: Bulk export quota or queue limit

## Notes

- Results logs are not exposed via REST; use lead activity as evidence.
- Smart List and Flow edits are not available via API; use cloning or UI.
