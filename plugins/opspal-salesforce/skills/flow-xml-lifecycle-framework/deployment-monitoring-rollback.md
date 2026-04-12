# Deployment Monitoring Rollback

Primary sources:
- `docs/runbooks/flow-xml-development/05-testing-and-deployment.md`
- `docs/runbooks/flow-xml-development/06-monitoring-maintenance-rollback.md`

## Rollout policy

- Deploy with explicit success metrics.
- Verify active version post-deploy.
- Keep rollback trigger conditions documented before release.

## Post-deploy flow activation (REQUIRED)

Salesforce Metadata API deploys new flows as Draft/Inactive when the flow has never existed
in the target org. The `<status>Active</status>` in XML is a request, not a guarantee — the
org setting "Deploy Processes and Flows as Active" must be enabled for production orgs.

After deploying flows, always verify and activate:

```bash
node scripts/lib/flow-activation-verifier.js batch-verify <org> \
    --flows "Flow_Api_Name_1,Flow_Api_Name_2" --auto-activate --json
```

If programmatic activation fails (Apex-invoking flows require System Administrator profile),
use the Tooling API. Version numbers are org-specific — always query the target org first:

```bash
sf data query --query "SELECT Id, LatestVersionNumber FROM FlowDefinition WHERE DeveloperName = '<FlowName>'" --target-org <org> --use-tooling-api --json

curl -s -X PATCH "${INSTANCE_URL}/services/data/v62.0/tooling/sobjects/FlowDefinition/<Id>" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"Metadata":{"activeVersionNumber":<LatestVersionNumber>}}'
```

Ref: https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_flowdefinition.htm
