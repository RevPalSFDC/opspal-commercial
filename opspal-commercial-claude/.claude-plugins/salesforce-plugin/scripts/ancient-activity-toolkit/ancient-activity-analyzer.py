#!/usr/bin/env python3
"""
Instance-Agnostic Ancient Activity Records Analyzer for Salesforce
Version 2.0 - Portable Edition

This tool can be run on ANY Salesforce instance to discover and analyze
hidden, archived, and ancient activity records.

Usage:
    python ancient-activity-analyzer.py [--org ORG_ALIAS] [--years YEARS] [--export-path PATH]

Examples:
    python ancient-activity-analyzer.py --org production
    python ancient-activity-analyzer.py --org sandbox --years 5
    python ancient-activity-analyzer.py --org dev --export-path ./reports/

Requirements:
    - Salesforce CLI (sf) installed and authenticated
    - Python 3.8+
    - Active connection to target Salesforce org
"""

import os
import sys
import json
import subprocess
import argparse
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict, Counter
import csv
from pathlib import Path

# Default Configuration
DEFAULT_CUTOFF_YEARS = 3
DEFAULT_EXPORT_PATH = "./ancient-activity-reports"

class AncientActivityAnalyzer:
    """Instance-agnostic analyzer for discovering ancient activity records"""

    def __init__(self, org_alias: str, cutoff_years: int = DEFAULT_CUTOFF_YEARS, export_path: str = DEFAULT_EXPORT_PATH):
        self.org = org_alias
        self.cutoff_years = cutoff_years
        self.cutoff_date = datetime.now(timezone.utc) - timedelta(days=365 * cutoff_years)
        self.export_path = Path(export_path)
        self.export_path.mkdir(parents=True, exist_ok=True)

        # Results storage
        self.results = {
            "metadata": {
                "org": org_alias,
                "analysis_date": datetime.now(timezone.utc).isoformat(),
                "cutoff_years": cutoff_years,
                "cutoff_date": self.cutoff_date.isoformat()
            },
            "summary": {},
            "details": {},
            "hidden_data": {},
            "email_analysis": {},
            "recommendations": []
        }

    def run_soql(self, query: str, timeout: int = 60) -> List[Dict]:
        """Execute SOQL query with error handling"""
        try:
            result = subprocess.run(
                ["sf", "data", "query", "--query", query, "--target-org", self.org, "--json"],
                capture_output=True,
                text=True,
                timeout=timeout
            )

            if result.returncode == 0:
                data = json.loads(result.stdout)
                return data.get("result", {}).get("records", [])
            else:
                error_msg = json.loads(result.stderr) if result.stderr else {"message": "Unknown error"}
                print(f"  Query error: {error_msg.get('message', 'Unknown error')[:100]}")
                return []

        except subprocess.TimeoutExpired:
            print("  Query timeout - dataset may be too large")
            return []
        except Exception as e:
            print(f"  Error: {str(e)[:100]}")
            return []

    def verify_org_connection(self) -> bool:
        """Verify connection to Salesforce org"""
        print(f"\nVerifying connection to org: {self.org}")

        try:
            result = subprocess.run(
                ["sf", "org", "display", "--target-org", self.org, "--json"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                org_data = json.loads(result.stdout).get("result", {})
                print(f"✓ Connected to: {org_data.get('username', 'Unknown')}")
                print(f"  Instance URL: {org_data.get('instanceUrl', 'Unknown')}")
                print(f"  Org ID: {org_data.get('id', 'Unknown')}")

                self.results["metadata"]["org_details"] = {
                    "username": org_data.get("username"),
                    "instance_url": org_data.get("instanceUrl"),
                    "org_id": org_data.get("id")
                }
                return True
            else:
                print(f"✗ Failed to connect to org: {self.org}")
                return False

        except Exception as e:
            print(f"✗ Connection error: {e}")
            return False

    def run_analysis(self) -> Dict:
        """Run comprehensive analysis of ancient activity records"""

        print("\n" + "="*80)
        print("ANCIENT ACTIVITY RECORDS ANALYSIS")
        print("="*80)
        print(f"Organization: {self.org}")
        print(f"Cutoff Date: {self.cutoff_date.strftime('%Y-%m-%d')} (>{self.cutoff_years} years old)")
        print("="*80)

        # Verify connection first
        if not self.verify_org_connection():
            print("\nERROR: Cannot connect to Salesforce org. Please verify:")
            print(f"  1. You are authenticated: sf org login web --alias {self.org}")
            print(f"  2. The org alias exists: sf org list")
            sys.exit(1)

        # Run analysis modules
        print("\n[1/11] Analyzing standard activity objects...")
        self._analyze_standard_activities()

        print("\n[2/11] Analyzing EmailMessage records...")
        self._analyze_email_messages()

        print("\n[3/11] Checking for archived activities...")
        self._check_archived_activities()

        print("\n[4/11] Checking Recycle Bin...")
        self._check_recycle_bin()

        print("\n[5/11] Analyzing content and attachments...")
        self._analyze_content_documents()

        print("\n[6/11] Checking custom activity objects...")
        self._check_custom_activity_objects()

        print("\n[7/11] Analyzing field history...")
        self._analyze_field_history()

        print("\n[8/11] Checking related object activities...")
        self._check_related_object_activities()

        print("\n[9/11] Analyzing email senders and recipients...")
        self._analyze_email_participants()

        print("\n[10/11] Classifying email subjects...")
        self._classify_email_subjects()

        print("\n[11/11] Generating summary and recommendations...")
        self._generate_summary()

        return self.results

    def _analyze_standard_activities(self):
        """Analyze Task and Event objects"""

        # Tasks analysis
        task_query = f"""
        SELECT COUNT(Id) Total,
               MIN(CreatedDate) OldestCreated,
               MAX(CreatedDate) NewestCreated
        FROM Task
        """

        tasks = self.run_soql(task_query)
        if tasks:
            task_data = tasks[0]

            # Count ancient tasks
            ancient_query = f"""
            SELECT COUNT(Id) AncientCount
            FROM Task
            WHERE CreatedDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
            """

            ancient_tasks = self.run_soql(ancient_query)
            ancient_count = ancient_tasks[0].get("AncientCount", 0) if ancient_tasks else 0

            self.results["details"]["tasks"] = {
                "total": task_data.get("Total", 0),
                "ancient_count": ancient_count,
                "oldest": task_data.get("OldestCreated"),
                "newest": task_data.get("NewestCreated")
            }

            print(f"  Tasks: {task_data.get('Total', 0):,} total, {ancient_count:,} ancient")

        # Events analysis
        event_query = f"""
        SELECT COUNT(Id) Total,
               MIN(CreatedDate) OldestCreated,
               MAX(CreatedDate) NewestCreated
        FROM Event
        """

        events = self.run_soql(event_query)
        if events:
            event_data = events[0]

            # Count ancient events
            ancient_query = f"""
            SELECT COUNT(Id) AncientCount
            FROM Event
            WHERE CreatedDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
            """

            ancient_events = self.run_soql(ancient_query)
            ancient_count = ancient_events[0].get("AncientCount", 0) if ancient_events else 0

            self.results["details"]["events"] = {
                "total": event_data.get("Total", 0),
                "ancient_count": ancient_count,
                "oldest": event_data.get("OldestCreated"),
                "newest": event_data.get("NewestCreated")
            }

            print(f"  Events: {event_data.get('Total', 0):,} total, {ancient_count:,} ancient")

    def _analyze_email_messages(self):
        """Deep analysis of EmailMessage records"""

        # Overall ancient email stats
        email_query = f"""
        SELECT COUNT(Id) Total,
               MIN(MessageDate) OldestDate,
               MAX(MessageDate) NewestDate
        FROM EmailMessage
        WHERE MessageDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
        """

        emails = self.run_soql(email_query)
        if emails:
            email_data = emails[0]
            self.results["details"]["email_messages"] = {
                "ancient_total": email_data.get("Total", 0),
                "oldest": email_data.get("OldestDate"),
                "newest_ancient": email_data.get("NewestDate")
            }

            print(f"  Ancient Emails: {email_data.get('Total', 0):,}")

            # Get yearly distribution
            yearly_query = f"""
            SELECT CALENDAR_YEAR(MessageDate) Year,
                   COUNT(Id) Total
            FROM EmailMessage
            WHERE MessageDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
            GROUP BY CALENDAR_YEAR(MessageDate)
            ORDER BY CALENDAR_YEAR(MessageDate)
            LIMIT 20
            """

            yearly = self.run_soql(yearly_query)
            if yearly:
                self.results["details"]["email_yearly"] = {
                    str(y.get("Year")): y.get("Total", 0) for y in yearly if y.get("Year")
                }

    def _check_archived_activities(self):
        """Check for archived activities using IsArchived flag"""

        # Check archived tasks
        archived_task_query = """
        SELECT COUNT(Id) ArchivedCount
        FROM Task
        WHERE IsArchived = true
        """

        archived_tasks = self.run_soql(archived_task_query)
        if archived_tasks:
            count = archived_tasks[0].get("ArchivedCount", 0)
            self.results["details"]["archived_tasks"] = count
            print(f"  Archived Tasks: {count:,}")

        # Check archived events
        archived_event_query = """
        SELECT COUNT(Id) ArchivedCount
        FROM Event
        WHERE IsArchived = true
        """

        archived_events = self.run_soql(archived_event_query)
        if archived_events:
            count = archived_events[0].get("ArchivedCount", 0)
            self.results["details"]["archived_events"] = count
            print(f"  Archived Events: {count:,}")

    def _check_recycle_bin(self):
        """Check Recycle Bin for deleted activities"""

        recycle_bin_data = {}

        # Try to check deleted records (requires proper permissions)
        objects = ["Task", "Event", "EmailMessage"]

        for obj in objects:
            query = f"""
            SELECT COUNT(Id) DeletedCount
            FROM {obj}
            WHERE IsDeleted = true
            ALL ROWS
            """

            result = self.run_soql(query)
            if result and result[0].get("DeletedCount") is not None:
                count = result[0].get("DeletedCount", 0)
                recycle_bin_data[obj.lower()] = count
                print(f"  Deleted {obj}: {count:,}")

        if recycle_bin_data:
            self.results["hidden_data"]["recycle_bin"] = recycle_bin_data

    def _analyze_content_documents(self):
        """Analyze ContentDocument and attachments"""

        content_query = f"""
        SELECT COUNT(Id) Total,
               MIN(CreatedDate) Oldest
        FROM ContentDocument
        WHERE CreatedDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
        """

        content = self.run_soql(content_query)
        if content and content[0].get("Total"):
            self.results["details"]["content_documents"] = {
                "ancient_total": content[0].get("Total", 0),
                "oldest": content[0].get("Oldest")
            }
            print(f"  Ancient ContentDocuments: {content[0].get('Total', 0):,}")

        # Check for old Attachments
        attachment_query = f"""
        SELECT COUNT(Id) Total,
               MIN(CreatedDate) Oldest
        FROM Attachment
        WHERE CreatedDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
        """

        attachments = self.run_soql(attachment_query)
        if attachments and attachments[0].get("Total"):
            self.results["details"]["attachments"] = {
                "ancient_total": attachments[0].get("Total", 0),
                "oldest": attachments[0].get("Oldest")
            }
            print(f"  Ancient Attachments: {attachments[0].get('Total', 0):,}")

    def _check_custom_activity_objects(self):
        """Discover and check custom objects that might store activity data"""

        # Get custom objects with activity-related names
        custom_obj_query = """
        SELECT QualifiedApiName, Label
        FROM EntityDefinition
        WHERE QualifiedApiName LIKE '%__c'
        AND (QualifiedApiName LIKE '%Activity%'
             OR QualifiedApiName LIKE '%Call%'
             OR QualifiedApiName LIKE '%Email%'
             OR QualifiedApiName LIKE '%Meeting%'
             OR QualifiedApiName LIKE '%Task%'
             OR QualifiedApiName LIKE '%Event%'
             OR QualifiedApiName LIKE '%Log%'
             OR QualifiedApiName LIKE '%History%')
        LIMIT 50
        """

        custom_objects = self.run_soql(custom_obj_query)
        custom_activity_data = []

        for obj in custom_objects:
            obj_name = obj.get("QualifiedApiName")
            obj_label = obj.get("Label")

            # Check for ancient records
            count_query = f"""
            SELECT COUNT(Id) Total
            FROM {obj_name}
            WHERE CreatedDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
            LIMIT 1
            """

            result = self.run_soql(count_query, timeout=10)
            if result and result[0].get("Total"):
                count = result[0].get("Total", 0)
                if count > 0:
                    custom_activity_data.append({
                        "object": obj_name,
                        "label": obj_label,
                        "ancient_count": count
                    })
                    print(f"  {obj_label}: {count:,} ancient records")

        if custom_activity_data:
            self.results["hidden_data"]["custom_activity_objects"] = custom_activity_data

    def _analyze_field_history(self):
        """Check field history tracking for activity-related changes"""

        history_objects = ["AccountHistory", "ContactHistory", "OpportunityHistory", "LeadHistory"]
        field_history_data = {}

        for hist_obj in history_objects:
            query = f"""
            SELECT COUNT(Id) Total
            FROM {hist_obj}
            WHERE CreatedDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
            LIMIT 1
            """

            result = self.run_soql(query)
            if result and result[0].get("Total"):
                count = result[0].get("Total", 0)
                if count > 0:
                    field_history_data[hist_obj] = count
                    print(f"  {hist_obj}: {count:,} ancient records")

        if field_history_data:
            self.results["hidden_data"]["field_history"] = field_history_data

    def _check_related_object_activities(self):
        """Check for activities through related objects"""

        # Check Accounts with old LastActivityDate
        account_query = f"""
        SELECT COUNT(Id) Total
        FROM Account
        WHERE LastActivityDate < {self.cutoff_date.strftime('%Y-%m-%d')}
        AND LastActivityDate != null
        """

        accounts = self.run_soql(account_query)
        if accounts:
            count = accounts[0].get("Total", 0)
            if count > 0:
                self.results["hidden_data"]["accounts_with_old_activity"] = count
                print(f"  Accounts with ancient LastActivityDate: {count:,}")

        # Check Contacts with old LastActivityDate
        contact_query = f"""
        SELECT COUNT(Id) Total
        FROM Contact
        WHERE LastActivityDate < {self.cutoff_date.strftime('%Y-%m-%d')}
        AND LastActivityDate != null
        """

        contacts = self.run_soql(contact_query)
        if contacts:
            count = contacts[0].get("Total", 0)
            if count > 0:
                self.results["hidden_data"]["contacts_with_old_activity"] = count
                print(f"  Contacts with ancient LastActivityDate: {count:,}")

        # Check old Cases
        case_query = f"""
        SELECT COUNT(Id) Total
        FROM Case
        WHERE CreatedDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
        """

        cases = self.run_soql(case_query)
        if cases:
            count = cases[0].get("Total", 0)
            if count > 0:
                self.results["hidden_data"]["old_cases"] = count
                print(f"  Cases older than {self.cutoff_years} years: {count:,}")

    def _analyze_email_participants(self):
        """Analyze who sent and received ancient emails"""

        # Sample ancient emails for analysis
        sample_query = f"""
        SELECT FromAddress, ToAddress, Subject, MessageDate
        FROM EmailMessage
        WHERE MessageDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
        ORDER BY MessageDate DESC
        LIMIT 100
        """

        samples = self.run_soql(sample_query)

        if samples:
            # Analyze domains
            from_domains = Counter()
            to_domains = Counter()
            subject_patterns = Counter()

            for email in samples:
                # From domains
                from_addr = email.get("FromAddress", "")
                if "@" in from_addr:
                    domain = from_addr.lower().split("@")[1]
                    from_domains[domain] += 1

                # To domains
                to_addr = email.get("ToAddress", "")
                if "@" in to_addr:
                    for addr in to_addr.split(";"):
                        if "@" in addr:
                            domain = addr.strip().lower().split("@")[1]
                            to_domains[domain] += 1

                # Subject patterns
                subject = email.get("Subject", "").lower()
                if "lead" in subject:
                    subject_patterns["lead_management"] += 1
                elif "contract" in subject or "renewal" in subject:
                    subject_patterns["contract_renewal"] += 1
                elif "support" in subject or "case" in subject:
                    subject_patterns["support"] += 1
                elif "invoice" in subject or "payment" in subject:
                    subject_patterns["billing"] += 1
                elif "meeting" in subject or "call" in subject:
                    subject_patterns["scheduling"] += 1

            self.results["email_analysis"]["top_from_domains"] = dict(from_domains.most_common(10))
            self.results["email_analysis"]["top_to_domains"] = dict(to_domains.most_common(10))
            self.results["email_analysis"]["subject_patterns"] = dict(subject_patterns)

            # Store sample emails
            self.results["email_analysis"]["samples"] = samples[:10]

    def _classify_email_subjects(self):
        """Classify email subjects into business categories"""

        # Get subject counts
        subject_query = f"""
        SELECT Subject, COUNT(Id) Count
        FROM EmailMessage
        WHERE MessageDate < {self.cutoff_date.strftime('%Y-%m-%dT%H:%M:%SZ')}
        AND Subject != null
        GROUP BY Subject
        ORDER BY COUNT(Id) DESC
        LIMIT 100
        """

        subjects = self.run_soql(subject_query)

        if subjects:
            categories = defaultdict(int)

            for subj in subjects:
                subject_text = subj.get("Subject", "").lower()
                count = subj.get("Count", 0)

                # Categorize
                if "lead" in subject_text or "inquiry" in subject_text:
                    categories["Lead Management"] += count
                elif "contract" in subject_text or "renewal" in subject_text:
                    categories["Contracts/Renewals"] += count
                elif "invoice" in subject_text or "payment" in subject_text:
                    categories["Billing/Finance"] += count
                elif "support" in subject_text or "ticket" in subject_text:
                    categories["Customer Support"] += count
                elif "meeting" in subject_text or "call" in subject_text:
                    categories["Scheduling"] += count
                elif "automatic" in subject_text or "auto" in subject_text:
                    categories["Automated/System"] += count
                else:
                    categories["Other"] += count

            self.results["email_analysis"]["subject_categories"] = dict(categories)

            # Calculate percentages
            total = sum(categories.values())
            if total > 0:
                self.results["email_analysis"]["category_percentages"] = {
                    k: round((v/total) * 100, 1) for k, v in categories.items()
                }

    def _generate_summary(self):
        """Generate summary and recommendations"""

        # Calculate totals
        total_ancient = 0

        # Sum up all ancient records
        if "email_messages" in self.results["details"]:
            total_ancient += self.results["details"]["email_messages"].get("ancient_total", 0)

        if "tasks" in self.results["details"]:
            total_ancient += self.results["details"]["tasks"].get("ancient_count", 0)

        if "events" in self.results["details"]:
            total_ancient += self.results["details"]["events"].get("ancient_count", 0)

        if "content_documents" in self.results["details"]:
            total_ancient += self.results["details"]["content_documents"].get("ancient_total", 0)

        # Add hidden data
        for key, value in self.results.get("hidden_data", {}).items():
            if isinstance(value, dict):
                total_ancient += sum(v for v in value.values() if isinstance(v, int))
            elif isinstance(value, int):
                total_ancient += value

        # Find oldest record
        oldest_date = None
        for detail in self.results["details"].values():
            if isinstance(detail, dict) and "oldest" in detail:
                try:
                    date_str = detail["oldest"]
                    if date_str:
                        date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                        if oldest_date is None or date < oldest_date:
                            oldest_date = date
                except:
                    pass

        self.results["summary"] = {
            "total_ancient_records": total_ancient,
            "oldest_record_date": oldest_date.isoformat() if oldest_date else None,
            "primary_sources": self._identify_primary_sources(),
            "data_retention_assessment": self._assess_retention_policy()
        }

        # Generate recommendations
        self._generate_recommendations()

    def _identify_primary_sources(self) -> List[str]:
        """Identify primary sources of ancient data"""
        sources = []

        if self.results["details"].get("email_messages", {}).get("ancient_total", 0) > 0:
            sources.append("EmailMessage")

        if self.results.get("hidden_data", {}).get("accounts_with_old_activity", 0) > 0:
            sources.append("Account.LastActivityDate")

        if self.results.get("hidden_data", {}).get("contacts_with_old_activity", 0) > 0:
            sources.append("Contact.LastActivityDate")

        return sources

    def _assess_retention_policy(self) -> str:
        """Assess data retention policy based on findings"""

        has_old_tasks = self.results["details"].get("tasks", {}).get("ancient_count", 0) > 0
        has_old_emails = self.results["details"].get("email_messages", {}).get("ancient_total", 0) > 0
        has_archived = self.results["details"].get("archived_tasks", 0) > 0

        if not has_old_tasks and has_old_emails:
            return "Tasks/Events auto-deleted, Emails retained indefinitely"
        elif has_old_tasks and has_old_emails:
            return "Mixed retention - some objects retain history"
        elif has_archived:
            return "Archival enabled but may not be complete"
        else:
            return "Unclear retention policy - further investigation needed"

    def _generate_recommendations(self):
        """Generate actionable recommendations"""

        recommendations = []

        # Check for high volume of ancient records
        total = self.results["summary"]["total_ancient_records"]
        if total > 10000:
            recommendations.append({
                "priority": "HIGH",
                "category": "Data Management",
                "issue": f"Found {total:,} ancient records consuming storage",
                "action": "Implement data archival strategy",
                "estimated_impact": "Save ~$100/month in storage costs"
            })

        # Check for missing archival
        if self.results["details"].get("archived_tasks", 0) == 0:
            recommendations.append({
                "priority": "MEDIUM",
                "category": "Archival",
                "issue": "No archived activities found",
                "action": "Enable activity archival",
                "estimated_impact": "Preserve historical data for compliance"
            })

        # Check for ghost activities
        ghost_accounts = self.results.get("hidden_data", {}).get("accounts_with_old_activity", 0)
        ghost_contacts = self.results.get("hidden_data", {}).get("contacts_with_old_activity", 0)

        if ghost_accounts + ghost_contacts > 1000:
            recommendations.append({
                "priority": "HIGH",
                "category": "Data Integrity",
                "issue": f"{ghost_accounts + ghost_contacts:,} records show ghost activities",
                "action": "Investigate missing activity records",
                "estimated_impact": "Restore historical reporting accuracy"
            })

        # Check email patterns
        if self.results.get("email_analysis", {}).get("category_percentages", {}).get("Automated/System", 0) > 40:
            recommendations.append({
                "priority": "MEDIUM",
                "category": "Integration",
                "issue": "High percentage of automated emails",
                "action": "Review and clean up system integrations",
                "estimated_impact": "Reduce noise and improve data quality"
            })

        self.results["recommendations"] = recommendations

    def export_results(self):
        """Export analysis results to multiple formats"""

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_filename = f"ancient_activity_analysis_{self.org}_{timestamp}"

        # Export JSON report
        json_path = self.export_path / f"{base_filename}.json"
        with open(json_path, "w") as f:
            json.dump(self.results, f, indent=2, default=str)
        print(f"\n📄 JSON report saved to: {json_path}")

        # Export executive summary
        summary_path = self.export_path / f"{base_filename}_summary.md"
        self._export_executive_summary(summary_path)
        print(f"📊 Executive summary saved to: {summary_path}")

        # Export email samples to CSV if available
        if self.results.get("email_analysis", {}).get("samples"):
            csv_path = self.export_path / f"{base_filename}_email_samples.csv"
            self._export_email_samples_csv(csv_path)
            print(f"📧 Email samples saved to: {csv_path}")

        return json_path, summary_path

    def _export_executive_summary(self, path: Path):
        """Generate and export executive summary in Markdown"""

        with open(path, "w") as f:
            f.write(f"# Ancient Activity Records Analysis\n")
            f.write(f"## Organization: {self.org}\n")
            f.write(f"**Analysis Date**: {datetime.now().strftime('%Y-%m-%d')}\n")
            f.write(f"**Cutoff**: Records older than {self.cutoff_years} years\n\n")

            f.write("---\n\n")

            # Summary
            summary = self.results["summary"]
            f.write(f"## 🎯 Key Finding\n")
            f.write(f"**{summary['total_ancient_records']:,} ancient records discovered**\n\n")

            if summary.get("oldest_record_date"):
                oldest = datetime.fromisoformat(summary["oldest_record_date"])
                years_old = (datetime.now(timezone.utc) - oldest).days / 365.25
                f.write(f"**Oldest Record**: {oldest.strftime('%Y-%m-%d')} ({years_old:.1f} years old)\n\n")

            # Details
            f.write("## 📊 Breakdown by Object\n\n")

            details = self.results["details"]
            if details.get("email_messages"):
                f.write(f"- **EmailMessages**: {details['email_messages']['ancient_total']:,} ancient records\n")
            if details.get("tasks"):
                f.write(f"- **Tasks**: {details['tasks']['ancient_count']:,} ancient records\n")
            if details.get("events"):
                f.write(f"- **Events**: {details['events']['ancient_count']:,} ancient records\n")

            # Hidden data
            if self.results.get("hidden_data"):
                f.write("\n## 🔍 Hidden/Ghost Activities\n\n")
                hidden = self.results["hidden_data"]

                if hidden.get("accounts_with_old_activity"):
                    f.write(f"- **Accounts**: {hidden['accounts_with_old_activity']:,} with ancient LastActivityDate\n")
                if hidden.get("contacts_with_old_activity"):
                    f.write(f"- **Contacts**: {hidden['contacts_with_old_activity']:,} with ancient LastActivityDate\n")

            # Email analysis
            if self.results.get("email_analysis", {}).get("category_percentages"):
                f.write("\n## 📧 Email Classification\n\n")
                for category, percentage in self.results["email_analysis"]["category_percentages"].items():
                    f.write(f"- {category}: {percentage}%\n")

            # Recommendations
            if self.results.get("recommendations"):
                f.write("\n## 💡 Recommendations\n\n")
                for idx, rec in enumerate(self.results["recommendations"], 1):
                    f.write(f"### {idx}. [{rec['priority']}] {rec['category']}\n")
                    f.write(f"**Issue**: {rec['issue']}\n")
                    f.write(f"**Action**: {rec['action']}\n")
                    f.write(f"**Impact**: {rec['estimated_impact']}\n\n")

    def _export_email_samples_csv(self, path: Path):
        """Export email samples to CSV"""

        samples = self.results.get("email_analysis", {}).get("samples", [])
        if not samples:
            return

        with open(path, "w", newline="") as f:
            fieldnames = ["FromAddress", "ToAddress", "Subject", "MessageDate"]
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(samples)

def print_summary(results: Dict):
    """Print analysis summary to console"""

    print("\n" + "="*80)
    print("ANALYSIS COMPLETE")
    print("="*80)

    summary = results["summary"]
    print(f"\n📊 Total Ancient Records: {summary['total_ancient_records']:,}")

    if summary.get("oldest_record_date"):
        oldest = datetime.fromisoformat(summary["oldest_record_date"])
        print(f"📅 Oldest Record: {oldest.strftime('%Y-%m-%d')}")

    print(f"📁 Primary Sources: {', '.join(summary.get('primary_sources', []))}")
    print(f"📋 Assessment: {summary.get('data_retention_assessment')}")

    if results.get("recommendations"):
        print(f"\n💡 Top Recommendations:")
        for rec in results["recommendations"][:3]:
            print(f"  [{rec['priority']}] {rec['action']}")

def main():
    """Main entry point"""

    parser = argparse.ArgumentParser(
        description="Ancient Activity Records Analyzer for Salesforce",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --org production
  %(prog)s --org sandbox --years 5
  %(prog)s --org dev --export-path ./reports/
        """
    )

    parser.add_argument(
        "--org",
        default=os.getenv("SF_TARGET_ORG", "production"),
        help="Salesforce org alias (default: $SF_TARGET_ORG or 'production')"
    )

    parser.add_argument(
        "--years",
        type=int,
        default=DEFAULT_CUTOFF_YEARS,
        help=f"Number of years to consider as 'ancient' (default: {DEFAULT_CUTOFF_YEARS})"
    )

    parser.add_argument(
        "--export-path",
        default=DEFAULT_EXPORT_PATH,
        help=f"Path to export results (default: {DEFAULT_EXPORT_PATH})"
    )

    parser.add_argument(
        "--quick",
        action="store_true",
        help="Run quick analysis (skip some detailed checks)"
    )

    args = parser.parse_args()

    print(f"\n🔍 Ancient Activity Records Analyzer v2.0")
    print(f"Organization: {args.org}")
    print(f"Cutoff: >{args.years} years old")
    print(f"Export Path: {args.export_path}")

    # Create analyzer
    analyzer = AncientActivityAnalyzer(
        org_alias=args.org,
        cutoff_years=args.years,
        export_path=args.export_path
    )

    # Run analysis
    try:
        results = analyzer.run_analysis()

        # Export results
        json_path, summary_path = analyzer.export_results()

        # Print summary
        print_summary(results)

        print(f"\n✅ Analysis complete! Results exported to:")
        print(f"  {args.export_path}/")

    except KeyboardInterrupt:
        print("\n\n⚠️  Analysis interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()