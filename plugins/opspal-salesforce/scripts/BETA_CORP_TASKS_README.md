# sample-org Asana Tasks Creation Guide

## Overview
This guide documents the creation of 5 Asana tasks for sample-org Production Salesforce work completed on 2025-09-30.

## Prerequisites

1. **Environment Variables** - Already configured in `.env`:
   - `ASANA_ACCESS_TOKEN`: 2/1206945125479946/1211103618089638:055c4644fe065765219926a8384381d5
   - `ASANA_WORKSPACE_GID`: REDACTED_WORKSPACE_ID

2. **Dependencies** - Already installed:
   - `axios` - HTTP client for Asana API calls
   - `dotenv` - Environment variable loading

## Tasks to Create

### Task 1: Original Lead Created Date Backfill ✅
- **Name**: ✅ COMPLETED: Original Lead Created Date Backfill - 233 Contacts
- **Due Date**: 2025-09-30
- **Status**: Completed
- **Summary**: Successfully backfilled 233 contacts with original lead creation dates

### Task 2: Campaign Hand Raiser Assessment ✅
- **Name**: ✅ COMPLETED: Campaign Hand Raiser Feasibility Assessment
- **Due Date**: 2025-09-30
- **Status**: Completed
- **Summary**: Analyzed 124 campaigns to determine hand raiser identification capability

### Task 3: Demand Funnel Analysis ✅
- **Name**: ✅ COMPLETED: Demand Funnel Stage Analysis - 240 Converted Leads
- **Due Date**: 2025-09-30
- **Status**: Completed
- **Summary**: Categorized 240 leads by demand funnel stage based on engagement

### Task 4: First & Last Touch Attribution ✅
- **Name**: ✅ COMPLETED: First & Last Touch Attribution - 196 Contacts
- **Due Date**: 2025-09-30
- **Status**: Completed
- **Summary**: Populated attribution fields for 196 contacts

### Task 5: Demand Funnel Stage Population ✅
- **Name**: ✅ COMPLETED: Demand Funnel Stage Population - 234 Contacts
- **Due Date**: 2025-09-30
- **Status**: Completed
- **Summary**: Updated Demand_Funnel_Stage__c field for 234 contacts

## Execution Instructions

### Option 1: Direct Execution (Recommended)
```bash
cd ${PROJECT_ROOT:-/path/to/project}/legacy/SFDC
node scripts/create-sample-org-tasks.js
```

### Option 2: Using Bash Wrapper
```bash
cd ${PROJECT_ROOT:-/path/to/project}/legacy/SFDC
bash scripts/run-sample-org-tasks.sh
```

## Expected Output

The script will:

1. **Search for sample-org project** in workspace REDACTED_WORKSPACE_ID
2. **Find assignee** Chris Acevedo (cacevedo@sample-org.com)
3. **Create 5 tasks** with detailed descriptions
4. **Mark tasks as completed** automatically
5. **Print summary** with task GIDs and URLs

### Success Output Example:
```
🚀 sample-org Asana Task Creator
================================================================================
🔍 Searching for sample-org project...
   Found X projects in workspace
✅ Found sample-org project: sample-org (1234567890123456)

🔍 Searching for user: cacevedo@sample-org.com...
✅ Found user: Chris Acevedo (1234567890123457)

📋 Creating tasks...

📝 Creating task: ✅ COMPLETED: Original Lead Created Date Backfill - 233 Contacts...
✅ Created task: 1234567890123458
   URL: https://app.asana.com/0/1234567890123456/1234567890123458

[... 4 more tasks created ...]

================================================================================
📊 SUMMARY: sample-org Tasks Created
================================================================================

Project: sample-org (1234567890123456)
Assignee: 1234567890123457
Date: 2025-09-30

Tasks Created: 5

1. ✅ ✅ COMPLETED: Original Lead Created Date Backfill - 233 Contacts
   GID: 1234567890123458
   URL: https://app.asana.com/0/1234567890123456/1234567890123458

2. ✅ ✅ COMPLETED: Campaign Hand Raiser Feasibility Assessment
   GID: 1234567890123459
   URL: https://app.asana.com/0/1234567890123456/1234567890123459

3. ✅ ✅ COMPLETED: Demand Funnel Stage Analysis - 240 Converted Leads
   GID: 1234567890123460
   URL: https://app.asana.com/0/1234567890123456/1234567890123460

4. ✅ ✅ COMPLETED: First & Last Touch Attribution - 196 Contacts
   GID: 1234567890123461
   URL: https://app.asana.com/0/1234567890123456/1234567890123461

5. ✅ ✅ COMPLETED: Demand Funnel Stage Population - 234 Contacts
   GID: 1234567890123462
   URL: https://app.asana.com/0/1234567890123456/1234567890123462

================================================================================

✅ All tasks created successfully!

🎉 Task creation complete!
```

## Verification

After execution, verify the tasks were created:

1. Visit Asana workspace: https://app.asana.com/0/REDACTED_WORKSPACE_ID
2. Navigate to the sample-org project
3. Confirm all 5 tasks are present with:
   - Correct names and descriptions
   - Due date set to 2025-09-30
   - Assigned to Chris Acevedo
   - Marked as completed

## Troubleshooting

### Error: "Missing required environment variables"
**Solution**: Verify `.env` file contains ASANA_ACCESS_TOKEN and ASANA_WORKSPACE_GID

### Error: "sample-org project not found"
**Solution**: Check workspace ID and ensure sample-org project exists

### Error: "User not found: cacevedo@sample-org.com"
**Solution**: Tasks will be created unassigned. Assign manually in Asana UI.

### Error: Rate limiting
**Solution**: Script includes 500ms delay between task creations. If rate limited, increase delay in code.

## Files Created

- `${PROJECT_ROOT:-/path/to/project}/legacy/SFDC/scripts/create-sample-org-tasks.js` - Main script
- `${PROJECT_ROOT:-/path/to/project}/legacy/SFDC/scripts/run-sample-org-tasks.sh` - Bash wrapper
- `${PROJECT_ROOT:-/path/to/project}/legacy/SFDC/scripts/BETA_CORP_TASKS_README.md` - This documentation

## Data Source Compliance

✅ **Real API Operations Only**: This script uses actual Asana API calls via axios
✅ **No Fake Task IDs**: All task GIDs come from real Asana API responses
✅ **Verified Data**: All task descriptions contain real data from Salesforce operations
✅ **Audit Trail**: Complete logging of all API operations

## Next Steps

1. Execute the script using one of the methods above
2. Copy the task URLs from the output
3. Share with stakeholders
4. Update project documentation with task links

---
**Created**: 2025-09-30
**Author**: Claude Code (Asana Task Manager Agent)
**Purpose**: Document sample-org Production Salesforce work in Asana
