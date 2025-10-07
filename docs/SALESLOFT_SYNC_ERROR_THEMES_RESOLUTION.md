# Salesloft Sync Error Themes & Resolution Guide

## Executive Summary

This guide addresses **5 critical sync error themes** identified in the Salesloft-Salesforce integration, providing detailed resolution steps and integration setting modifications for each.

**Current State Analysis (September 2025)**:
- 🔴 **CRITICAL**: Complete CRM disconnection affecting 100% of activities
- 🔴 **URGENT**: Wrong Salesforce instance connection (na34 vs na14)
- 🟡 **HIGH**: Missing user CRM mappings for all users
- 🟡 **MEDIUM**: Field mapping mismatches causing validation errors
- 🟡 **MEDIUM**: Performance issues and rate limiting

---

## Theme 1: Complete CRM Disconnection

### Error Pattern
- **Message**: "Not connected to your CRM"
- **Frequency**: 100% of sync attempts since Sept 11, 2025
- **Impact**: All activities (emails, calls, meetings) fail to sync

### Root Causes
1. OAuth token expiration or revocation
2. Salesforce Connected App deactivation
3. Permission changes in Salesforce
4. Integration user deactivation
5. Security policy changes blocking access

### Resolution Steps

#### Immediate Actions (15 minutes)

1. **Re-establish Connection**
   ```
   Salesloft Admin Panel:
   Settings → Integrations → Salesforce → Disconnect → Reconnect

   CRITICAL: Use production URL: https://rentable.my.salesforce.com
   NOT: https://login.salesforce.com (may redirect incorrectly)
   ```

2. **Verify OAuth Settings**
   ```
   Salesforce Setup:
   Apps → Connected Apps → Salesloft

   Required Settings:
   ☑ Enable OAuth Settings
   ☑ Selected OAuth Scopes:
     - Full access (full)
     - Manage user data via APIs (api)
     - Perform requests at any time (refresh_token, offline_access)
   ☑ Require Secret for Web Server Flow: Disabled
   ☑ Require Secret for Refresh Token Flow: Disabled
   ```

3. **Integration User Permissions**
   ```sql
   -- Check integration user status
   SELECT Id, Name, IsActive, Profile.Name, LastLoginDate
   FROM User
   WHERE Username LIKE '%salesloft%' OR Name LIKE '%Integration%'

   Required Permissions:
   ☑ API Enabled
   ☑ View All Data
   ☑ Modify All Data
   ☑ Author Apex (if using custom sync)
   ```

#### Integration Settings Modifications

```javascript
// Salesloft Integration Configuration
{
  "salesforce": {
    "instance_url": "https://rentable.my.salesforce.com",
    "api_version": "62.0",
    "oauth": {
      "client_id": "YOUR_CLIENT_ID",
      "client_secret": "YOUR_CLIENT_SECRET",
      "refresh_token": "STORE_SECURELY",
      "scope": "full refresh_token offline_access"
    },
    "connection": {
      "timeout": 30000,
      "retry_attempts": 3,
      "retry_delay": 2000
    },
    "sync": {
      "batch_size": 200,
      "parallel_requests": 5,
      "sync_interval": 300 // 5 minutes
    }
  }
}
```

#### Validation Checklist
- [ ] Connection shows "Connected" in Salesloft
- [ ] Test activity syncs successfully
- [ ] All users show CRM connection status
- [ ] No OAuth errors in logs
- [ ] API calls succeed without 401/403 errors

---

## Theme 2: Wrong Salesforce Instance Connection

### Error Pattern
- **Message**: "Unable to find record" or "ENTITY_IS_DELETED"
- **Current**: Connected to na34.salesforce.com
- **Correct**: Should be rentable.my.salesforce.com (na14)
- **Impact**: 100% record lookup failures

### Root Causes
1. OAuth redirect to wrong instance
2. Using generic login.salesforce.com URL
3. Token refresh against wrong instance
4. Multiple Salesforce orgs confusion

### Resolution Steps

#### Critical Fix (10 minutes)

1. **Disconnect Wrong Instance**
   ```
   Salesloft Settings → CRM → Salesforce
   Current: https://na34.salesforce.com ❌
   Action: Click "Disconnect"
   ```

2. **Connect to Correct Instance**
   ```
   MANDATORY: Use MyDomain URL
   Correct: https://rentable.my.salesforce.com ✅

   DO NOT USE:
   ❌ https://login.salesforce.com
   ❌ https://test.salesforce.com
   ❌ https://na34.salesforce.com
   ❌ Any sandbox URLs
   ```

3. **Verify Instance Post-Connection**
   ```python
   # Verification script
   import requests
   import os

   headers = {
       "Authorization": f"Bearer {os.getenv('SALESLOFT_TOKEN')}",
       "Accept": "application/json"
   }

   response = requests.get(
       "https://api.salesloft.com/v2/team",
       headers=headers
   )

   if response.status_code == 200:
       data = response.json()["data"]
       print(f"Connected to: {data.get('crm_url')}")
       # Should show: https://rentable.my.salesforce.com
   ```

#### Integration Settings Modifications

```yaml
# config/salesloft_integration.yml
salesforce:
  # CRITICAL: Lock to specific instance
  instance_url: "https://rentable.my.salesforce.com"
  pod: "na14"
  my_domain: "rentable"

  # Prevent instance switching
  instance_validation:
    enabled: true
    allowed_instances:
      - "rentable.my.salesforce.com"
    blocked_instances:
      - "na34.salesforce.com"
      - "login.salesforce.com"
      - "test.salesforce.com"

  # Instance verification on each sync
  pre_sync_checks:
    verify_instance: true
    verify_my_domain: true
    abort_on_mismatch: true
```

---

## Theme 3: Missing User CRM Mappings

### Error Pattern
- **Issue**: Users have no CRM ID assigned
- **Impact**: Activities can't be attributed to Salesforce users
- **Affected Users**: All (Caroline Everett, Joe Fugate, Christian Lillegard, Chris Acevedo, etc.)

### Resolution Steps

#### User Mapping Process (20 minutes)

1. **Get Salesforce User IDs**
   ```sql
   -- Export Salesforce users
   SELECT Id, Name, Email, IsActive
   FROM User
   WHERE IsActive = true
   ORDER BY Name
   ```

2. **Map in Salesloft**
   ```
   For each user:
   Settings → Users → [User Name] → Edit

   Set:
   - CRM User: [Select matching Salesforce user]
   - CRM User ID: [Auto-populated from selection]
   - Default Record Owner: [If different from user]
   ```

3. **Bulk Mapping via API**
   ```python
   import requests
   import csv

   # Read mapping file
   with open('user_mappings.csv', 'r') as f:
       reader = csv.DictReader(f)
       for row in reader:
           # Update user CRM mapping
           response = requests.patch(
               f"https://api.salesloft.com/v2/users/{row['salesloft_id']}",
               json={
                   "crm_user_id": row['salesforce_id'],
                   "crm_user_email": row['email']
               },
               headers=headers
           )
   ```

#### Integration Settings Modifications

```javascript
// User sync configuration
{
  "user_sync": {
    "enabled": true,
    "auto_map_by_email": true,
    "create_missing_users": false,
    "sync_interval": 3600, // hourly
    "mapping_rules": {
      "match_by": ["email", "name"],
      "fallback_owner": "005xx000001hQQQ", // Default owner ID
      "unmapped_behavior": "use_integration_user"
    },
    "validation": {
      "require_crm_id": true,
      "verify_user_active": true,
      "check_permissions": true
    }
  }
}
```

---

## Theme 4: Field Mapping Mismatches

### Error Pattern
- **Messages**: "Required field missing", "Invalid field value", "Field not accessible"
- **Types**: Validation errors, data type mismatches, permission issues
- **Impact**: Partial sync failures, data loss

### Common Field Mapping Issues

| Salesloft Field | Salesforce Field | Common Issue | Fix |
|----------------|------------------|--------------|-----|
| email_address | Email | Case sensitivity | Lowercase before sync |
| phone | Phone | Format mismatch | Standardize format |
| company_name | Account.Name | Lookup vs text | Use Account ID |
| owner | OwnerId | User mapping | Verify CRM user ID |
| created_at | CreatedDate | Timezone | Convert to UTC |
| tags | Custom_Tags__c | Multi-select | Semicolon-delimited |

### Resolution Steps

#### Field Mapping Configuration

1. **Review Current Mappings**
   ```
   Salesloft: Settings → CRM → Field Configuration

   For each object (Person, Account, Opportunity):
   - Review field mappings
   - Check data types match
   - Verify required fields mapped
   ```

2. **Configure Standard Mappings**
   ```javascript
   // Standard field mappings
   {
     "person_to_contact": {
       "salesloft_field": "salesforce_field",
       "email_address": "Email",
       "first_name": "FirstName",
       "last_name": "LastName",
       "phone": "Phone",
       "mobile_phone": "MobilePhone",
       "title": "Title",
       "company_name": "Account.Name",
       "owner_crm_id": "OwnerId",
       "do_not_contact": "HasOptedOutOfEmail"
     },
     "person_to_lead": {
       "email_address": "Email",
       "first_name": "FirstName",
       "last_name": "LastName",
       "company": "Company",
       "phone": "Phone",
       "title": "Title",
       "lead_source": "LeadSource",
       "status": "Status"
     }
   }
   ```

3. **Custom Field Mappings**
   ```javascript
   // Custom field configuration
   {
     "custom_fields": {
       "person": [
         {
           "salesloft_field": "tags",
           "salesforce_field": "Tags__c",
           "type": "multiselect",
           "delimiter": ";",
           "max_length": 255
         },
         {
           "salesloft_field": "cadence_name",
           "salesforce_field": "SalesLoft1__Most_Recent_Cadence_Name__c",
           "type": "text",
           "max_length": 100
         },
         {
           "salesloft_field": "last_completed_step",
           "salesforce_field": "SalesLoft1__Most_Recent_Last_Completed_Step__c",
           "type": "number"
         }
       ]
     }
   }
   ```

#### Data Type Transformations

```javascript
// Field transformation rules
{
  "transformations": {
    "phone": {
      "type": "phone",
      "input_format": "various",
      "output_format": "E.164",
      "validation": "regex:^\\+?[1-9]\\d{1,14}$"
    },
    "email": {
      "type": "email",
      "lowercase": true,
      "trim": true,
      "validation": "regex:^[\\w.-]+@[\\w.-]+\\.\\w+$"
    },
    "date": {
      "type": "datetime",
      "input_timezone": "user_timezone",
      "output_timezone": "UTC",
      "format": "ISO8601"
    },
    "picklist": {
      "type": "picklist",
      "case_sensitive": false,
      "allow_inactive": false,
      "default_value": "Other"
    }
  }
}
```

---

## Theme 5: Rate Limiting & Performance Issues

### Error Pattern
- **Messages**: "Rate limit exceeded", "Timeout", "Too many requests"
- **Symptoms**: Sync delays >24 hours, incomplete syncs, failed bulk operations
- **Impact**: Data freshness issues, missed SLAs

### Resolution Steps

#### Performance Optimization

1. **Adjust Batch Sizes**
   ```javascript
   // Optimized sync configuration
   {
     "sync_performance": {
       "batch_sizes": {
         "create": 100,    // Reduced from 200
         "update": 150,    // Reduced from 200
         "delete": 50      // Smaller for safety
       },
       "rate_limits": {
         "requests_per_second": 10,
         "concurrent_requests": 3,
         "burst_limit": 50
       },
       "retry_policy": {
         "max_retries": 3,
         "initial_delay": 1000,
         "max_delay": 30000,
         "exponential_backoff": true
       }
     }
   }
   ```

2. **Implement Sync Scheduling**
   ```javascript
   // Time-based sync optimization
   {
     "sync_schedule": {
       "real_time": {
         "enabled": true,
         "objects": ["Task", "Event"],
         "delay": 0
       },
       "near_real_time": {
         "enabled": true,
         "objects": ["Contact", "Lead"],
         "interval": 300  // 5 minutes
       },
       "batch": {
         "enabled": true,
         "objects": ["Account", "Opportunity"],
         "interval": 1800,  // 30 minutes
         "preferred_time": "02:00",  // 2 AM
         "time_zone": "America/New_York"
       }
     }
   }
   ```

3. **API Limit Management**
   ```python
   # Monitor API usage
   import requests
   from datetime import datetime, timedelta

   def check_api_limits():
       # Salesforce API limits
       sf_response = requests.get(
           f"{instance_url}/services/data/v62.0/limits",
           headers={"Authorization": f"Bearer {sf_token}"}
       )

       limits = sf_response.json()
       daily_api = limits.get("DailyApiRequests", {})

       usage_percent = (daily_api.get("Remaining", 0) /
                       daily_api.get("Max", 1)) * 100

       if usage_percent < 20:
           # Throttle sync operations
           return "throttle"
       elif usage_percent < 50:
           # Reduce batch sizes
           return "reduce"
       else:
           # Normal operation
           return "normal"
   ```

---

## Integration Settings Master Configuration

### Complete Integration Configuration Template

```yaml
# /config/salesloft_salesforce_integration.yml
integration:
  name: "Salesloft-Salesforce Sync"
  version: "2.0"
  environment: "production"

connection:
  salesforce:
    instance_url: "https://rentable.my.salesforce.com"
    api_version: "62.0"
    my_domain: "rentable"
    pod: "na14"

  salesloft:
    api_url: "https://api.salesloft.com/v2"
    webhook_url: "https://your-webhook-endpoint.com/salesloft"

authentication:
  oauth:
    client_id: "${SALESFORCE_CLIENT_ID}"
    client_secret: "${SALESFORCE_CLIENT_SECRET}"
    refresh_token: "${SALESFORCE_REFRESH_TOKEN}"
    scope: "full refresh_token offline_access"

  salesloft_token: "${SALESLOFT_API_TOKEN}"

sync_configuration:
  # Object-specific settings
  objects:
    Contact:
      enabled: true
      sync_direction: "bidirectional"
      match_field: "Email"
      create_if_missing: true
      update_if_changed: true

    Lead:
      enabled: true
      sync_direction: "bidirectional"
      match_field: "Email"
      convert_to_contact: true
      conversion_threshold: "MQL"

    Account:
      enabled: true
      sync_direction: "salesforce_to_salesloft"
      match_field: "Id"

    Task:
      enabled: true
      sync_direction: "salesloft_to_salesforce"
      activity_types: ["email", "call", "meeting"]

    Event:
      enabled: true
      sync_direction: "bidirectional"

  # Field mappings
  field_mappings:
    standard: true  # Use standard mappings
    custom:
      - salesloft: "tags"
        salesforce: "Tags__c"
        transform: "semicolon_delimited"
      - salesloft: "persona"
        salesforce: "Persona__c"
        transform: "picklist_match"

  # Performance settings
  performance:
    batch_size: 100
    concurrent_syncs: 3
    timeout: 30000
    retry_attempts: 3
    retry_delay: 2000

  # Scheduling
  schedule:
    real_time:
      enabled: true
      objects: ["Task", "Event"]

    periodic:
      enabled: true
      interval: 300  # 5 minutes
      objects: ["Contact", "Lead", "Account"]

    daily:
      enabled: true
      time: "02:00"
      timezone: "America/New_York"
      objects: ["Opportunity", "Case"]

monitoring:
  # Error handling
  error_handling:
    log_level: "INFO"
    capture_errors: true
    alert_threshold: 10
    alert_channel: "slack"

  # Health checks
  health_checks:
    enabled: true
    interval: 60  # seconds
    endpoints:
      - "https://api.salesloft.com/v2/me"
      - "https://rentable.my.salesforce.com/services/data"

  # Metrics
  metrics:
    track_sync_time: true
    track_error_rate: true
    track_api_usage: true
    report_interval: 3600  # hourly

alerts:
  channels:
    slack:
      webhook: "${SLACK_WEBHOOK_URL}"
      channel: "#sales-ops-alerts"

    email:
      smtp_host: "smtp.gmail.com"
      smtp_port: 587
      from: "alerts@company.com"
      to: ["sales-ops@company.com"]

  triggers:
    - type: "connection_lost"
      severity: "critical"
      channels: ["slack", "email"]

    - type: "sync_error_rate"
      threshold: 5  # percent
      severity: "high"
      channels: ["slack"]

    - type: "api_limit"
      threshold: 80  # percent used
      severity: "warning"
      channels: ["email"]
```

---

## Monitoring & Prevention

### Automated Health Checks

```python
#!/usr/bin/env python3
"""
Salesloft Sync Health Monitor
Runs every 5 minutes to detect and alert on sync issues
"""

import requests
import os
import json
from datetime import datetime, timedelta
from typing import Dict, List

class SyncHealthMonitor:
    def __init__(self):
        self.salesloft_token = os.getenv("SALESLOFT_TOKEN")
        self.slack_webhook = os.getenv("SLACK_WEBHOOK_URL")
        self.error_threshold = 5
        self.last_check = datetime.now()

    def check_connection_status(self) -> Dict:
        """Verify CRM connection is active"""
        response = requests.get(
            "https://api.salesloft.com/v2/team",
            headers={"Authorization": f"Bearer {self.salesloft_token}"}
        )

        if response.status_code == 200:
            data = response.json()["data"]
            return {
                "connected": data.get("crm_connected", False),
                "crm_type": data.get("crm_type"),
                "instance_url": data.get("crm_url")
            }
        return {"connected": False, "error": response.status_code}

    def check_sync_errors(self, minutes: int = 60) -> List[Dict]:
        """Check for recent sync errors"""
        end_time = datetime.now()
        start_time = end_time - timedelta(minutes=minutes)

        response = requests.get(
            "https://api.salesloft.com/v2/crm_activities",
            params={
                "updated_at[gte]": start_time.isoformat(),
                "sync_status": "failed"
            },
            headers={"Authorization": f"Bearer {self.salesloft_token}"}
        )

        if response.status_code == 200:
            return response.json().get("data", [])
        return []

    def check_user_mappings(self) -> Dict:
        """Verify users have CRM IDs"""
        response = requests.get(
            "https://api.salesloft.com/v2/users",
            headers={"Authorization": f"Bearer {self.salesloft_token}"}
        )

        if response.status_code == 200:
            users = response.json().get("data", [])
            unmapped = [u for u in users if not u.get("crm_user_id")]
            return {
                "total_users": len(users),
                "mapped_users": len(users) - len(unmapped),
                "unmapped_users": unmapped
            }
        return {}

    def send_alert(self, message: str, severity: str = "warning"):
        """Send alert to Slack"""
        emoji = {
            "critical": "🔴",
            "high": "🟡",
            "warning": "⚠️",
            "info": "ℹ️"
        }.get(severity, "📢")

        payload = {
            "text": f"{emoji} *Salesloft Sync Alert*",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": message
                    }
                }
            ]
        }

        requests.post(self.slack_webhook, json=payload)

    def run_health_check(self):
        """Main health check routine"""
        issues = []

        # Check connection
        connection = self.check_connection_status()
        if not connection.get("connected"):
            issues.append({
                "severity": "critical",
                "message": "❌ CRM connection lost! Immediate action required."
            })

        # Check errors
        errors = self.check_sync_errors(60)
        if len(errors) > self.error_threshold:
            issues.append({
                "severity": "high",
                "message": f"⚠️ {len(errors)} sync errors in last hour"
            })

        # Check user mappings
        mappings = self.check_user_mappings()
        if mappings.get("unmapped_users"):
            issues.append({
                "severity": "warning",
                "message": f"👤 {len(mappings['unmapped_users'])} users not mapped to CRM"
            })

        # Send alerts if issues found
        for issue in issues:
            self.send_alert(issue["message"], issue["severity"])

        # Log status
        print(f"[{datetime.now()}] Health check complete: {len(issues)} issues found")

        return {
            "timestamp": datetime.now().isoformat(),
            "status": "healthy" if not issues else "unhealthy",
            "issues": issues,
            "metrics": {
                "connection": connection,
                "error_count": len(errors),
                "user_mappings": mappings
            }
        }

if __name__ == "__main__":
    monitor = SyncHealthMonitor()
    result = monitor.run_health_check()

    # Save result
    with open("/var/log/salesloft_health.json", "w") as f:
        json.dump(result, f, indent=2)
```

### Prevention Checklist

#### Daily Tasks
- [ ] Review sync status dashboard
- [ ] Check for failed sync attempts
- [ ] Verify new activities in both systems
- [ ] Monitor API usage levels

#### Weekly Tasks
- [ ] Audit sync error patterns
- [ ] Review user mapping completeness
- [ ] Check field mapping accuracy
- [ ] Validate data integrity
- [ ] Test sample record sync

#### Monthly Tasks
- [ ] Full connection validation
- [ ] Performance analysis
- [ ] Security review
- [ ] Documentation update
- [ ] Team training on issues

---

## Quick Reference Card

### Emergency Contacts
- **Salesloft Support**: support@salesloft.com
- **Salesforce Support**: (Your support plan contact)
- **Internal Admin**: Chris Acevedo (team@gorevpal.com)

### Critical Commands

```bash
# Check connection status
curl -H "Authorization: Bearer $SALESLOFT_TOKEN" \
  https://api.salesloft.com/v2/team | jq '.data.crm_connected'

# Force reconnection (via UI)
Navigate to: Settings → CRM → Salesforce → Reconnect

# Verify instance URL
echo "Correct: https://rentable.my.salesforce.com"
echo "Current: Check in Salesloft Settings"

# Test sync
Create test task in Salesloft and verify in Salesforce within 5 minutes
```

### Success Metrics
- ✅ Zero "Not connected to CRM" errors
- ✅ All users have CRM IDs mapped
- ✅ Sync delay < 5 minutes
- ✅ Error rate < 1%
- ✅ Correct instance URL confirmed

---

**Document Version**: 2.0
**Created**: September 2025
**Next Review**: Monthly or after any major incident

**Remember**: Most sync issues can be prevented with proper monitoring and configuration management. Use this guide proactively, not just reactively!