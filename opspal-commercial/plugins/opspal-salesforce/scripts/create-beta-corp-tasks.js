#!/usr/bin/env node

/**
 * Create Asana Tasks for beta-corp Production Salesforce Work (2025-09-30)
 *
 * Documents 5 major data operations completed on 2025-09-30:
 * 1. Contact Field - Original Lead Created Date Backfill
 * 2. Campaign Hand Raiser Assessment
 * 3. Converted Leads Demand Funnel Analysis
 * 4. First & Last Touch Campaign Attribution
 * 5. Demand Funnel Stage Field Update
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

class beta-corpAsanaTaskCreator {
  constructor() {
    this.apiKey = process.env.ASANA_ACCESS_TOKEN;
    this.workspaceGid = process.env.ASANA_WORKSPACE_GID;

    if (!this.apiKey || !this.workspaceGid) {
      throw new Error('Missing required environment variables: ASANA_ACCESS_TOKEN, ASANA_WORKSPACE_GID');
    }

    this.apiClient = axios.create({
      baseURL: 'https://app.asana.com/api/1.0',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    this.beta-corpProjectGid = null;
    this.assigneeGid = null;
    this.createdTasks = [];
  }

  /**
   * Search for beta-corp project
   */
  async findbeta-corpProject() {
    try {
      console.log('🔍 Searching for beta-corp project...');

      const response = await this.apiClient.get('/projects', {
        params: {
          workspace: this.workspaceGid,
          opt_fields: 'name,gid',
          limit: 100
        }
      });

      const projects = response.data.data;
      console.log(`   Found ${projects.length} projects in workspace`);

      const beta-corpProject = projects.find(p =>
        p.name.toLowerCase().includes('beta-corp')
      );

      if (!beta-corpProject) {
        console.log('\n   Available projects:');
        projects.forEach(p => console.log(`   - ${p.name}`));
        throw new Error('beta-corp project not found in workspace');
      }

      this.beta-corpProjectGid = beta-corpProject.gid;
      console.log(`✅ Found beta-corp project: ${beta-corpProject.name} (${beta-corpProject.gid})`);

      return beta-corpProject;
    } catch (error) {
      console.error('❌ Error finding beta-corp project:', error.message);
      if (error.response?.data) {
        console.error('   API Error:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email) {
    try {
      console.log(`\n🔍 Searching for user: ${email}...`);

      const response = await this.apiClient.get('/users', {
        params: {
          workspace: this.workspaceGid,
          opt_fields: 'name,email,gid'
        }
      });

      const users = response.data.data;
      const user = users.find(u => u.email === email);

      if (!user) {
        console.warn(`⚠️  User not found: ${email}, tasks will be unassigned`);
        return null;
      }

      this.assigneeGid = user.gid;
      console.log(`✅ Found user: ${user.name} (${user.gid})`);

      return user;
    } catch (error) {
      console.error('❌ Error finding user:', error.message);
      return null;
    }
  }

  /**
   * Create a task
   */
  async createTask(taskData) {
    try {
      console.log(`\n📝 Creating task: ${taskData.name}...`);

      const requestData = {
        data: {
          name: taskData.name,
          notes: taskData.notes,
          projects: [this.beta-corpProjectGid],
          due_on: taskData.due_on,
          completed: taskData.completed || false
        }
      };

      // Only add assignee if we have one
      if (this.assigneeGid) {
        requestData.data.assignee = this.assigneeGid;
      }

      const response = await this.apiClient.post('/tasks', requestData);
      const task = response.data.data;

      // Mark task as complete if requested
      if (taskData.completed) {
        await this.apiClient.put(`/tasks/${task.gid}`, {
          data: { completed: true }
        });
      }

      console.log(`✅ Created task: ${task.gid}`);
      console.log(`   URL: https://app.asana.com/0/${this.beta-corpProjectGid}/${task.gid}`);

      this.createdTasks.push({
        gid: task.gid,
        name: taskData.name,
        url: `https://app.asana.com/0/${this.beta-corpProjectGid}/${task.gid}`,
        completed: taskData.completed
      });

      return task;
    } catch (error) {
      console.error(`❌ Error creating task: ${error.message}`);
      if (error.response?.data) {
        console.error('   API Error:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Create all beta-corp tasks
   */
  async createAllTasks() {
    const tasks = [
      {
        name: '✅ COMPLETED: Original Lead Created Date Backfill - 233 Contacts',
        due_on: '2025-09-30',
        completed: true,
        notes: `Successfully backfilled Original Lead Created Date field for all contacts converted from leads on 2025-09-30.

RESULTS:
- Contacts Updated: 233
- Success Rate: 100%
- Bulk Job ID: 750Uw00000VETJgIAP
- Processing Time: 5.96 seconds

FIELD POPULATED:
- Original_Lead_Created_Date__c (DateTime)

DATA QUALITY:
- Date range: 2024-08-01 to 2025-09-30
- All records verified successfully
- Backup created: backups/contacts-backup-2025-09-30T21-50-09.json

PROJECT FILES:
/instances/beta-production/lead-created-date-backfill-2025-09-30/

COMPLETED BY: Chris Acevedo
DATE: 2025-09-30`
      },
      {
        name: '✅ COMPLETED: Campaign Hand Raiser Feasibility Assessment',
        due_on: '2025-09-30',
        completed: true,
        notes: `Comprehensive analysis of campaign membership data to determine if we can identify hand raisers (engaged prospects).

RESULTS:
- Campaigns Analyzed: 124 (past year)
- Active Campaigns: 83 (67%)
- Total Campaign Members: 125 sampled
- CONCLUSION: YES - Campaign membership CAN identify hand raisers with HIGH confidence

TOP HAND RAISER CAMPAIGNS:
1. BRV Service Landing Page (100% response rate)
2. Buprenorphine Interest List (75.7% response rate)
3. BAM Dosing Guide Landing Page (89.7% response rate)

KEY FINDINGS:
- 9.7% of campaigns currently track responses (opportunity for improvement)
- Email and Event campaigns show strongest engagement
- "Responded" status and HasResponded=true are primary indicators

RECOMMENDATIONS:
- Expand Interest List strategy (proven MQL generator)
- Standardize campaign member statuses
- Target 25% response tracking within 30 days

PROJECT FILES:
/instances/beta-production/campaign-hand-raiser-assessment-2025-09-30/

Reports:
- EXECUTIVE_SUMMARY.md
- CAMPAIGN_INVENTORY_REPORT.md
- HAND_RAISER_FEASIBILITY_ASSESSMENT.md
- RECOMMENDATIONS_AND_IMPLEMENTATION.md

COMPLETED BY: Chris Acevedo
DATE: 2025-09-30`
      },
      {
        name: '✅ COMPLETED: Demand Funnel Stage Analysis - 240 Converted Leads',
        due_on: '2025-09-30',
        completed: true,
        notes: `Analyzed all leads converted on 2025-09-30 and categorized them by demand funnel stage based on campaign engagement.

DEMAND FUNNEL DEFINITIONS APPLIED:
- Suspect: No tracked activity or brand engagement (0 campaign memberships)
- Engaged: Marketing/campaign engagement, no explicit hand raise
- MQL: Form completed or explicit interest shown (landing pages, interest lists)

RESULTS - 240 LEADS ANALYZED:
- Suspect: 43 leads (17.9%) - 16.4 days avg to convert
- Engaged: 168 leads (70.0%) - 49.4 days avg to convert, 1.3 campaign touches avg
- MQL: 29 leads (12.1%) - 12.3 days avg to convert (fastest)

TOP MQL CAMPAIGNS:
1. Buprenorphine Interest List - 26 MQLs (89.7% of all MQLs)
2. Landing pages - 3 MQLs (10.3%)

TOP ENGAGED CAMPAIGNS:
1. IntroVet CE 2025 - 38 leads
2. Fetch KC 2025 - 32 leads

CONVERSION VELOCITY:
- 32.9% convert within 1-7 days
- 37.5% take 31-90 days
- MQLs convert 4x faster than Engaged leads

PROJECT FILES:
/instances/beta-production/converted-leads-funnel-analysis-2025-09-30/
- leads-funnel-categorization.csv
- FUNNEL_ANALYSIS_REPORT.md

COMPLETED BY: Chris Acevedo
DATE: 2025-09-30`
      },
      {
        name: '✅ COMPLETED: First & Last Touch Attribution - 196 Contacts',
        due_on: '2025-09-30',
        completed: true,
        notes: `Populated First Touch and Last Touch campaign attribution fields for all contacts converted from leads on 2025-09-30.

FIELDS POPULATED:
- First_Touch_Campaign__c (Campaign lookup)
- First_Touch_Campaign_Date__c (Date)
- Last_Touch_Campaign__c (Campaign lookup)
- Last_Touch_Campaign_Date__c (Date)

RESULTS:
- Contacts Updated: 196/197 (99.5% success)
- Contacts with Campaign History: 197
- Contacts without History: 43 (not updated)
- Failed: 1 (validation rule - excluded per request)
- Bulk Job ID: 750Uw00000VExpcIAD
- Processing Time: 13.06 seconds

TOP FIRST TOUCH CAMPAIGNS (What drives initial engagement):
1. IntroVet CE 2025 - 38 contacts (19.3%)
2. Fetch KC 2025 - 32 contacts (16.2%)
3. Buprenorphine Interest List - 26 contacts (13.2%)

TOP LAST TOUCH CAMPAIGNS (What drives conversion):
1. IntroVet CE 2025 - 39 contacts (19.8%)
2. Fetch KC 2025 - 32 contacts (16.2%)
3. Buprenorphine Interest List - 26 contacts (13.2%)

KEY INSIGHT: IntroVet CE 2025 is strongest for BOTH first touch and last touch, showing consistent engagement across customer journey.

ATTRIBUTION METRICS:
- Total Campaign Memberships: 515
- Average days between First and Last Touch: 11.4 days
- Single-touch conversions: Identified

PROJECT FILES:
/instances/beta-production/first-last-touch-attribution-2025-09-30/
- Backup: backups/contact-backup-2025-10-01T00-37-35.json

COMPLETED BY: Chris Acevedo
DATE: 2025-09-30`
      },
      {
        name: '✅ COMPLETED: Demand Funnel Stage Population - 234 Contacts',
        due_on: '2025-09-30',
        completed: true,
        notes: `Updated Demand_Funnel_Stage__c field on Contact records based on campaign engagement analysis.

RESULTS:
- Contacts Updated: 234/235 (99.6% success)
- Excluded (per request): 1 validation failure
- Failed: 1 deleted contact
- Bulk Job ID: 750Uw00000VEkR3IAL
- Processing Time: 18.62 seconds

FINAL FUNNEL DISTRIBUTION:
- Suspect: 41 contacts (17.5%)
- Engaged: 165 contacts (70.5%)
- MQL: 28 contacts (12.0%)

BEFORE vs AFTER:
- Eliminated 217 incorrectly labeled "Suspect" records
- Properly classified 165 as "Engaged" based on campaign activity
- Identified 28 true MQLs from high-intent campaigns
- Removed 17 null values

DATA QUALITY:
- 100% accuracy on successful updates
- Zero mismatches between expected and actual
- Complete audit trail with backups
- All changes verified via SOQL

PROJECT FILES:
/instances/beta-production/converted-leads-funnel-analysis-2025-09-30/
- Backup: backups/demand-funnel-stage-backup-2025-10-01T00-49-51-631Z.json
- Verification: reports/VERIFICATION_demand-funnel-stage-update.json

BUSINESS IMPACT:
- Sales team can now prioritize 28 MQLs for immediate follow-up
- 165 Engaged contacts can be nurtured through targeted campaigns
- Accurate funnel metrics for reporting and forecasting

COMPLETED BY: Chris Acevedo
DATE: 2025-09-30`
      }
    ];

    for (const task of tasks) {
      await this.createTask(task);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY: beta-corp Tasks Created');
    console.log('='.repeat(80));
    console.log(`\nProject: beta-corp (${this.beta-corpProjectGid})`);
    console.log(`Assignee: ${this.assigneeGid || 'Unassigned'}`);
    console.log(`Date: 2025-09-30`);
    console.log(`\nTasks Created: ${this.createdTasks.length}\n`);

    this.createdTasks.forEach((task, index) => {
      const status = task.completed ? '✅' : '⏸️';
      console.log(`${index + 1}. ${status} ${task.name}`);
      console.log(`   GID: ${task.gid}`);
      console.log(`   URL: ${task.url}\n`);
    });

    console.log('='.repeat(80));
  }

  /**
   * Run the task creation process
   */
  async run() {
    try {
      console.log('🚀 beta-corp Asana Task Creator');
      console.log('='.repeat(80));

      // Step 1: Find beta-corp project
      await this.findbeta-corpProject();

      // Step 2: Find assignee
      await this.findUserByEmail('cacevedo@beta-corp.com');

      // Step 3: Create all tasks
      console.log('\n📋 Creating tasks...');
      await this.createAllTasks();

      // Step 4: Print summary
      this.printSummary();

      console.log('✅ All tasks created successfully!');

      return {
        success: true,
        tasks: this.createdTasks,
        projectGid: this.beta-corpProjectGid
      };

    } catch (error) {
      console.error('\n❌ Error in task creation process:', error.message);
      if (error.response?.data) {
        console.error('API Error Details:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }
}

// Run if executed directly
if (require.main === module) {
  const creator = new beta-corpAsanaTaskCreator();

  creator.run()
    .then(() => {
      console.log('\n🎉 Task creation complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Fatal error:', error.message);
      process.exit(1);
    });
}

module.exports = { beta-corpAsanaTaskCreator };
