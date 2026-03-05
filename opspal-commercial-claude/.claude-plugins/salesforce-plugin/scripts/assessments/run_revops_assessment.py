#!/usr/bin/env python3
"""
Direct RevOps Assessment Runner with Evidence-Based Analysis
"""

import subprocess
import json
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Tuple
import logging
import statistics
from scripts.lib.safe_query_executor import SafeQueryExecutorPy
from scripts.lib.error_prevention import parse_sf_datetime

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EvidenceBasedRevOpsAuditor:
    """Evidence-based RevOps auditor with specific examples for each finding"""
    
    def __init__(self, org_alias: str):
        self.org_alias = org_alias
        self.findings = []
        self.query_count = 0
        self.successful_queries = 0
        self.failed_queries = 0
        self.evidence_requirements = 3  # Number of specific examples per finding
        self._sq = SafeQueryExecutorPy(org_alias)
    
    def _parse_sf_datetime(self, date_str: str):
        """Delegate to shared datetime parser for consistency"""
        return parse_sf_datetime(date_str)
        
    def _needs_tooling_api(self, query: str) -> bool:
        tooling_objects = {
            'Flow', 'FlowDefinition', 'FlowDefinitionView', 'ValidationRule',
            'FlexiPage', 'Layout', 'FieldDefinition', 'EntityDefinition',
            'ApexClass', 'ApexTrigger', 'ApexTestQueueItem', 'ApexCodeCoverage',
            'ApexCodeCoverageAggregate'
        }
        upper = query.upper()
        if ' FROM ' not in upper:
            return False
        try:
            from_part = upper.split(' FROM ', 1)[1]
            # strip subselects
            while '(' in from_part and ')' in from_part:
                start = from_part.find('(')
                end = from_part.find(')', start)
                if end == -1:
                    break
                from_part = from_part[:start] + from_part[end + 1:]
            first_token = from_part.strip().split()[0]
            return first_token in {s.upper() for s in tooling_objects}
        except Exception:
            return False

    def _execute_soql(self, query: str, description: str = "", paginate: bool = False) -> List[Dict]:
        """Execute SOQL query with shared SafeQueryExecutor (Tooling detection, retry, pagination)."""
        self.query_count += 1
        logger.info(f"Executing query {self.query_count}: {description}")
        try:
            records = self._sq.run(query, description=description, paginate=paginate)
            self.successful_queries += 1
            logger.info(f"✅ Query successful: {len(records)} records retrieved")
            return records
        except Exception as e:
            self.failed_queries += 1
            logger.error(f"❌ Query failed: {e}")
            return []
    
    def assess_gtm_architecture(self):
        """Assess GTM Architecture with specific evidence"""
        logger.info("\n" + "="*60)
        logger.info("ANALYZING GTM ARCHITECTURE & CRM FOUNDATIONS")
        logger.info("="*60)
        
        findings = {}
        
        # 1. Lead Conversion Analysis
        leads = self._execute_soql("""
            SELECT Id, Name, Company, Status, LeadSource, ConvertedDate, 
                   ConvertedOpportunityId, ConvertedContactId, ConvertedAccountId,
                   CreatedDate, LastModifiedDate, OwnerId, Owner.Name,
                   IsConverted, Email, Phone, Title, Industry, 
                   NumberOfEmployees, AnnualRevenue, Rating, Website
            FROM Lead 
            WHERE CreatedDate >= LAST_N_MONTHS:6
            ORDER BY CreatedDate DESC
            LIMIT 300
        """, "Lead conversion patterns")
        
        if leads:
            # Analyze conversion patterns
            converted = [l for l in leads if l.get('IsConverted')]
            not_converted = [l for l in leads if not l.get('IsConverted')]
            conversion_rate = len(converted) / len(leads) * 100
            
            # Get specific examples of converted leads
            converted_examples = []
            for lead in converted[:3]:
                days_to_convert = 0
                if lead.get('ConvertedDate') and lead.get('CreatedDate'):
                    created = self._parse_sf_datetime(lead['CreatedDate'])
                    converted_date = self._parse_sf_datetime(lead['ConvertedDate'])
                    days_to_convert = (converted_date - created).days
                
                converted_examples.append({
                    'lead_id': lead['Id'],
                    'name': lead.get('Name', 'Unknown'),
                    'company': lead.get('Company', 'Unknown'),
                    'source': lead.get('LeadSource', 'Unknown'),
                    'days_to_convert': days_to_convert,
                    'converted_to_opp': lead.get('ConvertedOpportunityId', 'No Opportunity'),
                    'owner': lead.get('Owner', {}).get('Name', 'Unknown')
                })
            
            # Get examples of stuck leads
            stuck_examples = []
            for lead in not_converted[:3]:
                age_days = 0
                if lead.get('CreatedDate'):
                    created = self._parse_sf_datetime(lead['CreatedDate'])
                    age_days = (datetime.now(timezone.utc) - created).days
                
                stuck_examples.append({
                    'lead_id': lead['Id'],
                    'name': lead.get('Name', 'Unknown'),
                    'company': lead.get('Company', 'Unknown'),
                    'status': lead.get('Status', 'Unknown'),
                    'age_days': age_days,
                    'source': lead.get('LeadSource', 'Unknown'),
                    'owner': lead.get('Owner', {}).get('Name', 'Unknown')
                })
            
            findings['lead_conversion'] = {
                'total_leads': len(leads),
                'converted_count': len(converted),
                'conversion_rate': conversion_rate,
                'converted_examples': converted_examples,
                'stuck_examples': stuck_examples
            }
        
        # 2. Opportunity Pipeline Analysis
        opportunities = self._execute_soql("""
            SELECT Id, Name, StageName, Amount, CloseDate, CreatedDate,
                   LastModifiedDate, IsWon, IsClosed, LeadSource, Type,
                   Owner.Name, Account.Name, Account.Industry,
                   Probability, ForecastCategory, NextStep,
                   Description, HasOpportunityLineItem
            FROM Opportunity 
            WHERE CreatedDate >= LAST_N_MONTHS:6
            ORDER BY CreatedDate DESC
            LIMIT 200
        """, "Opportunity pipeline analysis")
        
        if opportunities:
            won_opps = [o for o in opportunities if o.get('IsWon')]
            lost_opps = [o for o in opportunities if o.get('IsClosed') and not o.get('IsWon')]
            open_opps = [o for o in opportunities if not o.get('IsClosed')]
            
            # Get specific won opportunity examples
            won_examples = []
            for opp in won_opps[:3]:
                cycle_days = 0
                if opp.get('CloseDate') and opp.get('CreatedDate'):
                    created = self._parse_sf_datetime(opp['CreatedDate'])
                    closed = self._parse_sf_datetime(opp['CloseDate'])
                    cycle_days = (closed - created).days
                
                won_examples.append({
                    'opp_id': opp['Id'],
                    'name': opp.get('Name', 'Unknown'),
                    'account': opp.get('Account', {}).get('Name', 'Unknown'),
                    'amount': opp.get('Amount', 0),
                    'source': opp.get('LeadSource', 'Unknown'),
                    'cycle_days': cycle_days,
                    'owner': opp.get('Owner', {}).get('Name', 'Unknown')
                })
            
            # Get stuck opportunity examples
            stuck_opp_examples = []
            for opp in open_opps[:3]:
                age_days = 0
                if opp.get('CreatedDate'):
                    created = self._parse_sf_datetime(opp['CreatedDate'])
                    age_days = (datetime.now(timezone.utc) - created).days
                
                stuck_opp_examples.append({
                    'opp_id': opp['Id'],
                    'name': opp.get('Name', 'Unknown'),
                    'stage': opp.get('StageName', 'Unknown'),
                    'amount': opp.get('Amount', 0),
                    'age_days': age_days,
                    'next_step': opp.get('NextStep', 'None defined'),
                    'owner': opp.get('Owner', {}).get('Name', 'Unknown')
                })
            
            findings['opportunity_pipeline'] = {
                'total_opportunities': len(opportunities),
                'won_count': len(won_opps),
                'lost_count': len(lost_opps),
                'open_count': len(open_opps),
                'win_rate': len(won_opps) / (len(won_opps) + len(lost_opps)) * 100 if (won_opps or lost_opps) else 0,
                'won_examples': won_examples,
                'stuck_examples': stuck_opp_examples
            }
        
        # 3. Account Hierarchy Analysis
        accounts = self._execute_soql("""
            SELECT Id, Name, Type, Industry, AnnualRevenue, NumberOfEmployees,
                   ParentId, Parent.Name, BillingCountry, BillingState,
                   CreatedDate, LastModifiedDate, Owner.Name,
                   (SELECT Id FROM ChildAccounts),
                   (SELECT Id FROM Opportunities),
                   (SELECT Id FROM Contacts)
            FROM Account 
            WHERE CreatedDate >= LAST_N_MONTHS:12
            ORDER BY AnnualRevenue DESC NULLS LAST
            LIMIT 150
        """, "Account hierarchy and structure")
        
        if accounts:
            parent_accounts = [a for a in accounts if a.get('ChildAccounts')]
            accounts_with_opps = [a for a in accounts if a.get('Opportunities')]
            accounts_no_activity = [a for a in accounts if not a.get('Opportunities') and not a.get('Contacts')]
            
            # Get hierarchy examples
            hierarchy_examples = []
            for acc in parent_accounts[:3]:
                hierarchy_examples.append({
                    'account_id': acc['Id'],
                    'name': acc.get('Name', 'Unknown'),
                    'type': acc.get('Type', 'Unknown'),
                    'child_count': len(acc.get('ChildAccounts', [])),
                    'opportunity_count': len(acc.get('Opportunities', [])),
                    'industry': acc.get('Industry', 'Unknown')
                })
            
            # Get inactive account examples
            inactive_examples = []
            for acc in accounts_no_activity[:3]:
                age_days = 0
                if acc.get('CreatedDate'):
                    created = self._parse_sf_datetime(acc['CreatedDate'])
                    age_days = (datetime.now(timezone.utc) - created).days
                
                inactive_examples.append({
                    'account_id': acc['Id'],
                    'name': acc.get('Name', 'Unknown'),
                    'age_days': age_days,
                    'industry': acc.get('Industry', 'Unknown'),
                    'owner': acc.get('Owner', {}).get('Name', 'Unknown')
                })
            
            findings['account_structure'] = {
                'total_accounts': len(accounts),
                'parent_accounts': len(parent_accounts),
                'accounts_with_opportunities': len(accounts_with_opps),
                'inactive_accounts': len(accounts_no_activity),
                'hierarchy_examples': hierarchy_examples,
                'inactive_examples': inactive_examples
            }
        
        return findings
    
    def assess_automation_patterns(self):
        """Assess automation and manual processes with evidence"""
        logger.info("\n" + "="*60)
        logger.info("ANALYZING AUTOMATION PATTERNS")
        logger.info("="*60)
        
        findings = {}
        
        # 1. Lead Assignment Analysis
        leads = self._execute_soql("""
            SELECT Id, Name, Company, OwnerId, Owner.Name, Owner.Profile.Name,
                   CreatedById, CreatedBy.Name, LastModifiedById, LastModifiedBy.Name,
                   CreatedDate, LastModifiedDate, LeadSource, Status,
                   SystemModstamp
            FROM Lead 
            WHERE CreatedDate >= LAST_N_MONTHS:3
            ORDER BY CreatedDate DESC
            LIMIT 250
        """, "Lead assignment patterns")
        
        if leads:
            # Analyze creator vs owner patterns
            auto_assigned = []
            manual_assigned = []
            
            for lead in leads:
                if lead.get('CreatedById') != lead.get('OwnerId'):
                    # Different owner suggests assignment rule
                    time_diff = 0
                    if lead.get('SystemModstamp') and lead.get('CreatedDate'):
                        created = self._parse_sf_datetime(lead['CreatedDate'])
                        modified = self._parse_sf_datetime(lead['SystemModstamp'])
                        if created and modified:
                            time_diff = (modified - created).total_seconds()
                    
                    if time_diff < 60:  # Assigned within 1 minute suggests automation
                        auto_assigned.append(lead)
                else:
                    manual_assigned.append(lead)
            
            # Get automation examples
            auto_examples = []
            for lead in auto_assigned[:3]:
                auto_examples.append({
                    'lead_id': lead['Id'],
                    'name': lead.get('Name', 'Unknown'),
                    'company': lead.get('Company', 'Unknown'),
                    'created_by': lead.get('CreatedBy', {}).get('Name', 'Unknown'),
                    'assigned_to': lead.get('Owner', {}).get('Name', 'Unknown'),
                    'source': lead.get('LeadSource', 'Unknown')
                })
            
            # Get manual examples
            manual_examples = []
            for lead in manual_assigned[:3]:
                manual_examples.append({
                    'lead_id': lead['Id'],
                    'name': lead.get('Name', 'Unknown'),
                    'company': lead.get('Company', 'Unknown'),
                    'owner': lead.get('Owner', {}).get('Name', 'Unknown'),
                    'source': lead.get('LeadSource', 'Unknown')
                })
            
            findings['lead_assignment'] = {
                'total_analyzed': len(leads),
                'auto_assigned_count': len(auto_assigned),
                'manual_assigned_count': len(manual_assigned),
                'automation_rate': len(auto_assigned) / len(leads) * 100 if leads else 0,
                'auto_examples': auto_examples,
                'manual_examples': manual_examples
            }
        
        # 2. Flow and Process Automation
        flows = self._execute_soql("""
            SELECT Id, Definition.DeveloperName, MasterLabel, ProcessType,
                   TriggerType, IsActive, VersionNumber, LastModifiedDate,
                   LastModifiedBy.Name
            FROM Flow
            WHERE IsActive = true
            ORDER BY LastModifiedDate DESC
            LIMIT 100
        """, "Active automation flows", paginate=True)
        
        if flows:
            flow_types = {}
            trigger_types = {}
            
            for flow in flows:
                process_type = flow.get('ProcessType', 'Unknown')
                trigger_type = flow.get('TriggerType', 'Unknown')
                flow_types[process_type] = flow_types.get(process_type, 0) + 1
                trigger_types[trigger_type] = trigger_types.get(trigger_type, 0) + 1
            
            # Get flow examples
            flow_examples = []
            for flow in flows[:5]:
                flow_examples.append({
                    'name': flow.get('MasterLabel', 'Unknown'),
                    'type': flow.get('ProcessType', 'Unknown'),
                    'trigger': flow.get('TriggerType', 'Unknown'),
                    'version': flow.get('VersionNumber', 0),
                    'last_modified_by': flow.get('LastModifiedBy', {}).get('Name', 'Unknown')
                })
            
            findings['flow_automation'] = {
                'total_active_flows': len(flows),
                'flow_types': flow_types,
                'trigger_types': trigger_types,
                'flow_examples': flow_examples
            }
        
        return findings
    
    def assess_user_behavior(self):
        """Assess user behavior and adoption with evidence"""
        logger.info("\n" + "="*60)
        logger.info("ANALYZING USER BEHAVIOR & ADOPTION")
        logger.info("="*60)
        
        findings = {}
        
        # 1. User Activity Analysis
        users = self._execute_soql("""
            SELECT Id, Name, Username, Profile.Name, UserRole.Name,
                   LastLoginDate, LastPasswordChangeDate, IsActive,
                   CreatedDate, Department, Title, ManagerId
            FROM User 
            WHERE IsActive = true
            AND Profile.Name NOT IN ('System Administrator', 'Minimum Access - Salesforce')
            ORDER BY LastLoginDate DESC NULLS LAST
            LIMIT 200
        """, "Active user analysis")
        
        if users:
            now = datetime.now(timezone.utc)
            active_users = []
            inactive_users = []
            never_logged = []
            
            for user in users:
                if user.get('LastLoginDate'):
                    last_login = self._parse_sf_datetime(user['LastLoginDate'])
                    days_since = (now - last_login).days
                    
                    if days_since <= 30:
                        active_users.append(user)
                    else:
                        inactive_users.append(user)
                else:
                    never_logged.append(user)
            
            # Get active user examples
            active_examples = []
            for user in active_users[:3]:
                days_since = 0
                if user.get('LastLoginDate'):
                    last_login = self._parse_sf_datetime(user['LastLoginDate'])
                    days_since = (now - last_login).days
                
                active_examples.append({
                    'user_id': user['Id'],
                    'name': user.get('Name', 'Unknown'),
                    'profile': user.get('Profile', {}).get('Name', 'Unknown') if user.get('Profile') else 'Unknown',
                    'role': user.get('UserRole', {}).get('Name', 'No Role') if user.get('UserRole') else 'No Role',
                    'days_since_login': days_since,
                    'department': user.get('Department', 'Unknown')
                })
            
            # Get inactive user examples
            inactive_examples = []
            for user in inactive_users[:3]:
                days_since = 0
                if user.get('LastLoginDate'):
                    last_login = self._parse_sf_datetime(user['LastLoginDate'])
                    days_since = (now - last_login).days
                
                inactive_examples.append({
                    'user_id': user['Id'],
                    'name': user.get('Name', 'Unknown'),
                    'profile': user.get('Profile', {}).get('Name', 'Unknown') if user.get('Profile') else 'Unknown',
                    'days_since_login': days_since,
                    'department': user.get('Department', 'Unknown')
                })
            
            findings['user_activity'] = {
                'total_users': len(users),
                'active_30_days': len(active_users),
                'inactive_30_days': len(inactive_users),
                'never_logged_in': len(never_logged),
                'adoption_rate': len(active_users) / len(users) * 100 if users else 0,
                'active_examples': active_examples,
                'inactive_examples': inactive_examples
            }
        
        # 2. Data Entry Patterns
        recent_leads = self._execute_soql("""
            SELECT CreatedBy.Name, CreatedBy.Profile.Name, 
                   COUNT(Id) RecordCount
            FROM Lead
            WHERE CreatedDate >= LAST_N_MONTHS:1
            GROUP BY CreatedBy.Name, CreatedBy.Profile.Name
            ORDER BY COUNT(Id) DESC
            LIMIT 20
        """, "Lead creation by user")
        
        if recent_leads:
            top_creators = []
            for record in recent_leads[:5]:
                top_creators.append({
                    'user': record.get('CreatedBy', {}).get('Name', 'Unknown') if record.get('CreatedBy') else 'Unknown',
                    'profile': record.get('CreatedBy', {}).get('Profile', {}).get('Name', 'Unknown') if record.get('CreatedBy') and record.get('CreatedBy').get('Profile') else 'Unknown',
                    'record_count': record.get('RecordCount', 0)
                })
            
            findings['data_entry_patterns'] = {
                'top_lead_creators': top_creators,
                'unique_creators': len(recent_leads)
            }
        
        return findings
    
    def assess_attribution_campaign(self):
        """Assess attribution and campaign tracking with evidence"""
        logger.info("\n" + "="*60)
        logger.info("ANALYZING ATTRIBUTION & CAMPAIGN TRACKING")
        logger.info("="*60)
        
        findings = {}
        
        # 1. Lead Source Analysis
        leads = self._execute_soql("""
            SELECT Id, Name, Company, LeadSource, ConvertedOpportunityId,
                   utm_source__c, utm_medium__c, utm_campaign__c,
                   IsConverted, CreatedDate
            FROM Lead 
            WHERE CreatedDate >= LAST_N_MONTHS:3
            ORDER BY CreatedDate DESC
            LIMIT 250
        """, "Lead source and UTM tracking")
        
        if leads:
            source_distribution = {}
            utm_filled = []
            no_source = []
            
            for lead in leads:
                source = lead.get('LeadSource', 'Unknown')
                source_distribution[source] = source_distribution.get(source, 0) + 1
                
                # Check UTM tracking (if fields exist)
                has_utm = any([
                    lead.get('utm_source__c'),
                    lead.get('utm_medium__c'),
                    lead.get('utm_campaign__c')
                ])
                
                if has_utm:
                    utm_filled.append(lead)
                if not lead.get('LeadSource') or lead.get('LeadSource') == 'Unknown':
                    no_source.append(lead)
            
            # Get examples with good attribution
            good_attribution_examples = []
            for lead in [l for l in leads if l.get('LeadSource') and l.get('LeadSource') != 'Unknown'][:3]:
                good_attribution_examples.append({
                    'lead_id': lead['Id'],
                    'name': lead.get('Name', 'Unknown'),
                    'company': lead.get('Company', 'Unknown'),
                    'source': lead.get('LeadSource', 'Unknown'),
                    'converted': 'Yes' if lead.get('IsConverted') else 'No'
                })
            
            # Get examples with missing attribution
            missing_attribution_examples = []
            for lead in no_source[:3]:
                missing_attribution_examples.append({
                    'lead_id': lead['Id'],
                    'name': lead.get('Name', 'Unknown'),
                    'company': lead.get('Company', 'Unknown'),
                    'source': 'Missing',
                    'converted': 'Yes' if lead.get('IsConverted') else 'No'
                })
            
            findings['lead_attribution'] = {
                'total_leads': len(leads),
                'source_distribution': source_distribution,
                'leads_with_utm': len(utm_filled),
                'leads_no_source': len(no_source),
                'attribution_rate': (len(leads) - len(no_source)) / len(leads) * 100 if leads else 0,
                'good_examples': good_attribution_examples,
                'missing_examples': missing_attribution_examples
            }
        
        # 2. Campaign Member Analysis
        campaign_members = self._execute_soql("""
            SELECT Id, CampaignId, Campaign.Name, Campaign.Type,
                   LeadId, Lead.Name, ContactId, Contact.Name,
                   Status, HasResponded, FirstRespondedDate,
                   CreatedDate
            FROM CampaignMember
            WHERE CreatedDate >= LAST_N_MONTHS:3
            ORDER BY CreatedDate DESC
            LIMIT 200
        """, "Campaign member tracking")
        
        if campaign_members:
            responded = [cm for cm in campaign_members if cm.get('HasResponded')]
            campaigns_used = {}
            
            for cm in campaign_members:
                campaign_name = cm.get('Campaign', {}).get('Name', 'Unknown') if cm.get('Campaign') else 'Unknown'
                campaigns_used[campaign_name] = campaigns_used.get(campaign_name, 0) + 1
            
            # Get campaign response examples
            response_examples = []
            for cm in responded[:3]:
                response_examples.append({
                    'campaign': cm.get('Campaign', {}).get('Name', 'Unknown') if cm.get('Campaign') else 'Unknown',
                    'member_name': (cm.get('Lead', {}).get('Name') if cm.get('Lead') 
                                   else cm.get('Contact', {}).get('Name', 'Unknown') if cm.get('Contact') 
                                   else 'Unknown'),
                    'status': cm.get('Status', 'Unknown'),
                    'responded_date': cm.get('FirstRespondedDate', 'N/A')
                })
            
            findings['campaign_tracking'] = {
                'total_members': len(campaign_members),
                'responded_count': len(responded),
                'response_rate': len(responded) / len(campaign_members) * 100 if campaign_members else 0,
                'unique_campaigns': len(campaigns_used),
                'response_examples': response_examples
            }
        
        return findings
    
    def assess_data_quality(self):
        """Assess data quality and completeness with evidence"""
        logger.info("\n" + "="*60)
        logger.info("ANALYZING DATA QUALITY & COMPLETENESS")
        logger.info("="*60)
        
        findings = {}
        
        # 1. Account Data Quality
        accounts = self._execute_soql("""
            SELECT Id, Name, Phone, Website, BillingStreet, BillingCity,
                   BillingState, BillingPostalCode, BillingCountry,
                   Industry, Type, NumberOfEmployees, AnnualRevenue,
                   Description, Owner.Name
            FROM Account
            WHERE CreatedDate >= LAST_N_MONTHS:12
            ORDER BY LastModifiedDate DESC
            LIMIT 200
        """, "Account data quality check")
        
        if accounts:
            critical_fields = ['Phone', 'Website', 'Industry', 'Type']
            field_completeness = {}
            incomplete_accounts = []
            
            for field in critical_fields:
                filled = [a for a in accounts if a.get(field)]
                field_completeness[field] = len(filled) / len(accounts) * 100
            
            # Find accounts with missing critical data
            for account in accounts:
                missing_fields = [f for f in critical_fields if not account.get(f)]
                if len(missing_fields) >= 2:  # Missing 2+ critical fields
                    incomplete_accounts.append(account)
            
            # Get examples of complete accounts
            complete_examples = []
            for account in [a for a in accounts if all(a.get(f) for f in critical_fields)][:3]:
                complete_examples.append({
                    'account_id': account['Id'],
                    'name': account.get('Name', 'Unknown'),
                    'industry': account.get('Industry', 'Unknown'),
                    'type': account.get('Type', 'Unknown'),
                    'website': account.get('Website', 'Unknown')
                })
            
            # Get examples of incomplete accounts
            incomplete_examples = []
            for account in incomplete_accounts[:3]:
                missing = [f for f in critical_fields if not account.get(f)]
                incomplete_examples.append({
                    'account_id': account['Id'],
                    'name': account.get('Name', 'Unknown'),
                    'missing_fields': missing,
                    'owner': account.get('Owner', {}).get('Name', 'Unknown')
                })
            
            findings['account_quality'] = {
                'total_accounts': len(accounts),
                'field_completeness': field_completeness,
                'incomplete_count': len(incomplete_accounts),
                'complete_examples': complete_examples,
                'incomplete_examples': incomplete_examples
            }
        
        # 2. Contact Data Quality
        contacts = self._execute_soql("""
            SELECT Id, Name, Email, Phone, Title, Department,
                   AccountId, Account.Name, MailingStreet, MailingCity,
                   HasOptedOutOfEmail, EmailBouncedReason,
                   LastActivityDate, Owner.Name
            FROM Contact
            WHERE CreatedDate >= LAST_N_MONTHS:12
            ORDER BY LastModifiedDate DESC
            LIMIT 200
        """, "Contact data quality check")
        
        if contacts:
            contacts_with_email = [c for c in contacts if c.get('Email')]
            contacts_with_phone = [c for c in contacts if c.get('Phone')]
            bounced_emails = [c for c in contacts if c.get('EmailBouncedReason')]
            opted_out = [c for c in contacts if c.get('HasOptedOutOfEmail')]
            
            # Get examples of good contacts
            good_contact_examples = []
            for contact in [c for c in contacts if c.get('Email') and c.get('Phone') and c.get('Title')][:3]:
                good_contact_examples.append({
                    'contact_id': contact['Id'],
                    'name': contact.get('Name', 'Unknown'),
                    'email': contact.get('Email', 'Unknown'),
                    'title': contact.get('Title', 'Unknown'),
                    'account': contact.get('Account', {}).get('Name', 'Unknown') if contact.get('Account') else 'No Account'
                })
            
            # Get examples of problematic contacts
            problem_contact_examples = []
            for contact in [c for c in contacts if not c.get('Email') or c.get('EmailBouncedReason')][:3]:
                problem_contact_examples.append({
                    'contact_id': contact['Id'],
                    'name': contact.get('Name', 'Unknown'),
                    'issue': 'No Email' if not contact.get('Email') else f"Bounced: {contact.get('EmailBouncedReason', 'Unknown')}",
                    'account': contact.get('Account', {}).get('Name', 'Unknown') if contact.get('Account') else 'No Account'
                })
            
            findings['contact_quality'] = {
                'total_contacts': len(contacts),
                'with_email': len(contacts_with_email),
                'with_phone': len(contacts_with_phone),
                'email_rate': len(contacts_with_email) / len(contacts) * 100 if contacts else 0,
                'bounced_emails': len(bounced_emails),
                'opted_out': len(opted_out),
                'good_examples': good_contact_examples,
                'problem_examples': problem_contact_examples
            }
        
        # 3. Duplicate Detection
        duplicate_accounts = self._execute_soql("""
            SELECT Name, COUNT(Id) DupeCount
            FROM Account
            WHERE CreatedDate >= LAST_N_MONTHS:12
            GROUP BY Name
            HAVING COUNT(Id) > 1
            ORDER BY COUNT(Id) DESC
            LIMIT 10
        """, "Duplicate account detection")
        
        if duplicate_accounts:
            duplicate_examples = []
            for dup in duplicate_accounts[:3]:
                duplicate_examples.append({
                    'account_name': dup.get('Name', 'Unknown'),
                    'duplicate_count': dup.get('DupeCount', 0)
                })
            
            findings['duplicates'] = {
                'duplicate_account_groups': len(duplicate_accounts),
                'examples': duplicate_examples
            }
        
        return findings
    
    def generate_report(self, all_findings):
        """Generate comprehensive report with all evidence"""
        report = {
            'metadata': {
                'assessment_date': datetime.now(timezone.utc).isoformat(),
                'org_alias': self.org_alias,
                'query_summary': {
                    'total_queries': self.query_count,
                    'successful': self.successful_queries,
                    'failed': self.failed_queries
                }
            },
            'findings': all_findings
        }
        
        return report
    
    def run_assessment(self):
        """Run the complete assessment"""
        logger.info("="*60)
        logger.info("STARTING COMPREHENSIVE REVOPS ASSESSMENT")
        logger.info(f"Organization: {self.org_alias}")
        logger.info("="*60)
        
        all_findings = {}
        
        # Run all assessments
        all_findings['gtm_architecture'] = self.assess_gtm_architecture()
        all_findings['automation_patterns'] = self.assess_automation_patterns()
        all_findings['user_behavior'] = self.assess_user_behavior()
        all_findings['attribution_campaign'] = self.assess_attribution_campaign()
        all_findings['data_quality'] = self.assess_data_quality()
        
        # Generate report
        report = self.generate_report(all_findings)
        
        logger.info("\n" + "="*60)
        logger.info("ASSESSMENT COMPLETE")
        logger.info(f"Total Queries Executed: {self.query_count}")
        logger.info(f"Successful Queries: {self.successful_queries}")
        logger.info(f"Failed Queries: {self.failed_queries}")
        logger.info("="*60)
        
        return report

def main():
    """Main execution"""
    org_alias = 'neonone'
    
    auditor = EvidenceBasedRevOpsAuditor(org_alias)
    report = auditor.run_assessment()
    
    # Save report
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'revops_assessment_{org_alias}_{timestamp}.json'
    
    with open(filename, 'w') as f:
        json.dump(report, f, indent=2, default=str)
    
    logger.info(f"\nReport saved to: {filename}")
    
    # Print summary
    print("\n" + "="*60)
    print("ASSESSMENT SUMMARY")
    print("="*60)
    print(json.dumps(report, indent=2, default=str))

if __name__ == "__main__":
    main()
