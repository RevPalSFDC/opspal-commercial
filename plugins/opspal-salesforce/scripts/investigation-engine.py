#!/usr/bin/env python3
"""
investigation-engine.py - Autonomous Investigation Framework for Salesforce Agents
Enables agents to independently detect, investigate, and resolve issues
"""

import json
import logging
import subprocess
import sqlite3
from typing import Dict, List, Any, Optional, Tuple, Set
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from enum import Enum
import hashlib
import re
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class IssueCategory(Enum):
    """Categories of issues that can be investigated"""
    FIELD_PERSISTENCE = "field_persistence"
    PERMISSION_DENIED = "permission_denied"
    VALIDATION_FAILURE = "validation_failure"
    AUTOMATION_FAILURE = "automation_failure"
    PERFORMANCE_ISSUE = "performance_issue"
    DATA_INTEGRITY = "data_integrity"
    API_ERROR = "api_error"
    CONFIGURATION_ISSUE = "configuration_issue"
    INTEGRATION_FAILURE = "integration_failure"
    UNKNOWN = "unknown"

class InvestigationStatus(Enum):
    """Status of an investigation"""
    INITIATED = "initiated"
    ANALYZING = "analyzing"
    TESTING_HYPOTHESIS = "testing_hypothesis"
    GATHERING_EVIDENCE = "gathering_evidence"
    DETERMINING_CAUSE = "determining_cause"
    GENERATING_SOLUTION = "generating_solution"
    COMPLETED = "completed"
    FAILED = "failed"
    ESCALATED = "escalated"

class ConfidenceLevel(Enum):
    """Confidence levels for findings"""
    VERY_HIGH = 95  # Almost certain
    HIGH = 85       # Highly confident
    MEDIUM = 70     # Moderately confident
    LOW = 50        # Some evidence
    VERY_LOW = 30   # Weak evidence

@dataclass
class Evidence:
    """Single piece of evidence collected during investigation"""
    evidence_id: str
    type: str
    description: str
    data: Dict[str, Any]
    source: str
    collected_at: datetime
    relevance_score: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'evidence_id': self.evidence_id,
            'type': self.type,
            'description': self.description,
            'data': self.data,
            'source': self.source,
            'collected_at': self.collected_at.isoformat(),
            'relevance_score': self.relevance_score
        }

@dataclass
class Hypothesis:
    """A hypothesis about the root cause"""
    hypothesis_id: str
    description: str
    category: IssueCategory
    probability: float
    supporting_evidence: List[str] = field(default_factory=list)
    contradicting_evidence: List[str] = field(default_factory=list)
    tests_required: List[str] = field(default_factory=list)
    test_results: Dict[str, Any] = field(default_factory=dict)
    confidence: Optional[ConfidenceLevel] = None
    
    def calculate_confidence(self) -> ConfidenceLevel:
        """Calculate confidence based on evidence"""
        support_weight = len(self.supporting_evidence) * 10
        contradict_weight = len(self.contradicting_evidence) * 15
        test_success = sum(1 for r in self.test_results.values() if r) * 20
        
        score = self.probability + support_weight - contradict_weight + test_success
        
        if score >= 95:
            return ConfidenceLevel.VERY_HIGH
        elif score >= 85:
            return ConfidenceLevel.HIGH
        elif score >= 70:
            return ConfidenceLevel.MEDIUM
        elif score >= 50:
            return ConfidenceLevel.LOW
        else:
            return ConfidenceLevel.VERY_LOW

@dataclass
class Investigation:
    """Complete investigation record"""
    investigation_id: str
    issue_description: str
    category: IssueCategory
    status: InvestigationStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    evidence_collected: List[Evidence] = field(default_factory=list)
    hypotheses: List[Hypothesis] = field(default_factory=list)
    root_cause: Optional[str] = None
    confidence_level: Optional[ConfidenceLevel] = None
    recommended_solutions: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

class InvestigationEngine:
    """Core engine for autonomous investigation"""
    
    def __init__(self, knowledge_base_path: str = None):
        """
        Initialize investigation engine
        
        Args:
            knowledge_base_path: Path to knowledge base database
        """
        self.knowledge_base_path = knowledge_base_path or "~/.salesforce_investigations.db"
        self.knowledge_base_path = os.path.expanduser(self.knowledge_base_path)
        self.current_investigation: Optional[Investigation] = None
        self.evidence_collectors = self._init_evidence_collectors()
        self.hypothesis_generators = self._init_hypothesis_generators()
        self.solution_generators = self._init_solution_generators()
        self._init_knowledge_base()
    
    def _init_knowledge_base(self):
        """Initialize the knowledge base database"""
        conn = sqlite3.connect(self.knowledge_base_path)
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS investigations (
                id TEXT PRIMARY KEY,
                issue_description TEXT,
                category TEXT,
                status TEXT,
                started_at TEXT,
                completed_at TEXT,
                root_cause TEXT,
                confidence_level INTEGER,
                metadata TEXT
            );
            
            CREATE TABLE IF NOT EXISTS evidence (
                id TEXT PRIMARY KEY,
                investigation_id TEXT,
                type TEXT,
                description TEXT,
                data TEXT,
                source TEXT,
                collected_at TEXT,
                relevance_score REAL,
                FOREIGN KEY (investigation_id) REFERENCES investigations(id)
            );
            
            CREATE TABLE IF NOT EXISTS hypotheses (
                id TEXT PRIMARY KEY,
                investigation_id TEXT,
                description TEXT,
                category TEXT,
                probability REAL,
                confidence TEXT,
                test_results TEXT,
                FOREIGN KEY (investigation_id) REFERENCES investigations(id)
            );
            
            CREATE TABLE IF NOT EXISTS solutions (
                id TEXT PRIMARY KEY,
                investigation_id TEXT,
                solution_type TEXT,
                description TEXT,
                implementation_steps TEXT,
                risk_level TEXT,
                success_rate REAL,
                FOREIGN KEY (investigation_id) REFERENCES investigations(id)
            );
            
            CREATE TABLE IF NOT EXISTS patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                issue_pattern TEXT,
                root_cause_pattern TEXT,
                solution_pattern TEXT,
                occurrences INTEGER DEFAULT 1,
                success_rate REAL
            );
        """)
        conn.commit()
        conn.close()
    
    def _init_evidence_collectors(self) -> Dict[str, callable]:
        """Initialize evidence collection methods"""
        return {
            'field_metadata': self._collect_field_metadata,
            'permissions': self._collect_permissions,
            'validation_rules': self._collect_validation_rules,
            'automation': self._collect_automation_config,
            'recent_changes': self._collect_recent_changes,
            'error_logs': self._collect_error_logs,
            'api_limits': self._collect_api_limits,
            'data_samples': self._collect_data_samples
        }
    
    def _init_hypothesis_generators(self) -> Dict[IssueCategory, callable]:
        """Initialize hypothesis generation methods"""
        return {
            IssueCategory.FIELD_PERSISTENCE: self._generate_field_hypotheses,
            IssueCategory.PERMISSION_DENIED: self._generate_permission_hypotheses,
            IssueCategory.VALIDATION_FAILURE: self._generate_validation_hypotheses,
            IssueCategory.AUTOMATION_FAILURE: self._generate_automation_hypotheses,
            IssueCategory.PERFORMANCE_ISSUE: self._generate_performance_hypotheses,
            IssueCategory.DATA_INTEGRITY: self._generate_data_hypotheses,
            IssueCategory.API_ERROR: self._generate_api_hypotheses,
            IssueCategory.CONFIGURATION_ISSUE: self._generate_config_hypotheses,
            IssueCategory.INTEGRATION_FAILURE: self._generate_integration_hypotheses
        }
    
    def _init_solution_generators(self) -> Dict[str, callable]:
        """Initialize solution generation methods"""
        return {
            'permission_fix': self._generate_permission_solution,
            'validation_fix': self._generate_validation_solution,
            'automation_fix': self._generate_automation_solution,
            'configuration_fix': self._generate_config_solution,
            'data_fix': self._generate_data_solution,
            'performance_fix': self._generate_performance_solution
        }
    
    def initiate_investigation(self, issue_description: str, 
                              context: Dict[str, Any] = None) -> Investigation:
        """
        Start a new investigation
        
        Args:
            issue_description: Description of the issue
            context: Additional context about the issue
            
        Returns:
            Investigation object
        """
        # Categorize the issue
        category = self._categorize_issue(issue_description, context)
        
        # Create investigation
        investigation = Investigation(
            investigation_id=self._generate_id(),
            issue_description=issue_description,
            category=category,
            status=InvestigationStatus.INITIATED,
            started_at=datetime.now(),
            metadata=context or {}
        )
        
        self.current_investigation = investigation
        logger.info(f"Investigation initiated: {investigation.investigation_id}")
        
        # Start investigation process
        self._execute_investigation()
        
        return investigation
    
    def _categorize_issue(self, description: str, context: Dict[str, Any]) -> IssueCategory:
        """Categorize the issue based on description and context"""
        description_lower = description.lower()
        
        # Pattern matching for categorization
        patterns = {
            IssueCategory.FIELD_PERSISTENCE: [
                r'field.*not.*updat',
                r'value.*not.*persist',
                r'field.*not.*sav',
                r'update.*fail.*silent'
            ],
            IssueCategory.PERMISSION_DENIED: [
                r'permission.*denied',
                r'insufficient.*access',
                r'not.*authorized',
                r'access.*denied'
            ],
            IssueCategory.VALIDATION_FAILURE: [
                r'validation.*rule',
                r'validation.*error',
                r'field.*validation',
                r'required.*field'
            ],
            IssueCategory.AUTOMATION_FAILURE: [
                r'flow.*not.*trigger',
                r'workflow.*fail',
                r'process.*builder',
                r'trigger.*not.*fire'
            ],
            IssueCategory.PERFORMANCE_ISSUE: [
                r'slow.*response',
                r'timeout',
                r'performance.*degrad',
                r'taking.*long'
            ],
            IssueCategory.DATA_INTEGRITY: [
                r'data.*corrupt',
                r'duplicate.*record',
                r'data.*inconsisten',
                r'missing.*data'
            ],
            IssueCategory.API_ERROR: [
                r'api.*error',
                r'api.*limit',
                r'callout.*fail',
                r'integration.*error'
            ]
        }
        
        for category, category_patterns in patterns.items():
            for pattern in category_patterns:
                if re.search(pattern, description_lower):
                    return category
        
        # Check context for additional hints
        if context:
            if 'error_code' in context:
                error_code = context['error_code']
                if 'INSUFFICIENT_ACCESS' in error_code:
                    return IssueCategory.PERMISSION_DENIED
                elif 'FIELD_CUSTOM_VALIDATION' in error_code:
                    return IssueCategory.VALIDATION_FAILURE
        
        return IssueCategory.UNKNOWN
    
    def _execute_investigation(self):
        """Execute the investigation process"""
        if not self.current_investigation:
            return
        
        try:
            # Phase 1: Collect evidence
            self._update_status(InvestigationStatus.GATHERING_EVIDENCE)
            self._collect_evidence()
            
            # Phase 2: Generate hypotheses
            self._update_status(InvestigationStatus.ANALYZING)
            self._generate_hypotheses()
            
            # Phase 3: Test hypotheses
            self._update_status(InvestigationStatus.TESTING_HYPOTHESIS)
            self._test_hypotheses()
            
            # Phase 4: Determine root cause
            self._update_status(InvestigationStatus.DETERMINING_CAUSE)
            self._determine_root_cause()
            
            # Phase 5: Generate solutions
            self._update_status(InvestigationStatus.GENERATING_SOLUTION)
            self._generate_solutions()
            
            # Complete investigation
            self._complete_investigation()
            
        except Exception as e:
            logger.error(f"Investigation failed: {e}")
            self._update_status(InvestigationStatus.FAILED)
            raise
    
    def _collect_evidence(self):
        """Collect relevant evidence"""
        category = self.current_investigation.category
        
        # Determine which evidence to collect based on category
        evidence_types = self._get_relevant_evidence_types(category)
        
        for evidence_type in evidence_types:
            if evidence_type in self.evidence_collectors:
                try:
                    collector = self.evidence_collectors[evidence_type]
                    evidence = collector()
                    if evidence:
                        self.current_investigation.evidence_collected.extend(evidence)
                        logger.info(f"Collected {len(evidence)} pieces of {evidence_type} evidence")
                except Exception as e:
                    logger.warning(f"Failed to collect {evidence_type} evidence: {e}")
    
    def _get_relevant_evidence_types(self, category: IssueCategory) -> List[str]:
        """Get relevant evidence types for the issue category"""
        relevance_map = {
            IssueCategory.FIELD_PERSISTENCE: [
                'field_metadata', 'permissions', 'validation_rules', 
                'automation', 'recent_changes'
            ],
            IssueCategory.PERMISSION_DENIED: [
                'permissions', 'field_metadata', 'error_logs'
            ],
            IssueCategory.VALIDATION_FAILURE: [
                'validation_rules', 'field_metadata', 'data_samples'
            ],
            IssueCategory.AUTOMATION_FAILURE: [
                'automation', 'recent_changes', 'error_logs'
            ],
            IssueCategory.PERFORMANCE_ISSUE: [
                'api_limits', 'data_samples', 'error_logs'
            ],
            IssueCategory.DATA_INTEGRITY: [
                'data_samples', 'validation_rules', 'recent_changes'
            ],
            IssueCategory.API_ERROR: [
                'api_limits', 'error_logs'
            ],
            IssueCategory.CONFIGURATION_ISSUE: [
                'field_metadata', 'permissions', 'recent_changes'
            ],
            IssueCategory.INTEGRATION_FAILURE: [
                'error_logs', 'api_limits', 'recent_changes'
            ],
            IssueCategory.UNKNOWN: [
                'error_logs', 'recent_changes', 'field_metadata'
            ]
        }
        
        return relevance_map.get(category, ['error_logs'])
    
    def _generate_hypotheses(self):
        """Generate hypotheses based on evidence"""
        category = self.current_investigation.category
        
        if category in self.hypothesis_generators:
            generator = self.hypothesis_generators[category]
            hypotheses = generator()
            self.current_investigation.hypotheses.extend(hypotheses)
            logger.info(f"Generated {len(hypotheses)} hypotheses")
        else:
            # Generate generic hypotheses
            hypotheses = self._generate_generic_hypotheses()
            self.current_investigation.hypotheses.extend(hypotheses)
    
    def _test_hypotheses(self):
        """Test each hypothesis"""
        for hypothesis in self.current_investigation.hypotheses:
            for test in hypothesis.tests_required:
                try:
                    result = self._execute_test(test, hypothesis)
                    hypothesis.test_results[test] = result
                except Exception as e:
                    logger.warning(f"Test failed for {test}: {e}")
                    hypothesis.test_results[test] = False
            
            # Calculate confidence after testing
            hypothesis.confidence = hypothesis.calculate_confidence()
    
    def _determine_root_cause(self):
        """Determine the most likely root cause"""
        if not self.current_investigation.hypotheses:
            return
        
        # Sort hypotheses by confidence
        sorted_hypotheses = sorted(
            self.current_investigation.hypotheses,
            key=lambda h: h.confidence.value if h.confidence else 0,
            reverse=True
        )
        
        # Select highest confidence hypothesis
        best_hypothesis = sorted_hypotheses[0]
        
        if best_hypothesis.confidence and best_hypothesis.confidence.value >= 70:
            self.current_investigation.root_cause = best_hypothesis.description
            self.current_investigation.confidence_level = best_hypothesis.confidence
            logger.info(f"Root cause determined: {best_hypothesis.description} "
                       f"(confidence: {best_hypothesis.confidence.name})")
        else:
            logger.warning("Unable to determine root cause with sufficient confidence")
            self.current_investigation.root_cause = "Unable to determine with confidence"
            self.current_investigation.confidence_level = ConfidenceLevel.VERY_LOW
    
    def _generate_solutions(self):
        """Generate solutions based on root cause"""
        if not self.current_investigation.root_cause:
            return
        
        # Determine solution type based on root cause
        solution_type = self._determine_solution_type(self.current_investigation.root_cause)
        
        if solution_type in self.solution_generators:
            generator = self.solution_generators[solution_type]
            solutions = generator()
            self.current_investigation.recommended_solutions.extend(solutions)
            logger.info(f"Generated {len(solutions)} solution recommendations")
    
    def _complete_investigation(self):
        """Complete the investigation"""
        self.current_investigation.completed_at = datetime.now()
        self._update_status(InvestigationStatus.COMPLETED)
        
        # Save to knowledge base
        self._save_to_knowledge_base()
        
        # Learn from this investigation
        self._update_patterns()
        
        logger.info(f"Investigation completed: {self.current_investigation.investigation_id}")
    
    def _update_status(self, status: InvestigationStatus):
        """Update investigation status"""
        if self.current_investigation:
            self.current_investigation.status = status
            logger.debug(f"Investigation status: {status.value}")
    
    def _generate_id(self) -> str:
        """Generate unique investigation ID"""
        timestamp = datetime.now().isoformat()
        return hashlib.sha256(timestamp.encode()).hexdigest()[:12]

    def _resolve_org_alias(self, context: Optional[Dict[str, Any]] = None) -> Optional[str]:
        if context is None:
            context = self.current_investigation.metadata if self.current_investigation else {}
        return (
            context.get('org_alias')
            or os.environ.get("SFDC_INSTANCE")
            or os.environ.get("SF_TARGET_ORG")
            or os.environ.get("SF_TARGET_ORG")
            or os.environ.get("SF_TARGET_ORG")
        )

    def _safe_identifier(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        if re.match(r'^[A-Za-z][A-Za-z0-9_]*$', value):
            return value
        logger.warning(f"Skipping unsafe identifier: {value}")
        return None

    def _safe_id(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        if re.match(r'^[A-Za-z0-9]{15,18}$', value):
            return value
        logger.warning(f"Skipping invalid Salesforce ID: {value}")
        return None

    def _run_sf_json(self, args: List[str], timeout: int = 60) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        except Exception as exc:
            return None, str(exc)

        if result.returncode != 0:
            error_output = result.stderr.strip() or result.stdout.strip()
            return None, error_output or f"Command failed with exit code {result.returncode}"

        try:
            return json.loads(result.stdout), None
        except json.JSONDecodeError as exc:
            return None, f"Failed to parse JSON output: {exc}"
    
    # Evidence Collection Methods
    
    def _collect_field_metadata(self) -> List[Evidence]:
        """Collect field metadata evidence"""
        evidence = []
        
        # Get field information from context
        context = self.current_investigation.metadata
        object_name = self._safe_identifier(context.get('object_name'))
        field_name = self._safe_identifier(context.get('field_name'))
        org_alias = self._resolve_org_alias(context)

        if object_name and field_name and org_alias:
            try:
                cmd = [
                    "sf", "sobject", "describe",
                    "-s", object_name,
                    "--target-org", org_alias,
                    "--json"
                ]
                data, error = self._run_sf_json(cmd)

                if data and not error:
                    fields = data.get('result', {}).get('fields', [])
                    for field in fields:
                        if field.get('name') == field_name:
                            evidence.append(Evidence(
                                evidence_id=self._generate_id(),
                                type='field_metadata',
                                description=f"Field metadata for {field_name}",
                                data=field,
                                source='salesforce_cli',
                                collected_at=datetime.now(),
                                relevance_score=1.0
                            ))
                            break
                elif error:
                    logger.error(f"Field metadata query failed: {error}")
            except Exception as e:
                logger.error(f"Failed to collect field metadata: {e}")
        else:
            logger.warning("Skipping field metadata collection due to missing org alias or context")
        
        return evidence
    
    def _collect_permissions(self) -> List[Evidence]:
        """Collect permission evidence"""
        evidence = []
        
        context = self.current_investigation.metadata
        org_alias = self._resolve_org_alias(context)
        if not org_alias:
            logger.warning("Skipping permission collection due to missing org alias")
            return evidence

        user_id = self._safe_id(context.get('user_id'))
        profile_id = self._safe_id(context.get('profile_id'))
        object_name = self._safe_identifier(context.get('object_name'))
        field_name = self._safe_identifier(context.get('field_name'))

        permissions_data: Dict[str, Any] = {'org_alias': org_alias}

        if user_id:
            user_query = f"SELECT Id, Name, Username, ProfileId, UserType FROM User WHERE Id = '{user_id}' LIMIT 1"
            data, error = self._run_sf_json([
                "sf", "data", "query",
                "--query", user_query,
                "--target-org", org_alias,
                "--json"
            ])
            records = data.get('result', {}).get('records', []) if data else []
            if records:
                permissions_data['user'] = records[0]
                profile_id = profile_id or self._safe_id(records[0].get('ProfileId'))
            else:
                permissions_data['user_error'] = error or "User not found"

        if profile_id:
            profile_query = f"SELECT Id, Name, UserLicenseId FROM Profile WHERE Id = '{profile_id}' LIMIT 1"
            data, error = self._run_sf_json([
                "sf", "data", "query",
                "--query", profile_query,
                "--target-org", org_alias,
                "--json"
            ])
            records = data.get('result', {}).get('records', []) if data else []
            if records:
                permissions_data['profile'] = records[0]
            else:
                permissions_data['profile_error'] = error or "Profile not found"

        if user_id:
            ps_query = (
                "SELECT PermissionSetId, PermissionSet.Name, PermissionSet.Label, "
                "PermissionSet.IsOwnedByProfile FROM PermissionSetAssignment "
                f"WHERE AssigneeId = '{user_id}' ORDER BY PermissionSet.Name LIMIT 50"
            )
            data, error = self._run_sf_json([
                "sf", "data", "query",
                "--query", ps_query,
                "--target-org", org_alias,
                "--json"
            ])
            if data:
                permissions_data['permission_sets'] = data.get('result', {}).get('records', [])
            elif error:
                permissions_data['permission_sets_error'] = error

        if object_name and field_name:
            field_full = f"{object_name}.{field_name}"
            fls_query = (
                "SELECT SobjectType, Field, PermissionsRead, PermissionsEdit, ParentId "
                f"FROM FieldPermissions WHERE SobjectType = '{object_name}' "
                f"AND Field = '{field_full}' LIMIT 50"
            )
            data, error = self._run_sf_json([
                "sf", "data", "query",
                "--query", fls_query,
                "--target-org", org_alias,
                "--use-tooling-api",
                "--json"
            ])
            if data:
                permissions_data['field_permissions'] = data.get('result', {}).get('records', [])
            elif error:
                permissions_data['field_permissions_error'] = error

        if len(permissions_data) > 1:
            evidence.append(Evidence(
                evidence_id=self._generate_id(),
                type='permissions',
                description="User permissions analysis",
                data=permissions_data,
                source='salesforce_cli',
                collected_at=datetime.now(),
                relevance_score=0.8
            ))
        
        return evidence
    
    def _collect_validation_rules(self) -> List[Evidence]:
        """Collect validation rule evidence"""
        evidence = []
        
        context = self.current_investigation.metadata
        org_alias = self._resolve_org_alias(context)
        object_name = self._safe_identifier(context.get('object_name'))

        if not org_alias:
            logger.warning("Skipping validation rule collection due to missing org alias")
            return evidence

        base_query = "SELECT Id, ValidationName, Active, Description, ErrorMessage FROM ValidationRule"
        filtered_query = (
            f"{base_query} WHERE EntityDefinition.QualifiedApiName = '{object_name}' "
            "ORDER BY LastModifiedDate DESC LIMIT 50"
        ) if object_name else f"{base_query} ORDER BY LastModifiedDate DESC LIMIT 50"

        data, error = self._run_sf_json([
            "sf", "data", "query",
            "--query", filtered_query,
            "--target-org", org_alias,
            "--use-tooling-api",
            "--json"
        ])

        if error and object_name:
            data, error = self._run_sf_json([
                "sf", "data", "query",
                "--query", f"{base_query} ORDER BY LastModifiedDate DESC LIMIT 50",
                "--target-org", org_alias,
                "--use-tooling-api",
                "--json"
            ])

        if data or error:
            records = data.get('result', {}).get('records', []) if data else []
            evidence.append(Evidence(
                evidence_id=self._generate_id(),
                type='validation_rules',
                description=f"Validation rules for {object_name or 'org'}",
                data={
                    'object_name': object_name,
                    'validation_rules': records,
                    'count': len(records),
                    'error': error
                },
                source='salesforce_cli',
                collected_at=datetime.now(),
                relevance_score=0.9
            ))
        
        return evidence
    
    def _collect_automation_config(self) -> List[Evidence]:
        """Collect automation configuration evidence"""
        evidence = []

        context = self.current_investigation.metadata
        org_alias = self._resolve_org_alias(context)
        object_name = self._safe_identifier(context.get('object_name'))

        if not org_alias:
            logger.warning("Skipping automation collection due to missing org alias")
            return evidence

        automation_data: Dict[str, Any] = {'org_alias': org_alias}

        flow_query = (
            "SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId "
            "FROM FlowDefinition ORDER BY LastModifiedDate DESC LIMIT 50"
        )
        data, error = self._run_sf_json([
            "sf", "data", "query",
            "--query", flow_query,
            "--target-org", org_alias,
            "--use-tooling-api",
            "--json"
        ])
        if data:
            automation_data['flow_definitions'] = data.get('result', {}).get('records', [])
        elif error:
            automation_data['flow_error'] = error

        trigger_query = (
            "SELECT Id, Name, Status, TableEnumOrId "
            "FROM ApexTrigger "
            + (f"WHERE TableEnumOrId = '{object_name}' " if object_name else "")
            + "ORDER BY LastModifiedDate DESC LIMIT 50"
        )
        data, error = self._run_sf_json([
            "sf", "data", "query",
            "--query", trigger_query,
            "--target-org", org_alias,
            "--use-tooling-api",
            "--json"
        ])
        if data:
            automation_data['apex_triggers'] = data.get('result', {}).get('records', [])
        elif error:
            automation_data['apex_trigger_error'] = error

        workflow_query = (
            "SELECT Id, Name, Active, TableEnumOrId "
            "FROM WorkflowRule "
            + (f"WHERE TableEnumOrId = '{object_name}' " if object_name else "")
            + "ORDER BY LastModifiedDate DESC LIMIT 50"
        )
        data, error = self._run_sf_json([
            "sf", "data", "query",
            "--query", workflow_query,
            "--target-org", org_alias,
            "--use-tooling-api",
            "--json"
        ])
        if data:
            automation_data['workflow_rules'] = data.get('result', {}).get('records', [])
        elif error:
            automation_data['workflow_error'] = error

        if len(automation_data) > 1:
            evidence.append(Evidence(
                evidence_id=self._generate_id(),
                type='automation',
                description="Active automation rules",
                data=automation_data,
                source='salesforce_cli',
                collected_at=datetime.now(),
                relevance_score=0.7
            ))
        
        return evidence
    
    def _collect_recent_changes(self) -> List[Evidence]:
        """Collect recent change evidence"""
        evidence = []
        
        context = self.current_investigation.metadata
        org_alias = self._resolve_org_alias(context)

        if not org_alias:
            logger.warning("Skipping recent changes collection due to missing org alias")
            return evidence

        audit_query = (
            "SELECT CreatedDate, CreatedBy.Name, Action, Display, Section "
            "FROM SetupAuditTrail ORDER BY CreatedDate DESC LIMIT 20"
        )
        data, error = self._run_sf_json([
            "sf", "data", "query",
            "--query", audit_query,
            "--target-org", org_alias,
            "--use-tooling-api",
            "--json"
        ])

        records = data.get('result', {}).get('records', []) if data else []
        if records or error:
            evidence.append(Evidence(
                evidence_id=self._generate_id(),
                type='recent_changes',
                description="Recent system changes",
                data={
                    'audit_trail': records,
                    'count': len(records),
                    'error': error
                },
                source='salesforce_cli',
                collected_at=datetime.now(),
                relevance_score=0.6
            ))
        
        return evidence
    
    def _collect_error_logs(self) -> List[Evidence]:
        """Collect error log evidence"""
        evidence = []
        
        context = self.current_investigation.metadata
        org_alias = self._resolve_org_alias(context)

        if not org_alias:
            logger.warning("Skipping error log collection due to missing org alias")
            return evidence

        log_query = (
            "SELECT Id, StartTime, Operation, Status, LogLength, LogUser.Name "
            "FROM ApexLog ORDER BY StartTime DESC LIMIT 20"
        )
        data, error = self._run_sf_json([
            "sf", "data", "query",
            "--query", log_query,
            "--target-org", org_alias,
            "--use-tooling-api",
            "--json"
        ])

        records = data.get('result', {}).get('records', []) if data else []
        if records or error:
            evidence.append(Evidence(
                evidence_id=self._generate_id(),
                type='error_logs',
                description="Recent Apex logs",
                data={
                    'logs': records,
                    'count': len(records),
                    'error': error
                },
                source='salesforce_cli',
                collected_at=datetime.now(),
                relevance_score=0.9
            ))
        
        return evidence
    
    def _collect_api_limits(self) -> List[Evidence]:
        """Collect API limit evidence"""
        evidence = []
        
        context = self.current_investigation.metadata
        org_alias = self._resolve_org_alias(context)

        if not org_alias:
            logger.warning("Skipping API limits collection due to missing org alias")
            return evidence

        data, error = self._run_sf_json([
            "sf", "limits", "api", "display",
            "--target-org", org_alias,
            "--json"
        ])

        if data or error:
            evidence.append(Evidence(
                evidence_id=self._generate_id(),
                type='api_limits',
                description="Current API usage and limits",
                data={
                    'limits': data.get('result') if data else None,
                    'error': error
                },
                source='salesforce_cli',
                collected_at=datetime.now(),
                relevance_score=0.5
            ))
        
        return evidence
    
    def _collect_data_samples(self) -> List[Evidence]:
        """Collect data sample evidence"""
        evidence = []
        
        context = self.current_investigation.metadata
        org_alias = self._resolve_org_alias(context)
        object_name = self._safe_identifier(context.get('object_name'))
        field_name = self._safe_identifier(context.get('field_name'))

        if not org_alias or not object_name:
            logger.warning("Skipping data sample collection due to missing org alias or object name")
            return evidence

        sample_query = f"SELECT Id FROM {object_name} ORDER BY LastModifiedDate DESC LIMIT 5"
        if field_name:
            sample_query = (
                f"SELECT Id, {field_name} FROM {object_name} "
                "ORDER BY LastModifiedDate DESC LIMIT 5"
            )

        data, error = self._run_sf_json([
            "sf", "data", "query",
            "--query", sample_query,
            "--target-org", org_alias,
            "--json"
        ])

        if error and field_name:
            fallback_query = f"SELECT Id FROM {object_name} ORDER BY LastModifiedDate DESC LIMIT 5"
            data, error = self._run_sf_json([
                "sf", "data", "query",
                "--query", fallback_query,
                "--target-org", org_alias,
                "--json"
            ])

        records = data.get('result', {}).get('records', []) if data else []
        if records or error:
            evidence.append(Evidence(
                evidence_id=self._generate_id(),
                type='data_samples',
                description="Sample data for analysis",
                data={
                    'object_name': object_name,
                    'field_name': field_name,
                    'samples': records,
                    'count': len(records),
                    'error': error
                },
                source='salesforce_cli',
                collected_at=datetime.now(),
                relevance_score=0.7
            ))
        
        return evidence
    
    # Hypothesis Generation Methods
    
    def _generate_field_hypotheses(self) -> List[Hypothesis]:
        """Generate hypotheses for field persistence issues"""
        hypotheses = []
        
        # Validation rule blocking update
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Validation rule is preventing field update",
            category=IssueCategory.FIELD_PERSISTENCE,
            probability=0.35,
            tests_required=['check_validation_rules', 'test_without_validation']
        ))
        
        # Trigger reverting changes
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Apex trigger is reverting the field value",
            category=IssueCategory.FIELD_PERSISTENCE,
            probability=0.25,
            tests_required=['check_triggers', 'test_trigger_logic']
        ))
        
        # Permission issue
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Field-level security preventing update",
            category=IssueCategory.FIELD_PERSISTENCE,
            probability=0.20,
            tests_required=['check_field_permissions', 'test_with_admin']
        ))
        
        # Workflow or process builder
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Workflow or Process Builder overwriting value",
            category=IssueCategory.FIELD_PERSISTENCE,
            probability=0.15,
            tests_required=['check_workflows', 'check_process_builders']
        ))
        
        return hypotheses
    
    def _generate_permission_hypotheses(self) -> List[Hypothesis]:
        """Generate hypotheses for permission issues"""
        hypotheses = []
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="User profile lacks necessary permissions",
            category=IssueCategory.PERMISSION_DENIED,
            probability=0.40,
            tests_required=['check_profile_permissions']
        ))
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Field-level security restriction",
            category=IssueCategory.PERMISSION_DENIED,
            probability=0.30,
            tests_required=['check_field_accessibility']
        ))
        
        return hypotheses
    
    def _generate_validation_hypotheses(self) -> List[Hypothesis]:
        """Generate hypotheses for validation failures"""
        hypotheses = []
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Required field is missing",
            category=IssueCategory.VALIDATION_FAILURE,
            probability=0.35,
            tests_required=['check_required_fields']
        ))
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Custom validation rule failing",
            category=IssueCategory.VALIDATION_FAILURE,
            probability=0.30,
            tests_required=['evaluate_validation_rules']
        ))
        
        return hypotheses
    
    def _generate_automation_hypotheses(self) -> List[Hypothesis]:
        """Generate hypotheses for automation failures"""
        hypotheses = []
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Flow entry criteria not met",
            category=IssueCategory.AUTOMATION_FAILURE,
            probability=0.35,
            tests_required=['check_flow_criteria']
        ))
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Flow is inactive or has errors",
            category=IssueCategory.AUTOMATION_FAILURE,
            probability=0.25,
            tests_required=['check_flow_status']
        ))
        
        return hypotheses
    
    def _generate_performance_hypotheses(self) -> List[Hypothesis]:
        """Generate hypotheses for performance issues"""
        hypotheses = []
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Inefficient SOQL queries",
            category=IssueCategory.PERFORMANCE_ISSUE,
            probability=0.30,
            tests_required=['analyze_soql_performance']
        ))
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Missing database indexes",
            category=IssueCategory.PERFORMANCE_ISSUE,
            probability=0.25,
            tests_required=['check_index_usage']
        ))
        
        return hypotheses
    
    def _generate_data_hypotheses(self) -> List[Hypothesis]:
        """Generate hypotheses for data integrity issues"""
        hypotheses = []
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Duplicate records causing conflicts",
            category=IssueCategory.DATA_INTEGRITY,
            probability=0.30,
            tests_required=['check_duplicates']
        ))
        
        return hypotheses
    
    def _generate_api_hypotheses(self) -> List[Hypothesis]:
        """Generate hypotheses for API errors"""
        hypotheses = []
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="API limits exceeded",
            category=IssueCategory.API_ERROR,
            probability=0.35,
            tests_required=['check_api_limits']
        ))
        
        return hypotheses
    
    def _generate_config_hypotheses(self) -> List[Hypothesis]:
        """Generate hypotheses for configuration issues"""
        hypotheses = []
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Incorrect field configuration",
            category=IssueCategory.CONFIGURATION_ISSUE,
            probability=0.30,
            tests_required=['verify_configuration']
        ))
        
        return hypotheses
    
    def _generate_integration_hypotheses(self) -> List[Hypothesis]:
        """Generate hypotheses for integration failures"""
        hypotheses = []
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="External system unavailable",
            category=IssueCategory.INTEGRATION_FAILURE,
            probability=0.30,
            tests_required=['test_external_connectivity']
        ))
        
        return hypotheses
    
    def _generate_generic_hypotheses(self) -> List[Hypothesis]:
        """Generate generic hypotheses when category is unknown"""
        hypotheses = []
        
        hypotheses.append(Hypothesis(
            hypothesis_id=self._generate_id(),
            description="Recent system change causing issue",
            category=IssueCategory.UNKNOWN,
            probability=0.25,
            tests_required=['review_recent_changes']
        ))
        
        return hypotheses
    
    # Test Execution Methods
    
    def _execute_test(self, test_name: str, hypothesis: Hypothesis) -> bool:
        """Execute a specific test for a hypothesis"""
        # Map test names to test methods
        test_methods = {
            'check_validation_rules': self._test_validation_rules,
            'check_triggers': self._test_triggers,
            'check_field_permissions': self._test_field_permissions,
            'check_workflows': self._test_workflows,
            'check_process_builders': self._test_process_builders,
            'check_flow_criteria': self._test_flow_criteria,
            'check_flow_status': self._test_flow_status
        }
        
        if test_name in test_methods:
            return test_methods[test_name](hypothesis)
        
        # Default test result
        return False
    
    def _test_validation_rules(self, hypothesis: Hypothesis) -> bool:
        """Test if validation rules are causing the issue"""
        # Check evidence for validation rule issues
        for evidence in self.current_investigation.evidence_collected:
            if evidence.type == 'validation_rules':
                # Analyze validation rule data
                return True  # Placeholder
        return False
    
    def _test_triggers(self, hypothesis: Hypothesis) -> bool:
        """Test if triggers are causing the issue"""
        # Check for trigger-related evidence
        return False  # Placeholder
    
    def _test_field_permissions(self, hypothesis: Hypothesis) -> bool:
        """Test field permission issues"""
        # Check permission evidence
        for evidence in self.current_investigation.evidence_collected:
            if evidence.type == 'permissions':
                # Analyze permission data
                return True  # Placeholder
        return False
    
    def _test_workflows(self, hypothesis: Hypothesis) -> bool:
        """Test workflow issues"""
        return False  # Placeholder
    
    def _test_process_builders(self, hypothesis: Hypothesis) -> bool:
        """Test process builder issues"""
        return False  # Placeholder
    
    def _test_flow_criteria(self, hypothesis: Hypothesis) -> bool:
        """Test flow entry criteria"""
        return False  # Placeholder
    
    def _test_flow_status(self, hypothesis: Hypothesis) -> bool:
        """Test flow status"""
        return False  # Placeholder
    
    # Solution Generation Methods
    
    def _determine_solution_type(self, root_cause: str) -> str:
        """Determine the type of solution needed"""
        root_cause_lower = root_cause.lower()
        
        if 'permission' in root_cause_lower or 'access' in root_cause_lower:
            return 'permission_fix'
        elif 'validation' in root_cause_lower:
            return 'validation_fix'
        elif 'flow' in root_cause_lower or 'workflow' in root_cause_lower:
            return 'automation_fix'
        elif 'config' in root_cause_lower or 'setting' in root_cause_lower:
            return 'configuration_fix'
        elif 'data' in root_cause_lower:
            return 'data_fix'
        elif 'performance' in root_cause_lower or 'slow' in root_cause_lower:
            return 'performance_fix'
        
        return 'generic_fix'
    
    def _generate_permission_solution(self) -> List[Dict[str, Any]]:
        """Generate permission-related solutions"""
        solutions = []
        
        solutions.append({
            'type': 'permission_fix',
            'description': 'Grant field-level security permissions',
            'steps': [
                'Navigate to Setup > Object Manager',
                'Select the affected object',
                'Go to Fields & Relationships',
                'Click on the field name',
                'Set Field-Level Security for relevant profiles'
            ],
            'risk_level': 'low',
            'automation_possible': True
        })
        
        return solutions
    
    def _generate_validation_solution(self) -> List[Dict[str, Any]]:
        """Generate validation-related solutions"""
        solutions = []
        
        solutions.append({
            'type': 'validation_fix',
            'description': 'Modify validation rule to allow operation',
            'steps': [
                'Identify the blocking validation rule',
                'Add exception condition for automation user',
                'Test the modified rule',
                'Deploy to production'
            ],
            'risk_level': 'medium',
            'automation_possible': True
        })
        
        return solutions
    
    def _generate_automation_solution(self) -> List[Dict[str, Any]]:
        """Generate automation-related solutions"""
        solutions = []
        
        solutions.append({
            'type': 'automation_fix',
            'description': 'Fix flow or workflow configuration',
            'steps': [
                'Review flow entry criteria',
                'Check for conflicting automation',
                'Adjust execution order if needed',
                'Test thoroughly before deployment'
            ],
            'risk_level': 'medium',
            'automation_possible': True
        })
        
        return solutions
    
    def _generate_config_solution(self) -> List[Dict[str, Any]]:
        """Generate configuration solutions"""
        solutions = []
        
        solutions.append({
            'type': 'configuration_fix',
            'description': 'Update system configuration',
            'steps': [
                'Review current configuration',
                'Identify incorrect settings',
                'Update configuration',
                'Verify changes'
            ],
            'risk_level': 'low',
            'automation_possible': True
        })
        
        return solutions
    
    def _generate_data_solution(self) -> List[Dict[str, Any]]:
        """Generate data-related solutions"""
        solutions = []
        
        solutions.append({
            'type': 'data_fix',
            'description': 'Clean and correct data issues',
            'steps': [
                'Identify problematic records',
                'Create data backup',
                'Execute data correction',
                'Verify data integrity'
            ],
            'risk_level': 'high',
            'automation_possible': False
        })
        
        return solutions
    
    def _generate_performance_solution(self) -> List[Dict[str, Any]]:
        """Generate performance solutions"""
        solutions = []
        
        solutions.append({
            'type': 'performance_fix',
            'description': 'Optimize system performance',
            'steps': [
                'Analyze slow queries',
                'Add appropriate indexes',
                'Optimize code logic',
                'Implement caching where appropriate'
            ],
            'risk_level': 'medium',
            'automation_possible': True
        })
        
        return solutions
    
    # Knowledge Base Methods
    
    def _save_to_knowledge_base(self):
        """Save investigation to knowledge base"""
        conn = sqlite3.connect(self.knowledge_base_path)
        cursor = conn.cursor()
        
        # Save investigation
        cursor.execute("""
            INSERT INTO investigations (
                id, issue_description, category, status, 
                started_at, completed_at, root_cause, 
                confidence_level, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            self.current_investigation.investigation_id,
            self.current_investigation.issue_description,
            self.current_investigation.category.value,
            self.current_investigation.status.value,
            self.current_investigation.started_at.isoformat(),
            self.current_investigation.completed_at.isoformat() if self.current_investigation.completed_at else None,
            self.current_investigation.root_cause,
            self.current_investigation.confidence_level.value if self.current_investigation.confidence_level else None,
            json.dumps(self.current_investigation.metadata)
        ))
        
        # Save evidence
        for evidence in self.current_investigation.evidence_collected:
            cursor.execute("""
                INSERT INTO evidence (
                    id, investigation_id, type, description,
                    data, source, collected_at, relevance_score
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                evidence.evidence_id,
                self.current_investigation.investigation_id,
                evidence.type,
                evidence.description,
                json.dumps(evidence.data),
                evidence.source,
                evidence.collected_at.isoformat(),
                evidence.relevance_score
            ))
        
        # Save hypotheses
        for hypothesis in self.current_investigation.hypotheses:
            cursor.execute("""
                INSERT INTO hypotheses (
                    id, investigation_id, description, category,
                    probability, confidence, test_results
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                hypothesis.hypothesis_id,
                self.current_investigation.investigation_id,
                hypothesis.description,
                hypothesis.category.value,
                hypothesis.probability,
                hypothesis.confidence.name if hypothesis.confidence else None,
                json.dumps(hypothesis.test_results)
            ))
        
        conn.commit()
        conn.close()
    
    def _update_patterns(self):
        """Update patterns based on investigation results"""
        if not self.current_investigation.root_cause:
            return
        
        conn = sqlite3.connect(self.knowledge_base_path)
        cursor = conn.cursor()
        
        # Check if pattern exists
        pattern = f"{self.current_investigation.category.value}:{self.current_investigation.root_cause}"
        
        cursor.execute("""
            SELECT id, occurrences FROM patterns
            WHERE issue_pattern = ?
        """, (pattern,))
        
        existing = cursor.fetchone()
        
        if existing:
            # Update existing pattern
            cursor.execute("""
                UPDATE patterns
                SET occurrences = occurrences + 1
                WHERE id = ?
            """, (existing[0],))
        else:
            # Create new pattern
            cursor.execute("""
                INSERT INTO patterns (
                    issue_pattern, root_cause_pattern, 
                    solution_pattern, occurrences, success_rate
                ) VALUES (?, ?, ?, 1, 0.0)
            """, (
                pattern,
                self.current_investigation.root_cause,
                json.dumps(self.current_investigation.recommended_solutions)
            ))
        
        conn.commit()
        conn.close()
    
    def get_similar_investigations(self, issue_description: str, 
                                  limit: int = 5) -> List[Dict[str, Any]]:
        """Find similar past investigations"""
        conn = sqlite3.connect(self.knowledge_base_path)
        cursor = conn.cursor()
        
        # Simple similarity search (can be enhanced with better text matching)
        cursor.execute("""
            SELECT * FROM investigations
            WHERE issue_description LIKE ?
            ORDER BY completed_at DESC
            LIMIT ?
        """, (f"%{issue_description[:20]}%", limit))
        
        results = []
        for row in cursor.fetchall():
            results.append({
                'id': row[0],
                'issue': row[1],
                'category': row[2],
                'root_cause': row[6],
                'confidence': row[7]
            })
        
        conn.close()
        return results
    
    def get_investigation_report(self) -> Dict[str, Any]:
        """Get a complete investigation report"""
        if not self.current_investigation:
            return {}
        
        report = {
            'investigation_id': self.current_investigation.investigation_id,
            'issue': self.current_investigation.issue_description,
            'category': self.current_investigation.category.value,
            'status': self.current_investigation.status.value,
            'started_at': self.current_investigation.started_at.isoformat(),
            'completed_at': self.current_investigation.completed_at.isoformat() if self.current_investigation.completed_at else None,
            'duration': str(self.current_investigation.completed_at - self.current_investigation.started_at) if self.current_investigation.completed_at else None,
            'evidence_collected': len(self.current_investigation.evidence_collected),
            'hypotheses_tested': len(self.current_investigation.hypotheses),
            'root_cause': self.current_investigation.root_cause,
            'confidence': self.current_investigation.confidence_level.name if self.current_investigation.confidence_level else None,
            'confidence_value': self.current_investigation.confidence_level.value if self.current_investigation.confidence_level else None,
            'solutions': self.current_investigation.recommended_solutions,
            'evidence_summary': [e.to_dict() for e in self.current_investigation.evidence_collected[:5]],
            'top_hypotheses': [
                {
                    'description': h.description,
                    'confidence': h.confidence.name if h.confidence else None,
                    'supporting_evidence': len(h.supporting_evidence),
                    'test_results': h.test_results
                }
                for h in sorted(
                    self.current_investigation.hypotheses,
                    key=lambda x: x.confidence.value if x.confidence else 0,
                    reverse=True
                )[:3]
            ]
        }
        
        return report


def main():
    """Main function for testing"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Autonomous Investigation Engine')
    parser.add_argument('issue', help='Issue description to investigate')
    parser.add_argument('--object', help='Salesforce object name')
    parser.add_argument('--field', help='Field name')
    parser.add_argument('--org', help='Org alias')
    parser.add_argument('--output', help='Output file for report')
    
    args = parser.parse_args()
    
    # Create context
    context = {}
    if args.object:
        context['object_name'] = args.object
    if args.field:
        context['field_name'] = args.field
    if args.org:
        context['org_alias'] = args.org
    
    # Initialize engine
    engine = InvestigationEngine()
    
    # Start investigation
    print(f"Starting investigation: {args.issue}")
    investigation = engine.initiate_investigation(args.issue, context)
    
    # Get report
    report = engine.get_investigation_report()
    
    # Output report
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"Report saved to {args.output}")
    else:
        print(json.dumps(report, indent=2))
    
    # Print summary
    print("\n=== Investigation Summary ===")
    print(f"Root Cause: {report.get('root_cause', 'Unknown')}")
    print(f"Confidence: {report.get('confidence', 'Unknown')}")
    print(f"Solutions: {len(report.get('solutions', []))}")


if __name__ == '__main__':
    main()
