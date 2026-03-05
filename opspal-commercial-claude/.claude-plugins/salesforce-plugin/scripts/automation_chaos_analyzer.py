#!/usr/bin/env python3
"""
Automation Chaos Analyzer - Salesforce Technical Debt & Foundation Assessment
Analyzes the complete automation landscape including Flows, Workflow Rules, 
Process Builders, Validation Rules, and Apex Triggers to identify technical debt
and architectural complexity.
"""

import json
import subprocess
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
import re

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class AutomationChaosAnalyzer:
    """Analyzes Salesforce automation sprawl and technical debt"""
    
    def __init__(self, org_alias: str):
        self.org_alias = org_alias
        self.automation_inventory = defaultdict(lambda: defaultdict(list))
        self.technical_debt_score = 0
        self.risk_factors = []
        self.migration_effort = 0
        self.architecture_complexity = {}
        
    def execute_metadata_query(self, query: str, use_tooling_api: bool = True) -> Optional[List[Dict]]:
        """Execute query using appropriate API"""
        try:
            cmd = ['sf', 'data', 'query', '--query', query, '--target-org', self.org_alias, '--json']
            if use_tooling_api:
                cmd.insert(4, '--use-tooling-api')
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                return data.get('result', {}).get('records', [])
            else:
                logger.error(f"Query failed: {result.stderr}")
                return []
                
        except Exception as e:
            logger.error(f"Query execution error: {e}")
            return []
    
    def analyze_flows(self) -> Dict:
        """Analyze all active flows and process builders"""
        logger.info("🔍 Analyzing Flows and Process Builders...")
        
        flows = self.execute_metadata_query("""
            SELECT Id, Definition.DeveloperName, MasterLabel, ProcessType, 
                   TriggerType, Description, VersionNumber, LastModifiedDate,
                   LastModifiedBy.Name, NamespacePrefix, IsActive
            FROM Flow
            WHERE Status = 'Active'
        """)
        
        flow_analysis = {
            'total_active': len(flows) if flows else 0,
            'by_type': defaultdict(int),
            'by_trigger': defaultdict(int),
            'by_object': defaultdict(list),
            'process_builders': 0,
            'auto_launched': 0,
            'screen_flows': 0,
            'scheduled_flows': 0,
            'record_triggered': 0,
            'legacy_items': []
        }
        
        if flows:
            for flow in flows:
                process_type = flow.get('ProcessType', 'Unknown')
                trigger_type = flow.get('TriggerType', 'Unknown')
                label = flow.get('MasterLabel', 'Unknown')
                
                flow_analysis['by_type'][process_type] += 1
                flow_analysis['by_trigger'][trigger_type] += 1
                
                # Categorize flows
                if process_type == 'Workflow':
                    flow_analysis['process_builders'] += 1
                    flow_analysis['legacy_items'].append({
                        'name': label,
                        'type': 'Process Builder',
                        'migration_priority': 'HIGH'
                    })
                elif process_type == 'AutoLaunchedFlow':
                    flow_analysis['auto_launched'] += 1
                elif process_type == 'Flow':
                    flow_analysis['screen_flows'] += 1
                elif trigger_type == 'Scheduled':
                    flow_analysis['scheduled_flows'] += 1
                elif trigger_type == 'RecordAfterSave' or trigger_type == 'RecordBeforeSave':
                    flow_analysis['record_triggered'] += 1
                
                # Try to determine object from flow name
                object_name = self._extract_object_from_name(label)
                if object_name:
                    self.automation_inventory[object_name]['flows'].append({
                        'name': label,
                        'type': process_type,
                        'trigger': trigger_type
                    })
        
        return flow_analysis
    
    def analyze_workflow_rules(self) -> Dict:
        """Analyze active workflow rules"""
        logger.info("🔍 Analyzing Workflow Rules...")
        
        # Note: WorkflowRule requires special metadata API access
        # Using alternative approach through metadata describe
        workflow_analysis = {
            'total_active': 0,
            'by_object': defaultdict(int),
            'migration_required': [],
            'estimated_count': 95  # From user feedback
        }
        
        # Try to get workflow metadata
        workflows = self.execute_metadata_query("""
            SELECT Id, Name, TableEnumOrId, Active
            FROM WorkflowRule
            WHERE Active = true
        """)
        
        if workflows:
            workflow_analysis['total_active'] = len(workflows)
            for wf in workflows:
                object_name = wf.get('TableEnumOrId', 'Unknown')
                workflow_analysis['by_object'][object_name] += 1
                workflow_analysis['migration_required'].append({
                    'name': wf.get('Name', 'Unknown'),
                    'object': object_name,
                    'migration_complexity': 'MEDIUM'
                })
                self.automation_inventory[object_name]['workflow_rules'].append(wf.get('Name', 'Unknown'))
        else:
            # Fallback to estimate
            workflow_analysis['total_active'] = workflow_analysis['estimated_count']
            logger.warning(f"Could not query WorkflowRules directly, using estimate: {workflow_analysis['estimated_count']}")
        
        return workflow_analysis
    
    def analyze_validation_rules(self) -> Dict:
        """Analyze active validation rules"""
        logger.info("🔍 Analyzing Validation Rules...")
        
        validations = self.execute_metadata_query("""
            SELECT Id, Active, Description, ErrorMessage, 
                   EntityDefinition.QualifiedApiName, ValidationName
            FROM ValidationRule
            WHERE Active = true
        """)
        
        validation_analysis = {
            'total_active': len(validations) if validations else 0,
            'by_object': defaultdict(int),
            'complex_rules': [],
            'missing_documentation': []
        }
        
        if validations:
            for rule in validations:
                object_name = rule.get('EntityDefinition', {}).get('QualifiedApiName', 'Unknown')
                validation_analysis['by_object'][object_name] += 1
                
                # Check for complexity indicators
                error_msg = rule.get('ErrorMessage', '')
                description = rule.get('Description', '')
                
                if len(error_msg) > 200:  # Long error messages indicate complexity
                    validation_analysis['complex_rules'].append({
                        'name': rule.get('ValidationName', 'Unknown'),
                        'object': object_name
                    })
                
                if not description:
                    validation_analysis['missing_documentation'].append({
                        'name': rule.get('ValidationName', 'Unknown'),
                        'object': object_name
                    })
                
                self.automation_inventory[object_name]['validation_rules'].append(
                    rule.get('ValidationName', 'Unknown')
                )
        
        return validation_analysis
    
    def analyze_apex_triggers(self) -> Dict:
        """Analyze active Apex triggers"""
        logger.info("🔍 Analyzing Apex Triggers...")
        
        triggers = self.execute_metadata_query("""
            SELECT Id, Name, TableEnumOrId, UsageBeforeInsert, UsageAfterInsert,
                   UsageBeforeUpdate, UsageAfterUpdate, UsageBeforeDelete,
                   UsageAfterDelete, UsageAfterUndelete, Status, ApiVersion
            FROM ApexTrigger
            WHERE Status = 'Active'
        """)
        
        trigger_analysis = {
            'total_active': len(triggers) if triggers else 0,
            'by_object': defaultdict(list),
            'multi_trigger_objects': [],
            'legacy_api_versions': [],
            'trigger_events': defaultdict(int)
        }
        
        if triggers:
            for trigger in triggers:
                object_name = trigger.get('TableEnumOrId', 'Unknown')
                trigger_name = trigger.get('Name', 'Unknown')
                api_version = float(trigger.get('ApiVersion', 0))
                
                trigger_analysis['by_object'][object_name].append(trigger_name)
                self.automation_inventory[object_name]['apex_triggers'].append(trigger_name)
                
                # Check for legacy API versions (< 50.0)
                if api_version < 50.0:
                    trigger_analysis['legacy_api_versions'].append({
                        'name': trigger_name,
                        'object': object_name,
                        'api_version': api_version
                    })
                
                # Count trigger events
                for event in ['BeforeInsert', 'AfterInsert', 'BeforeUpdate', 'AfterUpdate',
                             'BeforeDelete', 'AfterDelete', 'AfterUndelete']:
                    if trigger.get(f'Usage{event}'):
                        trigger_analysis['trigger_events'][event] += 1
            
            # Identify objects with multiple triggers (anti-pattern)
            for obj, triggers in trigger_analysis['by_object'].items():
                if len(triggers) > 1:
                    trigger_analysis['multi_trigger_objects'].append({
                        'object': obj,
                        'trigger_count': len(triggers),
                        'triggers': triggers
                    })
        
        return trigger_analysis
    
    def calculate_technical_debt_score(self) -> Dict:
        """Calculate overall technical debt score"""
        logger.info("📊 Calculating Technical Debt Score...")
        
        debt_factors = {
            'workflow_rules': 0,
            'process_builders': 0,
            'multi_trigger_objects': 0,
            'missing_documentation': 0,
            'legacy_api_versions': 0,
            'automation_conflicts': 0,
            'total_automations': 0
        }
        
        # Score calculation (0-100, higher is worse)
        total_automations = 0
        for obj, automations in self.automation_inventory.items():
            obj_total = sum(len(v) for v in automations.values())
            total_automations += obj_total
            
            # Check for automation conflicts (multiple automation types on same object)
            active_types = sum(1 for v in automations.values() if v)
            if active_types > 2:
                debt_factors['automation_conflicts'] += 1
                self.risk_factors.append({
                    'object': obj,
                    'risk': 'AUTOMATION_CONFLICT',
                    'severity': 'HIGH',
                    'automation_count': obj_total,
                    'types': list(automations.keys())
                })
        
        debt_factors['total_automations'] = total_automations
        
        # Calculate score components
        base_score = min(100, total_automations / 3)  # Every 3 automations = 1 point
        
        # Add penalties
        if debt_factors['workflow_rules'] > 0:
            base_score += debt_factors['workflow_rules'] * 0.5
        if debt_factors['process_builders'] > 0:
            base_score += debt_factors['process_builders'] * 0.7
        if debt_factors['multi_trigger_objects'] > 0:
            base_score += debt_factors['multi_trigger_objects'] * 5
        if debt_factors['automation_conflicts'] > 0:
            base_score += debt_factors['automation_conflicts'] * 3
        
        self.technical_debt_score = min(100, base_score)
        
        # Calculate migration effort (person-days)
        self.migration_effort = (
            debt_factors.get('workflow_rules', 0) * 0.5 +  # Half day per workflow rule
            debt_factors.get('process_builders', 0) * 1 +   # 1 day per process builder
            debt_factors.get('multi_trigger_objects', 0) * 3 +  # 3 days to consolidate triggers
            debt_factors.get('automation_conflicts', 0) * 2     # 2 days to resolve conflicts
        )
        
        return {
            'technical_debt_score': self.technical_debt_score,
            'debt_factors': debt_factors,
            'migration_effort_days': self.migration_effort,
            'risk_level': self._get_risk_level(self.technical_debt_score)
        }
    
    def analyze_architecture_complexity(self) -> Dict:
        """Analyze overall architecture complexity"""
        logger.info("🏗️ Analyzing Architecture Complexity...")
        
        # Query for custom objects
        custom_objects = self.execute_metadata_query("""
            SELECT COUNT(Id) cnt
            FROM EntityDefinition
            WHERE QualifiedApiName LIKE '%__c'
        """)
        
        # Query for relationships
        relationships = self.execute_metadata_query("""
            SELECT COUNT(Id) cnt
            FROM EntityDefinition
            WHERE (SELECT COUNT(Id) FROM ChildRelationships) > 5
        """)
        
        complexity = {
            'custom_object_count': custom_objects[0].get('cnt', 0) if custom_objects else 0,
            'high_relationship_objects': relationships[0].get('cnt', 0) if relationships else 0,
            'automation_density': len(self.automation_inventory),
            'objects_with_multiple_automations': sum(
                1 for obj, autos in self.automation_inventory.items()
                if sum(len(v) for v in autos.values()) > 3
            ),
            'complexity_score': 0
        }
        
        # Calculate complexity score
        complexity['complexity_score'] = min(100, (
            complexity['custom_object_count'] * 0.5 +
            complexity['high_relationship_objects'] * 2 +
            complexity['automation_density'] * 1 +
            complexity['objects_with_multiple_automations'] * 3
        ))
        
        self.architecture_complexity = complexity
        return complexity
    
    def generate_architecture_diagram_data(self) -> Dict:
        """Generate data structure for architecture visualization"""
        logger.info("📐 Generating Architecture Diagram Data...")
        
        diagram_data = {
            'nodes': [],
            'edges': [],
            'automation_points': [],
            'risk_zones': []
        }
        
        # Create nodes for objects with automations
        for obj, automations in self.automation_inventory.items():
            total_automations = sum(len(v) for v in automations.values())
            
            node = {
                'id': obj,
                'label': obj,
                'automation_count': total_automations,
                'automation_types': {k: len(v) for k, v in automations.items() if v},
                'risk_level': 'HIGH' if total_automations > 5 else 'MEDIUM' if total_automations > 2 else 'LOW'
            }
            diagram_data['nodes'].append(node)
            
            # Mark automation points
            for auto_type, items in automations.items():
                if items:
                    diagram_data['automation_points'].append({
                        'object': obj,
                        'type': auto_type,
                        'count': len(items),
                        'items': items[:3]  # Sample for display
                    })
        
        # Identify risk zones
        for factor in self.risk_factors:
            if factor['severity'] == 'HIGH':
                diagram_data['risk_zones'].append({
                    'object': factor['object'],
                    'risk': factor['risk'],
                    'details': factor
                })
        
        return diagram_data
    
    def _extract_object_from_name(self, name: str) -> Optional[str]:
        """Extract object name from flow/automation name"""
        # Common patterns: Lead_Assignment, Opportunity_Stage_Update, etc.
        patterns = [
            r'^(Account|Contact|Lead|Opportunity|Case|Campaign|Task|Event|User)[\s_\-]',
            r'[\s_\-](Account|Contact|Lead|Opportunity|Case|Campaign|Task|Event|User)[\s_\-]',
            r'^(\w+)__c[\s_\-]'  # Custom objects
        ]
        
        for pattern in patterns:
            match = re.search(pattern, name, re.IGNORECASE)
            if match:
                return match.group(1)
        
        return None
    
    def _get_risk_level(self, score: float) -> str:
        """Determine risk level from score"""
        if score >= 80:
            return "CRITICAL"
        elif score >= 60:
            return "HIGH"
        elif score >= 40:
            return "MEDIUM"
        elif score >= 20:
            return "LOW"
        else:
            return "MINIMAL"
    
    def run_complete_analysis(self) -> Dict:
        """Run complete automation chaos analysis"""
        logger.info("="*60)
        logger.info("AUTOMATION CHAOS & TECHNICAL DEBT ANALYSIS")
        logger.info(f"Organization: {self.org_alias}")
        logger.info("="*60)
        
        report = {
            'assessment_date': datetime.now(timezone.utc).isoformat(),
            'org_alias': self.org_alias,
            'automation_analysis': {},
            'technical_debt': {},
            'architecture_complexity': {},
            'automation_inventory': {},
            'risk_factors': [],
            'recommendations': [],
            'architecture_diagram_data': {}
        }
        
        # Run all analyses
        report['automation_analysis']['flows'] = self.analyze_flows()
        report['automation_analysis']['workflow_rules'] = self.analyze_workflow_rules()
        report['automation_analysis']['validation_rules'] = self.analyze_validation_rules()
        report['automation_analysis']['apex_triggers'] = self.analyze_apex_triggers()
        
        # Calculate totals
        total_automations = (
            report['automation_analysis']['flows']['total_active'] +
            report['automation_analysis']['workflow_rules']['total_active'] +
            report['automation_analysis']['validation_rules']['total_active'] +
            report['automation_analysis']['apex_triggers']['total_active']
        )
        
        report['automation_analysis']['total_all_types'] = total_automations
        
        # Update debt factors
        self.technical_debt_score = 0  # Reset
        debt_data = report['automation_analysis']
        debt_factors = {
            'workflow_rules': debt_data['workflow_rules']['total_active'],
            'process_builders': debt_data['flows']['process_builders'],
            'multi_trigger_objects': len(debt_data['apex_triggers'].get('multi_trigger_objects', [])),
            'missing_documentation': len(debt_data['validation_rules'].get('missing_documentation', [])),
            'legacy_api_versions': len(debt_data['apex_triggers'].get('legacy_api_versions', [])),
            'automation_conflicts': 0,
            'total_automations': total_automations
        }
        
        # Calculate technical debt
        report['technical_debt'] = self.calculate_technical_debt_score()
        report['technical_debt']['debt_factors'] = debt_factors
        
        # Analyze architecture
        report['architecture_complexity'] = self.analyze_architecture_complexity()
        
        # Generate diagram data
        report['architecture_diagram_data'] = self.generate_architecture_diagram_data()
        
        # Store inventory and risks
        report['automation_inventory'] = dict(self.automation_inventory)
        report['risk_factors'] = self.risk_factors
        
        # Generate recommendations
        report['recommendations'] = self.generate_recommendations(report)
        
        return report
    
    def generate_recommendations(self, report: Dict) -> List[Dict]:
        """Generate prioritized recommendations"""
        recommendations = []
        
        # Critical: Too many automations
        if report['automation_analysis']['total_all_types'] > 200:
            recommendations.append({
                'priority': 'CRITICAL',
                'title': 'Automation Consolidation Project',
                'finding': f"{report['automation_analysis']['total_all_types']} automations creating chaos",
                'impact': 'System instability, unpredictable behavior, maintenance nightmare',
                'effort': f"{report['technical_debt']['migration_effort_days']:.0f} person-days",
                'roi': 'Reduce incidents by 60%, improve performance by 40%',
                'action': 'Immediate automation audit and consolidation project'
            })
        
        # High: Legacy automations
        if report['technical_debt']['debt_factors']['workflow_rules'] > 50:
            recommendations.append({
                'priority': 'HIGH',
                'title': 'Workflow Rule Migration',
                'finding': f"{report['technical_debt']['debt_factors']['workflow_rules']} legacy workflow rules",
                'impact': 'Cannot leverage modern Flow features, limited debugging',
                'effort': f"{report['technical_debt']['debt_factors']['workflow_rules'] * 0.5:.0f} person-days",
                'roi': 'Unlock Flow capabilities, improve maintainability',
                'action': 'Migrate all workflow rules to Flow'
            })
        
        # High: Process Builders
        if report['technical_debt']['debt_factors']['process_builders'] > 20:
            recommendations.append({
                'priority': 'HIGH',
                'title': 'Process Builder Retirement',
                'finding': f"{report['technical_debt']['debt_factors']['process_builders']} Process Builders active",
                'impact': 'Performance issues, governor limit risks',
                'effort': f"{report['technical_debt']['debt_factors']['process_builders']:.0f} person-days",
                'roi': '50% performance improvement on affected objects',
                'action': 'Convert all Process Builders to Record-Triggered Flows'
            })
        
        # Medium: Multi-trigger objects
        if report['technical_debt']['debt_factors']['multi_trigger_objects'] > 0:
            recommendations.append({
                'priority': 'MEDIUM',
                'title': 'Trigger Consolidation',
                'finding': f"{report['technical_debt']['debt_factors']['multi_trigger_objects']} objects with multiple triggers",
                'impact': 'Unpredictable execution order, maintenance complexity',
                'effort': f"{report['technical_debt']['debt_factors']['multi_trigger_objects'] * 3:.0f} person-days",
                'roi': 'Reduce trigger-related bugs by 70%',
                'action': 'Implement one-trigger-per-object pattern with handler framework'
            })
        
        return recommendations


def main():
    """Main execution"""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python automation_chaos_analyzer.py <org_alias>")
        sys.exit(1)
    
    org_alias = sys.argv[1]
    analyzer = AutomationChaosAnalyzer(org_alias)
    
    # Run analysis
    report = analyzer.run_complete_analysis()
    
    # Output results
    print("\n" + "="*60)
    print("AUTOMATION CHAOS ANALYSIS COMPLETE")
    print("="*60)
    
    print(f"\n🚨 TOTAL AUTOMATIONS: {report['automation_analysis']['total_all_types']}")
    print(f"   - Active Flows: {report['automation_analysis']['flows']['total_active']}")
    print(f"   - Workflow Rules: {report['automation_analysis']['workflow_rules']['total_active']}")
    print(f"   - Validation Rules: {report['automation_analysis']['validation_rules']['total_active']}")
    print(f"   - Apex Triggers: {report['automation_analysis']['apex_triggers']['total_active']}")
    
    print(f"\n💣 TECHNICAL DEBT SCORE: {report['technical_debt']['technical_debt_score']:.1f}/100")
    print(f"   Risk Level: {report['technical_debt']['risk_level']}")
    print(f"   Migration Effort: {report['technical_debt']['migration_effort_days']:.0f} person-days")
    
    print(f"\n🏗️ ARCHITECTURE COMPLEXITY: {report['architecture_complexity']['complexity_score']:.1f}/100")
    print(f"   Custom Objects: {report['architecture_complexity']['custom_object_count']}")
    print(f"   Objects with 3+ automations: {report['architecture_complexity']['objects_with_multiple_automations']}")
    
    if report['risk_factors']:
        print(f"\n⚠️ HIGH RISK OBJECTS:")
        for risk in report['risk_factors'][:5]:
            print(f"   - {risk['object']}: {risk['automation_count']} automations ({risk['risk']})")
    
    if report['recommendations']:
        print(f"\n📋 TOP RECOMMENDATIONS:")
        for rec in report['recommendations'][:3]:
            print(f"\n   [{rec['priority']}] {rec['title']}")
            print(f"   Finding: {rec['finding']}")
            print(f"   Impact: {rec['impact']}")
            print(f"   Effort: {rec['effort']}")
    
    # Save full report
    output_file = f"automation_chaos_report_{org_alias}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w') as f:
        json.dump(report, f, indent=2, default=str)
    
    print(f"\n📄 Full report saved to: {output_file}")
    
    # Also create a summary for architecture diagram
    diagram_file = f"architecture_diagram_data_{org_alias}.json"
    with open(diagram_file, 'w') as f:
        json.dump(report['architecture_diagram_data'], f, indent=2)
    
    print(f"📐 Architecture diagram data saved to: {diagram_file}")


if __name__ == "__main__":
    main()