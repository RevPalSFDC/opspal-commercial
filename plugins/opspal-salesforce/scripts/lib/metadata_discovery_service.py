from __future__ import annotations
from typing import List, Dict

from .safe_query_executor import SafeQueryExecutorPy


class MetadataDiscoveryService:
    """Multi-method metadata discovery with basic caching.
    NOTE: Uses Tooling API via SafeQueryExecutor where applicable.
    """

    def __init__(self, org_alias: str):
        self.org = org_alias
        self.sq = SafeQueryExecutorPy(org_alias)
        self._cache: Dict[str, List[Dict]] = {}

    def flows(self, active_only: bool = True, limit: int = 1000) -> List[Dict]:
        key = f"flows:{active_only}:{limit}"
        if key in self._cache:
            return self._cache[key]
        cond = "WHERE IsActive = true" if active_only else ""
        q = f"SELECT Id, Definition.DeveloperName, MasterLabel, ProcessType, TriggerType, IsActive, VersionNumber, LastModifiedDate FROM Flow {cond} ORDER BY LastModifiedDate DESC"
        recs = self.sq.run(q, description='Discover Flows', paginate=True, batch_size=min(2000, limit))
        self._cache[key] = recs
        return recs

    def validation_rules(self, object_api: str | None = None, limit: int = 1000) -> List[Dict]:
        key = f"vr:{object_api}:{limit}"
        if key in self._cache:
            return self._cache[key]
        where = f"WHERE EntityDefinition.QualifiedApiName = '{object_api}'" if object_api else ""
        q = f"SELECT Id, ValidationName, Active, Description FROM ValidationRule {where} ORDER BY ValidationName"
        recs = self.sq.run(q, description='Discover Validation Rules', paginate=True, batch_size=min(2000, limit))
        self._cache[key] = recs
        return recs

    # Best-effort Assignment Rules via Metadata API (file listing)
    def assignment_rules(self, object_api: str | None = None) -> List[Dict]:
        import tempfile, subprocess, json, os
        rules: List[Dict] = []
        with tempfile.TemporaryDirectory() as tmp:
            md = 'AssignmentRules' if not object_api else f"AssignmentRules:{object_api}"
            cmd = ['sf', 'project', 'retrieve', 'start', '--metadata', md, '--target-org', self.org, '--output-dir', tmp]
            subprocess.run(cmd, check=False, capture_output=True, text=True)
            for root, _, files in os.walk(tmp):
                for f in files:
                    if f.endswith('.assignmentRules') or f.endswith('.assignmentRules-meta.xml'):
                        rules.append({'file': os.path.join(root, f)})
        return rules

    # Best-effort Escalation Rules via Metadata API (file listing)
    def escalation_rules(self) -> List[Dict]:
        import tempfile, subprocess, json, os
        rules: List[Dict] = []
        with tempfile.TemporaryDirectory() as tmp:
            cmd = ['sf', 'project', 'retrieve', 'start', '--metadata', 'EscalationRules', '--target-org', self.org, '--output-dir', tmp]
            subprocess.run(cmd, check=False, capture_output=True, text=True)
            for root, _, files in os.walk(tmp):
                for f in files:
                    if f.endswith('.escalationRules') or f.endswith('.escalationRules-meta.xml'):
                        rules.append({'file': os.path.join(root, f)})
        return rules
