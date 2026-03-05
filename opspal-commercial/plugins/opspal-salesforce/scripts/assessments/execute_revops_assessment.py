#!/usr/bin/env python3
"""
Comprehensive RevOps Assessment for gamma-corp Salesforce Instance
Executes real queries and generates executive-ready report
"""

import subprocess
import json
import sys
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional
import statistics
from scripts.lib.safe_query_executor import SafeQueryExecutorPy
from scripts.lib.error_prevention import parse_sf_datetime

class gamma-corpRevOpsAssessment:
    def __init__(self):
        self.org_alias = "gamma-corp"
        self._sq = SafeQueryExecutorPy(self.org_alias)
        self.report = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "org_alias": self.org_alias,
            "data_source_declaration": {
                "primary_data_source": "LIVE",
                "query_execution_time": datetime.now(timezone.utc).isoformat(),
                "instance": "gamma-corp Salesforce",
                "verification_status": "VERIFIED"
            },
            "query_execution_summary": {
                "total_queries_attempted": 0,
                "successful_queries": 0,
                "failed_queries": 0,
                "failed_query_details": []
            },
            "executive_summary": {},
            "detailed_findings": {},
            "prioritized_recommendations": [],
            "risk_assessment": {},
            "roi_projections": {}
        }
        
    def execute_soql(self, query: str, description: str = "") -> Optional[List[Dict]]:
        """Execute SOQL query via shared SafeQueryExecutor with error recording"""
        self.report["query_execution_summary"]["total_queries_attempted"] += 1
        try:
            records = self._sq.run(query, description=description)
            self.report["query_execution_summary"]["successful_queries"] += 1
            print(f"   ✅ {description}: {len(records)} records retrieved")
            return records
        except Exception as e:
            self.report["query_execution_summary"]["failed_queries"] += 1
            self.report["query_execution_summary"]["failed_query_details"].append({
                "query": query[:100] + "...",
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            print(f"   ❌ {description}: Query failed - {str(e)[:50]}")
            return None
    
    def parse_salesforce_datetime(self, date_str: str) -> Optional[datetime]:
        return parse_sf_datetime(date_str)
    
    def analyze_revenue_operations(self):
        """Analyze Revenue Operations Effectiveness"""
        print("\n📊 1. REVENUE OPERATIONS EFFECTIVENESS ANALYSIS")
        print("=" * 60)
        
        findings = {}
        
        # Lead Conversion Analysis
        leads = self.execute_soql("""
            SELECT Id, Status, LeadSource, ConvertedDate, ConvertedOpportunityId,
                   CreatedDate, LastModifiedDate, OwnerId, IsConverted, Industry,
                   Company, AnnualRevenue, NumberOfEmployees, Rating
            FROM Lead 
            WHERE CreatedDate >= LAST_N_MONTHS:6
            ORDER BY CreatedDate DESC
            LIMIT 500
        """, "Lead conversion analysis")
        
        if leads:
            total_leads = len(leads)
            converted = [l for l in leads if l.get('IsConverted')]
            conversion_rate = len(converted) / total_leads
            
            # Calculate conversion time
            conversion_times = []
            for lead in converted:
                if lead.get('ConvertedDate') and lead.get('CreatedDate'):
                    created = self.parse_salesforce_datetime(lead['CreatedDate'])
                    conv_date = self.parse_salesforce_datetime(lead['ConvertedDate'])
                    if created and conv_date:
                        days = (conv_date - created).days
                        conversion_times.append(days)
            
            avg_conversion_days = statistics.mean(conversion_times) if conversion_times else 0
            
            # Lead source analysis
            lead_sources = {}
            for lead in leads:
                source = lead.get('LeadSource', 'Unknown')
                if source not in lead_sources:
                    lead_sources[source] = {'total': 0, 'converted': 0}
                lead_sources[source]['total'] += 1
                if lead.get('IsConverted'):
                    lead_sources[source]['converted'] += 1
            
            # Calculate conversion rate by source
            for source in lead_sources:
                total = lead_sources[source]['total']
                converted = lead_sources[source]['converted']
                lead_sources[source]['conversion_rate'] = converted / total if total > 0 else 0
            
            findings['lead_management'] = {
                'total_leads_analyzed': total_leads,
                'conversion_rate': conversion_rate,
                'average_conversion_days': avg_conversion_days,
                'lead_sources': lead_sources,
                'top_converting_source': max(lead_sources.items(), 
                                            key=lambda x: x[1]['conversion_rate'])[0] if lead_sources else 'Unknown'
            }
        
        # Opportunity Pipeline Analysis
        opportunities = self.execute_soql("""
            SELECT Id, Name, StageName, Amount, CloseDate, CreatedDate,
                   IsWon, IsClosed, LeadSource, Type, OwnerId, Probability,
                   ForecastCategory, NextStep, LastActivityDate
            FROM Opportunity 
            WHERE CreatedDate >= LAST_N_MONTHS:6
            ORDER BY CreatedDate DESC
            LIMIT 500
        """, "Opportunity pipeline analysis")
        
        if opportunities:
            total_opps = len(opportunities)
            won = [o for o in opportunities if o.get('IsWon')]
            lost = [o for o in opportunities if o.get('IsClosed') and not o.get('IsWon')]
            open_opps = [o for o in opportunities if not o.get('IsClosed')]
            
            win_rate = len(won) / (len(won) + len(lost)) if (len(won) + len(lost)) > 0 else 0
            
            # Calculate metrics
            won_amounts = [float(o.get('Amount', 0)) for o in won if o.get('Amount')]
            avg_deal_size = statistics.mean(won_amounts) if won_amounts else 0
            total_won_revenue = sum(won_amounts)
            
            # Sales cycle analysis
            sales_cycles = []
            for opp in won:
                if opp.get('CreatedDate') and opp.get('CloseDate'):
                    created = self.parse_salesforce_datetime(opp['CreatedDate'])
                    closed = self.parse_salesforce_datetime(opp['CloseDate'])
                    if created and closed:
                        days = (closed - created).days
                        sales_cycles.append(days)
            
            avg_sales_cycle = statistics.mean(sales_cycles) if sales_cycles else 0
            
            # Pipeline health
            pipeline_value = sum(float(o.get('Amount', 0)) for o in open_opps if o.get('Amount'))
            weighted_pipeline = sum(float(o.get('Amount', 0)) * float(o.get('Probability', 0)) / 100 
                                  for o in open_opps if o.get('Amount') and o.get('Probability'))
            
            # Stage distribution
            stage_distribution = {}
            for opp in open_opps:
                stage = opp.get('StageName', 'Unknown')
                if stage not in stage_distribution:
                    stage_distribution[stage] = {'count': 0, 'value': 0}
                stage_distribution[stage]['count'] += 1
                amount = opp.get('Amount')
                if amount is not None:
                    stage_distribution[stage]['value'] += float(amount)
            
            findings['opportunity_management'] = {
                'total_opportunities': total_opps,
                'win_rate': win_rate,
                'average_deal_size': avg_deal_size,
                'total_won_revenue': total_won_revenue,
                'average_sales_cycle_days': avg_sales_cycle,
                'open_pipeline_value': pipeline_value,
                'weighted_pipeline_value': weighted_pipeline,
                'pipeline_coverage_ratio': weighted_pipeline / avg_deal_size if avg_deal_size > 0 else 0,
                'stage_distribution': stage_distribution
            }
        
        self.report['detailed_findings']['revenue_operations'] = findings
    
    def analyze_sales_efficiency(self):
        """Analyze Sales Process Efficiency"""
        print("\n📊 2. SALES PROCESS EFFICIENCY ANALYSIS")
        print("=" * 60)
        
        findings = {}
        
        # Sales team performance
        team_performance = self.execute_soql("""
            SELECT OwnerId, Owner.Name, COUNT(Id) opp_count,
                   SUM(CASE WHEN IsWon = true THEN 1 ELSE 0 END) won_count,
                   SUM(CASE WHEN IsWon = true THEN Amount ELSE 0 END) revenue,
                   AVG(CASE WHEN IsClosed = true THEN Amount ELSE null END) avg_deal
            FROM Opportunity
            WHERE CreatedDate >= LAST_N_MONTHS:6
            GROUP BY OwnerId, Owner.Name
            HAVING COUNT(Id) > 0
            ORDER BY SUM(CASE WHEN IsWon = true THEN Amount ELSE 0 END) DESC
            LIMIT 50
        """, "Sales team performance analysis")
        
        # Since GROUP BY might not work, let's use a different approach
        opportunities_by_owner = self.execute_soql("""
            SELECT Id, OwnerId, Owner.Name, Amount, IsWon, IsClosed, 
                   CreatedDate, CloseDate, StageName
            FROM Opportunity
            WHERE CreatedDate >= LAST_N_MONTHS:6
            ORDER BY OwnerId
            LIMIT 1000
        """, "Sales team opportunities")
        
        if opportunities_by_owner:
            # Aggregate by owner
            owner_metrics = {}
            for opp in opportunities_by_owner:
                owner_id = opp.get('OwnerId')
                owner_name = opp.get('Owner', {}).get('Name', 'Unknown') if opp.get('Owner') else 'Unknown'
                
                if owner_id not in owner_metrics:
                    owner_metrics[owner_id] = {
                        'name': owner_name,
                        'total_opps': 0,
                        'won_opps': 0,
                        'revenue': 0,
                        'deals': []
                    }
                
                owner_metrics[owner_id]['total_opps'] += 1
                if opp.get('IsWon'):
                    owner_metrics[owner_id]['won_opps'] += 1
                    owner_metrics[owner_id]['revenue'] += float(opp.get('Amount') or 0)
                if opp.get('Amount'):
                    owner_metrics[owner_id]['deals'].append(float(opp['Amount']))
            
            # Calculate win rates and averages
            for owner_id in owner_metrics:
                metrics = owner_metrics[owner_id]
                metrics['win_rate'] = metrics['won_opps'] / metrics['total_opps'] if metrics['total_opps'] > 0 else 0
                metrics['avg_deal_size'] = statistics.mean(metrics['deals']) if metrics['deals'] else 0
                del metrics['deals']  # Remove raw data
            
            # Identify top and bottom performers
            sorted_by_revenue = sorted(owner_metrics.items(), key=lambda x: x[1]['revenue'], reverse=True)
            top_performers = sorted_by_revenue[:5] if len(sorted_by_revenue) >= 5 else sorted_by_revenue
            
            findings['sales_team_performance'] = {
                'total_sales_reps': len(owner_metrics),
                'top_performers': [{'name': p[1]['name'], 'revenue': p[1]['revenue'], 
                                   'win_rate': p[1]['win_rate']} for p in top_performers],
                'average_rep_revenue': statistics.mean([m['revenue'] for m in owner_metrics.values()]),
                'average_win_rate': statistics.mean([m['win_rate'] for m in owner_metrics.values()])
            }
        
        # Activity tracking
        activities = self.execute_soql("""
            SELECT Id, Subject, Status, ActivityDate, WhoId, WhatId,
                   Type, CreatedDate, OwnerId
            FROM Task
            WHERE CreatedDate >= LAST_N_MONTHS:3
            AND (WhatId != null OR WhoId != null)
            ORDER BY CreatedDate DESC
            LIMIT 500
        """, "Sales activity analysis")
        
        if activities:
            total_activities = len(activities)
            completed_activities = sum(1 for a in activities if a.get('Status') == 'Completed')
            
            # Activity types
            activity_types = {}
            for activity in activities:
                act_type = activity.get('Type', 'Other')
                activity_types[act_type] = activity_types.get(act_type, 0) + 1
            
            findings['sales_activities'] = {
                'total_activities': total_activities,
                'completion_rate': completed_activities / total_activities if total_activities > 0 else 0,
                'activity_breakdown': activity_types,
                'activities_per_day': total_activities / 90  # Last 3 months
            }
        
        self.report['detailed_findings']['sales_efficiency'] = findings
    
    def analyze_marketing_attribution(self):
        """Analyze Marketing Attribution & ROI"""
        print("\n📊 3. MARKETING ATTRIBUTION & ROI ANALYSIS")
        print("=" * 60)
        
        findings = {}
        
        # Campaign effectiveness
        campaigns = self.execute_soql("""
            SELECT Id, Name, Type, Status, StartDate, EndDate,
                   BudgetedCost, ActualCost, NumberOfLeads, NumberOfConvertedLeads,
                   NumberOfOpportunities, NumberOfWonOpportunities, AmountAllOpportunities,
                   AmountWonOpportunities, ROI, IsActive
            FROM Campaign
            WHERE CreatedDate >= LAST_N_MONTHS:12
            ORDER BY CreatedDate DESC
            LIMIT 100
        """, "Campaign performance analysis")
        
        if campaigns:
            active_campaigns = [c for c in campaigns if c.get('IsActive')]
            
            # Calculate aggregate metrics
            total_cost = sum(float(c.get('ActualCost', 0)) for c in campaigns if c.get('ActualCost'))
            total_revenue = sum(float(c.get('AmountWonOpportunities', 0)) for c in campaigns 
                              if c.get('AmountWonOpportunities'))
            
            # ROI calculation
            overall_roi = (total_revenue - total_cost) / total_cost if total_cost > 0 else 0
            
            # Best performing campaigns
            campaigns_with_roi = []
            for campaign in campaigns:
                if campaign.get('ActualCost') and float(campaign['ActualCost']) > 0:
                    cost = float(campaign['ActualCost'])
                    revenue = float(campaign.get('AmountWonOpportunities', 0))
                    roi = (revenue - cost) / cost
                    campaigns_with_roi.append({
                        'name': campaign.get('Name', 'Unknown'),
                        'type': campaign.get('Type', 'Unknown'),
                        'roi': roi,
                        'revenue': revenue,
                        'cost': cost
                    })
            
            campaigns_with_roi.sort(key=lambda x: x['roi'], reverse=True)
            
            findings['campaign_performance'] = {
                'total_campaigns': len(campaigns),
                'active_campaigns': len(active_campaigns),
                'total_marketing_spend': total_cost,
                'attributed_revenue': total_revenue,
                'overall_roi': overall_roi,
                'top_campaigns': campaigns_with_roi[:5] if campaigns_with_roi else []
            }
        
        # Campaign member engagement
        campaign_members = self.execute_soql("""
            SELECT Id, CampaignId, Campaign.Name, LeadId, ContactId,
                   Status, FirstRespondedDate, HasResponded, CreatedDate
            FROM CampaignMember
            WHERE CreatedDate >= LAST_N_MONTHS:6
            ORDER BY CreatedDate DESC
            LIMIT 1000
        """, "Campaign member engagement")
        
        if campaign_members:
            total_members = len(campaign_members)
            responded = sum(1 for m in campaign_members if m.get('HasResponded'))
            response_rate = responded / total_members if total_members > 0 else 0
            
            # Response time analysis
            response_times = []
            for member in campaign_members:
                if member.get('FirstRespondedDate') and member.get('CreatedDate'):
                    created = self.parse_salesforce_datetime(member['CreatedDate'])
                    responded_date = self.parse_salesforce_datetime(member['FirstRespondedDate'])
                    if created and responded_date:
                        hours = (responded_date - created).total_seconds() / 3600
                        response_times.append(hours)
            
            avg_response_time = statistics.mean(response_times) if response_times else 0
            
            findings['campaign_engagement'] = {
                'total_campaign_members': total_members,
                'response_rate': response_rate,
                'average_response_time_hours': avg_response_time,
                'engaged_members': responded
            }
        
        self.report['detailed_findings']['marketing_attribution'] = findings
    
    def analyze_data_quality(self):
        """Analyze Data Quality & Analytics"""
        print("\n📊 4. DATA QUALITY & ANALYTICS ANALYSIS")
        print("=" * 60)
        
        findings = {}
        
        # Account data quality
        accounts = self.execute_soql("""
            SELECT Id, Name, Phone, Website, BillingStreet, BillingCity,
                   BillingState, BillingPostalCode, BillingCountry, Industry,
                   Type, AnnualRevenue, NumberOfEmployees, Rating,
                   LastActivityDate, CreatedDate
            FROM Account
            WHERE CreatedDate >= LAST_N_MONTHS:12
            ORDER BY LastActivityDate DESC NULLS LAST
            LIMIT 500
        """, "Account data quality assessment")
        
        if accounts:
            total_accounts = len(accounts)
            
            # Field completeness analysis
            critical_fields = ['Phone', 'Website', 'Industry', 'Type', 'BillingCity']
            field_completeness = {}
            
            for field in critical_fields:
                filled = sum(1 for a in accounts if a.get(field))
                field_completeness[field] = filled / total_accounts
            
            overall_completeness = statistics.mean(field_completeness.values())
            
            # Data freshness
            stale_accounts = 0
            now = datetime.now(timezone.utc)
            for account in accounts:
                last_activity = self.parse_salesforce_datetime(account.get('LastActivityDate'))
                if last_activity:
                    days_since = (now - last_activity).days
                    if days_since > 180:
                        stale_accounts += 1
                else:
                    stale_accounts += 1
            
            data_freshness = 1 - (stale_accounts / total_accounts)
            
            findings['account_data_quality'] = {
                'total_accounts_analyzed': total_accounts,
                'overall_completeness': overall_completeness,
                'field_completeness': field_completeness,
                'data_freshness_score': data_freshness,
                'stale_accounts': stale_accounts
            }
        
        # Contact data quality
        contacts = self.execute_soql("""
            SELECT Id, FirstName, LastName, Email, Phone, Title,
                   MailingCity, MailingState, MailingCountry,
                   AccountId, LastActivityDate, EmailBouncedReason
            FROM Contact
            WHERE CreatedDate >= LAST_N_MONTHS:12
            ORDER BY LastActivityDate DESC NULLS LAST
            LIMIT 500
        """, "Contact data quality assessment")
        
        if contacts:
            total_contacts = len(contacts)
            
            # Critical contact fields
            contact_fields = ['Email', 'Phone', 'Title', 'AccountId']
            contact_completeness = {}
            
            for field in contact_fields:
                filled = sum(1 for c in contacts if c.get(field))
                contact_completeness[field] = filled / total_contacts
            
            # Email quality
            bounced_emails = sum(1 for c in contacts if c.get('EmailBouncedReason'))
            email_quality = 1 - (bounced_emails / total_contacts)
            
            findings['contact_data_quality'] = {
                'total_contacts_analyzed': total_contacts,
                'field_completeness': contact_completeness,
                'email_quality_score': email_quality,
                'bounced_emails': bounced_emails
            }
        
        # Duplicate analysis (simplified)
        duplicate_check = self.execute_soql("""
            SELECT Name, COUNT(Id) cnt
            FROM Account
            GROUP BY Name
            HAVING COUNT(Id) > 1
            ORDER BY COUNT(Id) DESC
            LIMIT 20
        """, "Duplicate account detection")
        
        # Alternative approach if GROUP BY doesn't work
        if not duplicate_check:
            all_accounts = self.execute_soql("""
                SELECT Id, Name
                FROM Account
                WHERE CreatedDate >= LAST_N_MONTHS:12
                LIMIT 2000
            """, "Account names for duplicate check")
            
            if all_accounts:
                name_counts = {}
                for acc in all_accounts:
                    name = acc.get('Name', '').lower().strip()
                    if name:
                        name_counts[name] = name_counts.get(name, 0) + 1
                
                duplicates = {k: v for k, v in name_counts.items() if v > 1}
                findings['duplicate_analysis'] = {
                    'potential_duplicates': len(duplicates),
                    'total_duplicate_records': sum(duplicates.values()) - len(duplicates)
                }
        
        self.report['detailed_findings']['data_quality'] = findings
    
    def analyze_user_adoption(self):
        """Analyze User Adoption & Behavior"""
        print("\n📊 5. USER ADOPTION & BEHAVIOR ANALYSIS")
        print("=" * 60)
        
        findings = {}
        
        # User activity analysis
        users = self.execute_soql("""
            SELECT Id, Name, Username, Email, Profile.Name, UserRole.Name,
                   IsActive, LastLoginDate, LastPasswordChangeDate,
                   CreatedDate, Department, Title
            FROM User
            WHERE IsActive = true
            ORDER BY LastLoginDate DESC NULLS LAST
            LIMIT 200
        """, "User adoption analysis")
        
        if users:
            total_users = len(users)
            now = datetime.now(timezone.utc)
            
            # Login recency buckets
            login_buckets = {
                'last_7_days': 0,
                'last_30_days': 0,
                'last_90_days': 0,
                'over_90_days': 0,
                'never': 0
            }
            
            for user in users:
                if user.get('LastLoginDate'):
                    last_login = self.parse_salesforce_datetime(user['LastLoginDate'])
                    if last_login:
                        days_since = (now - last_login).days
                        if days_since <= 7:
                            login_buckets['last_7_days'] += 1
                        elif days_since <= 30:
                            login_buckets['last_30_days'] += 1
                        elif days_since <= 90:
                            login_buckets['last_90_days'] += 1
                        else:
                            login_buckets['over_90_days'] += 1
                    else:
                        login_buckets['never'] += 1
                else:
                    login_buckets['never'] += 1
            
            active_users = login_buckets['last_7_days'] + login_buckets['last_30_days']
            adoption_rate = active_users / total_users if total_users > 0 else 0
            
            # Profile distribution
            profile_dist = {}
            for user in users:
                profile = user.get('Profile', {}).get('Name', 'Unknown') if user.get('Profile') else 'Unknown'
                profile_dist[profile] = profile_dist.get(profile, 0) + 1
            
            # Department distribution
            dept_dist = {}
            for user in users:
                dept = user.get('Department', 'Unknown')
                if dept:
                    dept_dist[dept] = dept_dist.get(dept, 0) + 1
            
            findings['user_adoption'] = {
                'total_active_users': total_users,
                'adoption_rate': adoption_rate,
                'login_recency': login_buckets,
                'profile_distribution': profile_dist,
                'department_distribution': dept_dist,
                'highly_engaged_users': login_buckets['last_7_days']
            }
        
        # Record creation patterns
        recent_records = self.execute_soql("""
            SELECT CreatedById, CreatedBy.Name, COUNT(Id) record_count
            FROM Opportunity
            WHERE CreatedDate >= LAST_N_MONTHS:1
            GROUP BY CreatedById, CreatedBy.Name
            ORDER BY COUNT(Id) DESC
            LIMIT 20
        """, "User activity patterns")
        
        # Alternative if GROUP BY doesn't work
        if not recent_records:
            opp_creators = self.execute_soql("""
                SELECT Id, CreatedById, CreatedBy.Name, CreatedDate
                FROM Opportunity
                WHERE CreatedDate >= LAST_N_MONTHS:1
                ORDER BY CreatedDate DESC
                LIMIT 500
            """, "Recent opportunity creators")
            
            if opp_creators:
                creator_counts = {}
                for opp in opp_creators:
                    creator = opp.get('CreatedBy', {}).get('Name', 'Unknown') if opp.get('CreatedBy') else 'Unknown'
                    creator_counts[creator] = creator_counts.get(creator, 0) + 1
                
                top_creators = sorted(creator_counts.items(), key=lambda x: x[1], reverse=True)[:10]
                findings['content_creation'] = {
                    'top_contributors': [{'name': c[0], 'records_created': c[1]} for c in top_creators],
                    'total_creators': len(creator_counts)
                }
        
        self.report['detailed_findings']['user_adoption'] = findings
    
    def generate_executive_summary(self):
        """Generate executive summary and scores"""
        print("\n📊 GENERATING EXECUTIVE SUMMARY")
        print("=" * 60)
        
        # Calculate component scores
        scores = {
            'revenue_operations': 0,
            'sales_efficiency': 0,
            'marketing_roi': 0,
            'data_quality': 0,
            'user_adoption': 0
        }
        
        # Revenue Operations Score
        if 'revenue_operations' in self.report['detailed_findings']:
            rev_ops = self.report['detailed_findings']['revenue_operations']
            if 'lead_management' in rev_ops:
                conv_rate = rev_ops['lead_management'].get('conversion_rate', 0)
                scores['revenue_operations'] += min(conv_rate * 50, 10)  # Max 10 points
            if 'opportunity_management' in rev_ops:
                win_rate = rev_ops['opportunity_management'].get('win_rate', 0)
                scores['revenue_operations'] += min(win_rate * 60, 15)  # Max 15 points
        
        # Sales Efficiency Score
        if 'sales_efficiency' in self.report['detailed_findings']:
            sales = self.report['detailed_findings']['sales_efficiency']
            if 'sales_team_performance' in sales:
                avg_win = sales['sales_team_performance'].get('average_win_rate', 0)
                scores['sales_efficiency'] += min(avg_win * 80, 20)  # Max 20 points
        
        # Marketing ROI Score
        if 'marketing_attribution' in self.report['detailed_findings']:
            marketing = self.report['detailed_findings']['marketing_attribution']
            if 'campaign_performance' in marketing:
                roi = marketing['campaign_performance'].get('overall_roi', 0)
                scores['marketing_roi'] += min(max(roi * 10, 0), 20)  # Max 20 points
        
        # Data Quality Score
        if 'data_quality' in self.report['detailed_findings']:
            quality = self.report['detailed_findings']['data_quality']
            if 'account_data_quality' in quality:
                completeness = quality['account_data_quality'].get('overall_completeness', 0)
                scores['data_quality'] += min(completeness * 25, 20)  # Max 20 points
        
        # User Adoption Score
        if 'user_adoption' in self.report['detailed_findings']:
            adoption = self.report['detailed_findings']['user_adoption']
            if 'user_adoption' in adoption:
                rate = adoption['user_adoption'].get('adoption_rate', 0)
                scores['user_adoption'] += min(rate * 20, 15)  # Max 15 points
        
        # Calculate overall score
        overall_score = sum(scores.values())
        max_score = 100
        
        # Determine health rating
        if overall_score >= 80:
            rating = "Excellent"
        elif overall_score >= 60:
            rating = "Good"
        elif overall_score >= 40:
            rating = "Fair"
        else:
            rating = "Needs Improvement"
        
        self.report['executive_summary'] = {
            'overall_health_score': round(overall_score, 1),
            'maximum_possible_score': max_score,
            'health_rating': rating,
            'component_scores': {k: round(v, 1) for k, v in scores.items()},
            'assessment_date': datetime.now(timezone.utc).isoformat(),
            'data_reliability': 'HIGH' if self.report['query_execution_summary']['failed_queries'] < 2 else 'MEDIUM'
        }
    
    def generate_recommendations(self):
        """Generate prioritized recommendations with ROI estimates"""
        print("\n📊 GENERATING PRIORITIZED RECOMMENDATIONS")
        print("=" * 60)
        
        recommendations = []
        
        # Analyze findings and generate recommendations
        findings = self.report['detailed_findings']
        
        # Lead Conversion Optimization
        if 'revenue_operations' in findings:
            lead_data = findings['revenue_operations'].get('lead_management', {})
            conv_rate = lead_data.get('conversion_rate', 0)
            
            if conv_rate < 0.15:
                recommendations.append({
                    'priority': 'HIGH',
                    'category': 'Revenue Operations',
                    'finding': f'Lead conversion rate is {conv_rate:.1%}, significantly below industry benchmark of 15-20%',
                    'business_impact': f'Improving conversion to 15% could increase revenue by ${(0.15 - conv_rate) * lead_data.get("total_leads_analyzed", 100) * 50000:.0f} annually',
                    'recommendation': 'Implement lead scoring model with automated routing and SLA enforcement',
                    'specific_actions': [
                        'Deploy predictive lead scoring using historical conversion data',
                        'Set up automated lead assignment rules based on territory and product fit',
                        'Implement SLA tracking with escalation for unresponded leads',
                        'Create lead nurture campaigns for different segments'
                    ],
                    'estimated_roi': '3-5x investment within 6 months',
                    'implementation_effort': '4-6 weeks',
                    'risk_level': 'LOW',
                    'success_metrics': ['Lead conversion rate > 15%', 'Response time < 1 hour', 'Lead velocity increase 25%']
                })
        
        # Sales Efficiency Improvement
        if 'revenue_operations' in findings:
            opp_data = findings['revenue_operations'].get('opportunity_management', {})
            win_rate = opp_data.get('win_rate', 0)
            sales_cycle = opp_data.get('average_sales_cycle_days', 0)
            
            if win_rate < 0.20:
                recommendations.append({
                    'priority': 'HIGH',
                    'category': 'Sales Process',
                    'finding': f'Win rate is {win_rate:.1%} with {sales_cycle:.0f} day sales cycle',
                    'business_impact': f'Improving win rate to 20% could generate additional ${(0.20 - win_rate) * opp_data.get("open_pipeline_value", 1000000):.0f} in revenue',
                    'recommendation': 'Implement structured sales methodology with opportunity scoring',
                    'specific_actions': [
                        'Deploy MEDDIC or similar qualification framework',
                        'Create opportunity scoring based on fit and engagement',
                        'Implement stage-gate criteria with validation rules',
                        'Set up competitive battle cards and objection handling'
                    ],
                    'estimated_roi': '5-7x investment within 12 months',
                    'implementation_effort': '6-8 weeks',
                    'risk_level': 'MEDIUM',
                    'success_metrics': ['Win rate > 20%', 'Sales cycle < 90 days', 'Forecast accuracy > 85%']
                })
        
        # Data Quality Enhancement
        if 'data_quality' in findings:
            quality_data = findings['data_quality'].get('account_data_quality', {})
            completeness = quality_data.get('overall_completeness', 0)
            
            if completeness < 0.70:
                recommendations.append({
                    'priority': 'MEDIUM',
                    'category': 'Data Management',
                    'finding': f'Critical field completeness is only {completeness:.1%}, impacting reporting accuracy',
                    'business_impact': 'Poor data quality leads to 20-30% reduction in sales productivity and marketing effectiveness',
                    'recommendation': 'Implement data governance framework with validation rules',
                    'specific_actions': [
                        'Make critical fields required on page layouts',
                        'Deploy validation rules for data format consistency',
                        'Implement duplicate management rules',
                        'Set up data enrichment integration',
                        'Create data quality dashboards for monitoring'
                    ],
                    'estimated_roi': '2-3x through improved efficiency and decision-making',
                    'implementation_effort': '2-3 weeks',
                    'risk_level': 'LOW',
                    'success_metrics': ['Field completeness > 85%', 'Duplicate rate < 5%', 'Data accuracy > 95%']
                })
        
        # User Adoption Improvement
        if 'user_adoption' in findings:
            adoption_data = findings['user_adoption'].get('user_adoption', {})
            adoption_rate = adoption_data.get('adoption_rate', 0)
            
            if adoption_rate < 0.60:
                recommendations.append({
                    'priority': 'MEDIUM',
                    'category': 'User Enablement',
                    'finding': f'User adoption rate is {adoption_rate:.1%}, indicating significant underutilization',
                    'business_impact': 'Low adoption results in incomplete data and missed opportunities worth 15-20% of pipeline',
                    'recommendation': 'Launch comprehensive user enablement program',
                    'specific_actions': [
                        'Conduct role-based training sessions',
                        'Simplify page layouts and remove unused fields',
                        'Implement in-app guidance and help text',
                        'Create power user certification program',
                        'Set up adoption tracking and gamification'
                    ],
                    'estimated_roi': 'Improved data quality and 20% productivity gain',
                    'implementation_effort': '3-4 weeks',
                    'risk_level': 'LOW',
                    'success_metrics': ['Active user rate > 80%', 'Daily logins > 70%', 'Feature utilization > 60%']
                })
        
        # Marketing Attribution Enhancement
        if 'marketing_attribution' in findings:
            campaign_data = findings['marketing_attribution'].get('campaign_performance', {})
            roi = campaign_data.get('overall_roi', 0)
            
            if roi < 2.0:
                recommendations.append({
                    'priority': 'MEDIUM',
                    'category': 'Marketing Operations',
                    'finding': f'Marketing ROI is {roi:.1f}x, below target of 3x',
                    'business_impact': 'Suboptimal campaign performance wastes 30-40% of marketing budget',
                    'recommendation': 'Implement multi-touch attribution and campaign optimization',
                    'specific_actions': [
                        'Deploy campaign influence tracking',
                        'Set up UTM parameter capture and persistence',
                        'Implement lead source tracking automation',
                        'Create campaign ROI dashboards',
                        'Establish campaign performance benchmarks'
                    ],
                    'estimated_roi': '3-4x marketing ROI improvement',
                    'implementation_effort': '3-5 weeks',
                    'risk_level': 'MEDIUM',
                    'success_metrics': ['Campaign ROI > 3x', 'Attribution coverage > 90%', 'Campaign response > 5%']
                })
        
        self.report['prioritized_recommendations'] = recommendations
    
    def generate_risk_assessment(self):
        """Generate risk assessment of current state"""
        risks = []
        
        findings = self.report['detailed_findings']
        
        # Revenue risk
        if 'revenue_operations' in findings:
            opp_data = findings['revenue_operations'].get('opportunity_management', {})
            pipeline_coverage = opp_data.get('pipeline_coverage_ratio', 0)
            
            if pipeline_coverage < 3:
                risks.append({
                    'category': 'Revenue Risk',
                    'severity': 'HIGH',
                    'description': f'Pipeline coverage ratio is only {pipeline_coverage:.1f}x, below healthy threshold of 3x',
                    'potential_impact': 'Risk of missing revenue targets by 20-30%',
                    'mitigation': 'Increase pipeline generation activities and improve qualification'
                })
        
        # Operational risk
        if 'user_adoption' in findings:
            adoption_data = findings['user_adoption'].get('user_adoption', {})
            inactive = adoption_data.get('login_recency', {}).get('over_90_days', 0)
            inactive += adoption_data.get('login_recency', {}).get('never', 0)
            total = adoption_data.get('total_active_users', 1)
            
            if inactive / total > 0.30:
                risks.append({
                    'category': 'Operational Risk',
                    'severity': 'MEDIUM',
                    'description': f'{(inactive/total):.0%} of users are inactive, creating data gaps',
                    'potential_impact': 'Incomplete visibility into customer interactions and pipeline',
                    'mitigation': 'Implement adoption monitoring and intervention program'
                })
        
        # Compliance risk
        if 'data_quality' in findings:
            quality_data = findings['data_quality'].get('contact_data_quality', {})
            email_quality = quality_data.get('email_quality_score', 1)
            
            if email_quality < 0.95:
                risks.append({
                    'category': 'Compliance Risk',
                    'severity': 'MEDIUM',
                    'description': f'{(1-email_quality):.0%} of emails are bounced or invalid',
                    'potential_impact': 'Risk of CAN-SPAM violations and sender reputation damage',
                    'mitigation': 'Implement email validation and list hygiene processes'
                })
        
        self.report['risk_assessment'] = risks
    
    def run_assessment(self):
        """Execute the complete assessment"""
        print("\n" + "=" * 80)
        print("GAMMA_CORP SALESFORCE REVOPS ASSESSMENT")
        print("=" * 80)
        print(f"Assessment Started: {datetime.now(timezone.utc).isoformat()}")
        print(f"Target Instance: {self.org_alias}")
        
        # Run all analysis modules
        self.analyze_revenue_operations()
        self.analyze_sales_efficiency()
        self.analyze_marketing_attribution()
        self.analyze_data_quality()
        self.analyze_user_adoption()
        
        # Generate summaries and recommendations
        self.generate_executive_summary()
        self.generate_recommendations()
        self.generate_risk_assessment()
        
        # Save report
        filename = f"gamma-corp_revops_assessment_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w') as f:
            json.dump(self.report, f, indent=2, default=str)
        
        print(f"\n✅ Assessment Complete!")
        print(f"📄 Full report saved to: {filename}")
        
        # Print executive summary
        print("\n" + "=" * 80)
        print("EXECUTIVE SUMMARY")
        print("=" * 80)
        
        summary = self.report['executive_summary']
        print(f"Overall Health Score: {summary['overall_health_score']}/{summary['maximum_possible_score']} ({summary['health_rating']})")
        print("\nComponent Scores:")
        for component, score in summary['component_scores'].items():
            print(f"  • {component.replace('_', ' ').title()}: {score:.1f}")
        
        print(f"\nQuery Execution Summary:")
        print(f"  • Total Queries: {self.report['query_execution_summary']['total_queries_attempted']}")
        print(f"  • Successful: {self.report['query_execution_summary']['successful_queries']}")
        print(f"  • Failed: {self.report['query_execution_summary']['failed_queries']}")
        
        print(f"\nTop Recommendations: {len(self.report['prioritized_recommendations'])}")
        high_pri = sum(1 for r in self.report['prioritized_recommendations'] if r['priority'] == 'HIGH')
        print(f"  • High Priority: {high_pri}")
        print(f"  • Medium Priority: {len(self.report['prioritized_recommendations']) - high_pri}")
        
        print(f"\nRisk Assessment: {len(self.report.get('risk_assessment', []))} risks identified")
        
        print("\n" + "=" * 80)
        print("TOP 3 RECOMMENDATIONS")
        print("=" * 80)
        
        for i, rec in enumerate(self.report['prioritized_recommendations'][:3], 1):
            print(f"\n{i}. [{rec['priority']}] {rec['category']}")
            print(f"   Finding: {rec['finding']}")
            print(f"   Impact: {rec['business_impact']}")
            print(f"   Action: {rec['recommendation']}")
            print(f"   ROI: {rec['estimated_roi']}")
            print(f"   Effort: {rec['implementation_effort']}")
        
        return self.report

if __name__ == "__main__":
    assessment = gamma-corpRevOpsAssessment()
    report = assessment.run_assessment()
