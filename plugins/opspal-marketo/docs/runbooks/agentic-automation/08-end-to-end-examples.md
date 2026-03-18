# 08 - End-to-End Workflow Examples

## Overview

This document provides complete, production-ready workflow examples that combine all capability areas covered in this runbook. Each example demonstrates realistic agentic automation scenarios with full code, error handling, and best practices.

## Example 1: Webinar Campaign Launch

### Scenario
Launch a complete webinar campaign including:
- Clone program template
- Update all tokens
- Approve all assets
- Activate trigger campaigns
- Schedule batch email

### Complete Implementation

```javascript
/**
 * Webinar Campaign Launch Orchestration
 *
 * Prerequisites:
 * - Template program exists with placeholder tokens
 * - Target folder created
 * - All required permissions
 */
async function launchWebinarCampaign(config) {
  const {
    templateProgramId,
    campaignName,
    targetFolderId,
    webinarDetails: {
      title,
      date,
      time,
      speaker,
      description,
      registrationUrl
    },
    scheduleInvite
  } = config;

  const results = {
    programId: null,
    assets: { emails: [], landingPages: [], forms: [] },
    campaigns: { triggers: [], batch: [] },
    errors: [],
    startTime: new Date().toISOString()
  };

  // Rate limit manager
  const pause = (ms = 200) => new Promise(r => setTimeout(r, ms));

  try {
    // ==========================================
    // Phase 1: Program Clone
    // ==========================================
    console.log('Phase 1: Cloning program template...');

    const cloneResult = await mcp__marketo__program_clone({
      programId: templateProgramId,
      name: campaignName,
      folder: { id: targetFolderId, type: 'Folder' },
      description: `Webinar: ${title} - ${date}`
    });

    if (!cloneResult.success) {
      throw new Error(`Clone failed: ${cloneResult.errors?.[0]?.message}`);
    }

    results.programId = cloneResult.result[0].id;
    console.log(`✓ Program cloned: ID ${results.programId}`);

    // ==========================================
    // Phase 2: Token Configuration
    // ==========================================
    console.log('Phase 2: Configuring program tokens...');

    const tokens = [
      { name: 'my.WebinarTitle', type: 'text', value: title },
      { name: 'my.WebinarDate', type: 'date', value: date },
      { name: 'my.WebinarTime', type: 'text', value: time },
      { name: 'my.SpeakerName', type: 'text', value: speaker.name },
      { name: 'my.SpeakerTitle', type: 'text', value: speaker.title },
      { name: 'my.SpeakerBio', type: 'rich text', value: speaker.bio },
      { name: 'my.WebinarDescription', type: 'rich text', value: description },
      { name: 'my.RegistrationURL', type: 'text', value: registrationUrl }
    ];

    await mcp__marketo__program_tokens_update({
      folderId: results.programId,
      folderType: 'Program',
      tokens: tokens
    });

    console.log(`✓ ${tokens.length} tokens configured`);
    await pause();

    // ==========================================
    // Phase 3: Asset Discovery
    // ==========================================
    console.log('Phase 3: Discovering program assets...');

    const programDetails = await mcp__marketo__program_get({
      programId: results.programId
    });

    // Parse asset references from program
    // Note: Actual response structure depends on program type
    const emails = programDetails.result[0].emails || [];
    const landingPages = programDetails.result[0].landingPages || [];
    const forms = programDetails.result[0].forms || [];
    const campaigns = programDetails.result[0].smartCampaigns || [];

    console.log(`✓ Found: ${emails.length} emails, ${landingPages.length} LPs, ${forms.length} forms, ${campaigns.length} campaigns`);

    // ==========================================
    // Phase 4: Asset Approval (Order matters!)
    // ==========================================
    console.log('Phase 4: Approving assets...');

    // 4a: Approve forms first (no dependencies)
    for (const form of forms) {
      try {
        await mcp__marketo__form_approve({ formId: form.id });
        results.assets.forms.push({ id: form.id, status: 'approved' });
        console.log(`  ✓ Form approved: ${form.name}`);
      } catch (error) {
        results.assets.forms.push({ id: form.id, status: 'error', error: error.message });
        results.errors.push({ asset: 'form', id: form.id, error: error.message });
      }
      await pause();
    }

    // 4b: Approve emails (tokens must be set first)
    for (const email of emails) {
      try {
        await mcp__marketo__email_approve({ emailId: email.id });
        results.assets.emails.push({ id: email.id, status: 'approved' });
        console.log(`  ✓ Email approved: ${email.name}`);
      } catch (error) {
        results.assets.emails.push({ id: email.id, status: 'error', error: error.message });
        results.errors.push({ asset: 'email', id: email.id, error: error.message });
      }
      await pause();
    }

    // 4c: Approve landing pages (may embed forms)
    for (const lp of landingPages) {
      try {
        await mcp__marketo__landing_page_approve({ landingPageId: lp.id });
        results.assets.landingPages.push({ id: lp.id, status: 'approved' });
        console.log(`  ✓ Landing Page approved: ${lp.name}`);
      } catch (error) {
        results.assets.landingPages.push({ id: lp.id, status: 'error', error: error.message });
        results.errors.push({ asset: 'landingPage', id: lp.id, error: error.message });
      }
      await pause();
    }

    // ==========================================
    // Phase 5: Campaign Activation
    // ==========================================
    console.log('Phase 5: Activating campaigns...');

    for (const campaign of campaigns) {
      try {
        if (campaign.type === 'trigger') {
          // Activate trigger campaigns immediately
          await mcp__marketo__campaign_activate({ campaignId: campaign.id });
          results.campaigns.triggers.push({ id: campaign.id, status: 'activated' });
          console.log(`  ✓ Trigger campaign activated: ${campaign.name}`);

        } else if (campaign.type === 'batch' && scheduleInvite) {
          // Schedule batch campaigns
          await mcp__marketo__campaign_schedule({
            campaignId: campaign.id,
            runAt: scheduleInvite
          });
          results.campaigns.batch.push({ id: campaign.id, status: 'scheduled', runAt: scheduleInvite });
          console.log(`  ✓ Batch campaign scheduled: ${campaign.name} for ${scheduleInvite}`);
        }
      } catch (error) {
        results.errors.push({ asset: 'campaign', id: campaign.id, error: error.message });
      }
      await pause();
    }

    // ==========================================
    // Phase 6: Verification
    // ==========================================
    console.log('Phase 6: Verification...');

    const finalProgram = await mcp__marketo__program_get({
      programId: results.programId
    });

    results.verification = {
      programStatus: finalProgram.result[0].status,
      totalAssets: emails.length + landingPages.length + forms.length,
      approvedAssets: results.assets.emails.filter(e => e.status === 'approved').length +
                      results.assets.landingPages.filter(l => l.status === 'approved').length +
                      results.assets.forms.filter(f => f.status === 'approved').length,
      activatedCampaigns: results.campaigns.triggers.filter(t => t.status === 'activated').length,
      scheduledCampaigns: results.campaigns.batch.filter(b => b.status === 'scheduled').length
    };

    results.endTime = new Date().toISOString();
    results.success = results.errors.length === 0;

    console.log('\n=== Launch Summary ===');
    console.log(`Program: ${results.programId}`);
    console.log(`Assets Approved: ${results.verification.approvedAssets}/${results.verification.totalAssets}`);
    console.log(`Triggers Activated: ${results.verification.activatedCampaigns}`);
    console.log(`Batch Scheduled: ${results.verification.scheduledCampaigns}`);
    console.log(`Errors: ${results.errors.length}`);
    console.log(`Success: ${results.success}`);

    return results;

  } catch (error) {
    results.error = error.message;
    results.success = false;
    results.endTime = new Date().toISOString();
    return results;
  }
}

// Usage Example
const webinarConfig = {
  templateProgramId: 1001,
  campaignName: 'Q1 2026 Webinar - AI in Marketing',
  targetFolderId: 5000,
  webinarDetails: {
    title: 'Leveraging AI for Modern Marketing',
    date: '2026-02-20',
    time: '2:00 PM EST',
    speaker: {
      name: 'Dr. Jane Smith',
      title: 'VP of Marketing Innovation',
      bio: '<p>Dr. Smith has 15 years of experience in marketing technology...</p>'
    },
    description: '<p>Join us for an in-depth exploration of AI-powered marketing strategies...</p>',
    registrationUrl: 'https://company.com/webinars/ai-marketing-2026'
  },
  scheduleInvite: '2026-02-10T09:00:00Z'
};

const result = await launchWebinarCampaign(webinarConfig);
```

## Example 2: Lead Database Maintenance

### Scenario
Perform complete lead database maintenance:
- Export all leads for analysis
- Identify and merge duplicates
- Flag incomplete records
- Generate health report

### Complete Implementation

```javascript
/**
 * Lead Database Maintenance Workflow
 *
 * Prerequisites:
 * - Bulk API access enabled
 * - Sufficient daily export quota
 */
async function performLeadMaintenance() {
  const results = {
    export: { status: null, records: 0 },
    duplicates: { found: 0, merged: 0 },
    incomplete: { found: 0, flagged: 0 },
    errors: [],
    startTime: new Date().toISOString()
  };

  const pause = (ms = 200) => new Promise(r => setTimeout(r, ms));

  try {
    // ==========================================
    // Phase 1: Export Lead Database
    // ==========================================
    console.log('Phase 1: Exporting lead database...');

    // Get export fields
    const leadFields = [
      'id', 'email', 'firstName', 'lastName', 'company',
      'title', 'phone', 'score', 'leadStatus', 'leadSource',
      'createdAt', 'updatedAt'
    ];

    // Create export job (last 2 years of data)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const exportJob = await mcp__marketo__bulk_lead_export_create({
      fields: leadFields,
      filter: {
        createdAt: {
          startAt: twoYearsAgo.toISOString(),
          endAt: new Date().toISOString()
        }
      },
      format: 'CSV'
    });

    const exportId = exportJob.result[0].exportId;
    console.log(`  Export job created: ${exportId}`);

    // Enqueue and wait for completion
    await mcp__marketo__bulk_lead_export_enqueue({ exportId });
    console.log('  Export job enqueued...');

    let status = 'Queued';
    let waitTime = 5000;

    while (status !== 'Completed' && status !== 'Failed') {
      await new Promise(r => setTimeout(r, waitTime));
      const statusCheck = await mcp__marketo__bulk_lead_export_status({ exportId });
      status = statusCheck.result[0].status;
      console.log(`  Status: ${status}`);

      if (status === 'Processing') {
        waitTime = Math.min(waitTime * 1.5, 60000);
      }
    }

    if (status === 'Failed') {
      throw new Error('Export job failed');
    }

    // Download file
    const csvData = await mcp__marketo__bulk_lead_export_file({ exportId });
    const leads = parseCSV(csvData);
    results.export.status = 'completed';
    results.export.records = leads.length;
    console.log(`✓ Exported ${leads.length} leads`);

    // ==========================================
    // Phase 2: Duplicate Detection
    // ==========================================
    console.log('Phase 2: Detecting duplicates...');

    // Group by normalized email
    const emailGroups = {};
    for (const lead of leads) {
      if (!lead.email) continue;
      const normalizedEmail = lead.email.toLowerCase().trim();
      if (!emailGroups[normalizedEmail]) {
        emailGroups[normalizedEmail] = [];
      }
      emailGroups[normalizedEmail].push(lead);
    }

    // Find duplicates
    const duplicateGroups = Object.entries(emailGroups)
      .filter(([_, group]) => group.length > 1);

    results.duplicates.found = duplicateGroups.reduce(
      (sum, [_, group]) => sum + group.length - 1, 0
    );
    console.log(`  Found ${results.duplicates.found} duplicate leads in ${duplicateGroups.length} groups`);

    // ==========================================
    // Phase 3: Merge Duplicates
    // ==========================================
    console.log('Phase 3: Merging duplicates...');

    for (const [email, group] of duplicateGroups) {
      // Sort by score (highest first) then by createdAt (oldest first)
      const sorted = group.sort((a, b) => {
        const scoreDiff = (parseInt(b.score) || 0) - (parseInt(a.score) || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      const winnerId = parseInt(sorted[0].id);
      const loserIds = sorted.slice(1).map(l => parseInt(l.id));

      // Merge in batches of 3
      while (loserIds.length > 0) {
        const batch = loserIds.splice(0, 3);

        try {
          await mcp__marketo__lead_merge({
            winnerId: winnerId,
            loserIds: batch,
            mergeInCRM: true
          });
          results.duplicates.merged += batch.length;
          console.log(`  ✓ Merged ${batch.length} leads into ${winnerId}`);
        } catch (error) {
          results.errors.push({
            phase: 'merge',
            winnerId,
            loserIds: batch,
            error: error.message
          });
        }

        await pause(300);
      }
    }

    // ==========================================
    // Phase 4: Incomplete Record Detection
    // ==========================================
    console.log('Phase 4: Detecting incomplete records...');

    const requiredFields = ['email', 'firstName', 'lastName', 'company'];
    const incompleteLeads = leads.filter(lead => {
      return requiredFields.some(field => !lead[field] || lead[field].trim() === '');
    });

    results.incomplete.found = incompleteLeads.length;
    console.log(`  Found ${incompleteLeads.length} incomplete leads`);

    // Flag incomplete leads by adding to a static list or updating field
    // This would typically trigger a campaign to request missing info
    // (Implementation depends on your Marketo setup)

    // ==========================================
    // Phase 5: Generate Report
    // ==========================================
    console.log('Phase 5: Generating health report...');

    results.report = {
      totalLeads: leads.length,
      uniqueEmails: Object.keys(emailGroups).length,
      duplicateRate: ((results.duplicates.found / leads.length) * 100).toFixed(2) + '%',
      incompleteRate: ((results.incomplete.found / leads.length) * 100).toFixed(2) + '%',
      averageScore: (leads.reduce((sum, l) => sum + (parseInt(l.score) || 0), 0) / leads.length).toFixed(1),
      leadsByStatus: groupBy(leads, 'leadStatus'),
      leadsBySource: groupBy(leads, 'leadSource')
    };

    results.endTime = new Date().toISOString();
    results.success = results.errors.length === 0;

    console.log('\n=== Maintenance Summary ===');
    console.log(`Total Leads: ${results.report.totalLeads}`);
    console.log(`Duplicates Found/Merged: ${results.duplicates.found}/${results.duplicates.merged}`);
    console.log(`Incomplete Records: ${results.incomplete.found}`);
    console.log(`Duplicate Rate: ${results.report.duplicateRate}`);
    console.log(`Incomplete Rate: ${results.report.incompleteRate}`);
    console.log(`Average Score: ${results.report.averageScore}`);
    console.log(`Errors: ${results.errors.length}`);

    return results;

  } catch (error) {
    results.error = error.message;
    results.success = false;
    results.endTime = new Date().toISOString();
    return results;
  }
}

// Helper functions
function parseCSV(csvString) {
  const lines = csvString.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });
}

function groupBy(array, key) {
  return array.reduce((groups, item) => {
    const value = item[key] || 'Unknown';
    groups[value] = (groups[value] || 0) + 1;
    return groups;
  }, {});
}

// Execute
const maintenanceResult = await performLeadMaintenance();
```

## Example 3: Daily Activity Sync

### Scenario
Sync daily Marketo activity data to an external data warehouse:
- Export all activities from last 24 hours
- Transform data for warehouse schema
- Generate sync report

### Complete Implementation

```javascript
/**
 * Daily Activity Sync Pipeline
 *
 * Run daily via scheduler (e.g., 2 AM UTC)
 */
async function syncDailyActivities(options = {}) {
  const {
    lookbackHours = 24,
    activityTypes = [1, 2, 6, 7, 10, 11, 12, 13, 22, 23, 24, 46]
  } = options;

  const results = {
    period: {},
    activityCounts: {},
    exportStats: {},
    errors: [],
    startTime: new Date().toISOString()
  };

  try {
    // ==========================================
    // Phase 1: Define Time Window
    // ==========================================
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (lookbackHours * 60 * 60 * 1000));

    results.period = {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      hours: lookbackHours
    };

    console.log(`Syncing activities from ${results.period.start} to ${results.period.end}`);

    // ==========================================
    // Phase 2: Get Activity Type Reference
    // ==========================================
    console.log('Loading activity type reference...');

    const activityTypesResponse = await mcp__marketo__activity_types_list();
    const activityTypeMap = {};
    for (const type of activityTypesResponse.result) {
      activityTypeMap[type.id] = type.name;
    }

    // ==========================================
    // Phase 3: Create Export Job
    // ==========================================
    console.log('Creating activity export job...');

    const exportJob = await mcp__marketo__bulk_activity_export_create({
      activityTypeIds: activityTypes,
      filter: {
        createdAt: {
          startAt: startTime.toISOString(),
          endAt: endTime.toISOString()
        }
      },
      format: 'CSV'
    });

    const exportId = exportJob.result[0].exportId;
    console.log(`  Export job created: ${exportId}`);

    // ==========================================
    // Phase 4: Process Export
    // ==========================================
    await mcp__marketo__bulk_activity_export_enqueue({ exportId });
    console.log('  Export job enqueued...');

    // Poll for completion
    let status = 'Queued';
    let pollCount = 0;
    const maxPolls = 60;  // 30 minutes max

    while (status !== 'Completed' && status !== 'Failed' && pollCount < maxPolls) {
      await new Promise(r => setTimeout(r, 30000));  // 30s intervals
      pollCount++;

      const statusCheck = await mcp__marketo__bulk_activity_export_status({ exportId });
      status = statusCheck.result[0].status;

      if (statusCheck.result[0].fileSize) {
        results.exportStats.fileSize = statusCheck.result[0].fileSize;
      }
      if (statusCheck.result[0].numberOfRecords) {
        results.exportStats.recordCount = statusCheck.result[0].numberOfRecords;
      }

      console.log(`  Poll ${pollCount}: ${status} (${results.exportStats.recordCount || 'counting'} records)`);
    }

    if (status !== 'Completed') {
      throw new Error(`Export failed or timed out. Final status: ${status}`);
    }

    // ==========================================
    // Phase 5: Download and Parse
    // ==========================================
    console.log('Downloading export file...');

    const csvData = await mcp__marketo__bulk_activity_export_file({ exportId });
    const activities = parseCSV(csvData);

    results.exportStats.downloadedRecords = activities.length;
    console.log(`  Downloaded ${activities.length} activity records`);

    // ==========================================
    // Phase 6: Transform and Aggregate
    // ==========================================
    console.log('Transforming activity data...');

    // Count by activity type
    for (const activity of activities) {
      const typeName = activityTypeMap[activity.activityTypeId] || `Unknown (${activity.activityTypeId})`;
      results.activityCounts[typeName] = (results.activityCounts[typeName] || 0) + 1;
    }

    // Transform for warehouse (example schema)
    const transformedRecords = activities.map(activity => ({
      activity_id: activity.marketoGUID,
      lead_id: activity.leadId,
      activity_type_id: activity.activityTypeId,
      activity_type_name: activityTypeMap[activity.activityTypeId],
      activity_date: activity.activityDate,
      primary_attribute: activity.primaryAttributeValue,
      attributes: activity.attributes,  // JSON string
      campaign_id: activity.campaignId,
      processed_at: new Date().toISOString()
    }));

    results.exportStats.transformedRecords = transformedRecords.length;

    // ==========================================
    // Phase 7: Generate Sync Report
    // ==========================================
    results.endTime = new Date().toISOString();
    results.success = true;
    results.duration = (new Date(results.endTime) - new Date(results.startTime)) / 1000;

    console.log('\n=== Daily Activity Sync Report ===');
    console.log(`Period: ${results.period.start} to ${results.period.end}`);
    console.log(`Duration: ${results.duration} seconds`);
    console.log(`Total Records: ${results.exportStats.transformedRecords}`);
    console.log('\nActivity Breakdown:');
    for (const [type, count] of Object.entries(results.activityCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }

    // Return transformed data for downstream processing
    return {
      ...results,
      records: transformedRecords
    };

  } catch (error) {
    results.error = error.message;
    results.success = false;
    results.endTime = new Date().toISOString();
    return results;
  }
}

function parseCSV(csvString) {
  const lines = csvString.trim().split('\n');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });
}

// Execute daily sync
const syncResult = await syncDailyActivities({
  lookbackHours: 24,
  activityTypes: [6, 7, 10, 11, 12]  // Email activities only
});
```

## Example 4: Multi-Campaign Batch Deployment

### Scenario
Deploy multiple campaigns for a quarterly campaign calendar:
- Clone templates for each campaign
- Configure campaign-specific tokens
- Approve and activate in sequence

### Implementation
```javascript
/**
 * Batch Campaign Deployment for Quarterly Calendar
 */
async function deployQuarterlyCampaigns(campaignCalendar) {
  const results = {
    campaigns: [],
    errors: [],
    summary: { total: 0, successful: 0, failed: 0 }
  };

  const pause = (ms) => new Promise(r => setTimeout(r, ms));

  results.summary.total = campaignCalendar.length;

  for (let i = 0; i < campaignCalendar.length; i++) {
    const campaignConfig = campaignCalendar[i];
    const campaignResult = {
      name: campaignConfig.name,
      steps: [],
      success: false
    };

    console.log(`\n[${i + 1}/${campaignCalendar.length}] Deploying: ${campaignConfig.name}`);

    try {
      // Clone
      const program = await mcp__marketo__program_clone({
        programId: campaignConfig.templateId,
        name: campaignConfig.name,
        folder: { id: campaignConfig.folderId, type: 'Folder' }
      });
      campaignResult.programId = program.result[0].id;
      campaignResult.steps.push({ step: 'clone', status: 'success' });
      console.log('  ✓ Program cloned');
      await pause(200);

      // Tokens
      await mcp__marketo__program_tokens_update({
        folderId: campaignResult.programId,
        folderType: 'Program',
        tokens: campaignConfig.tokens
      });
      campaignResult.steps.push({ step: 'tokens', status: 'success' });
      console.log('  ✓ Tokens configured');
      await pause(200);

      // Get assets
      const details = await mcp__marketo__program_get({
        programId: campaignResult.programId
      });

      // Approve emails
      for (const email of (details.result[0].emails || [])) {
        await mcp__marketo__email_approve({ emailId: email.id });
        await pause(200);
      }
      campaignResult.steps.push({ step: 'approve', status: 'success' });
      console.log('  ✓ Assets approved');

      // Activate triggers
      for (const campaign of (details.result[0].smartCampaigns || [])) {
        if (campaign.type === 'trigger') {
          await mcp__marketo__campaign_activate({ campaignId: campaign.id });
          await pause(200);
        }
      }
      campaignResult.steps.push({ step: 'activate', status: 'success' });
      console.log('  ✓ Campaigns activated');

      campaignResult.success = true;
      results.summary.successful++;

    } catch (error) {
      campaignResult.error = error.message;
      campaignResult.steps.push({ step: 'error', error: error.message });
      results.errors.push({ campaign: campaignConfig.name, error: error.message });
      results.summary.failed++;
      console.log(`  ✗ Failed: ${error.message}`);
    }

    results.campaigns.push(campaignResult);

    // Longer pause between campaigns
    await pause(1000);
  }

  console.log('\n=== Deployment Summary ===');
  console.log(`Total: ${results.summary.total}`);
  console.log(`Successful: ${results.summary.successful}`);
  console.log(`Failed: ${results.summary.failed}`);

  return results;
}

// Example quarterly calendar
const q1Calendar = [
  {
    name: 'Q1 Webinar - AI Marketing',
    templateId: 1001,
    folderId: 5001,
    tokens: [
      { name: 'my.EventName', type: 'text', value: 'AI in Marketing 2026' },
      { name: 'my.EventDate', type: 'date', value: '2026-01-25' }
    ]
  },
  {
    name: 'Q1 Webinar - Sales Automation',
    templateId: 1001,
    folderId: 5001,
    tokens: [
      { name: 'my.EventName', type: 'text', value: 'Sales Automation Deep Dive' },
      { name: 'my.EventDate', type: 'date', value: '2026-02-15' }
    ]
  },
  {
    name: 'Q1 Webinar - Customer Success',
    templateId: 1001,
    folderId: 5001,
    tokens: [
      { name: 'my.EventName', type: 'text', value: 'Building Customer Success Programs' },
      { name: 'my.EventDate', type: 'date', value: '2026-03-10' }
    ]
  }
];

const deploymentResult = await deployQuarterlyCampaigns(q1Calendar);
```

## Agent Routing Reference

| Example | Primary Agent | Supporting Agents |
|---------|--------------|-------------------|
| Webinar Campaign Launch | `marketo-automation-orchestrator` | `marketo-program-architect`, `marketo-email-specialist` |
| Lead Database Maintenance | `marketo-data-operations` | `marketo-lead-manager` |
| Daily Activity Sync | `marketo-data-operations` | `marketo-automation-orchestrator` |
| Batch Campaign Deployment | `marketo-automation-orchestrator` | `marketo-program-architect` |

## Key Takeaways

1. **Always use phases** - Break workflows into clear phases for debugging
2. **Rate limit awareness** - Add pauses between API calls
3. **Order matters** - Approve assets in dependency order
4. **Error isolation** - Don't let one failure stop the entire workflow
5. **Comprehensive logging** - Log every step for audit trails
6. **Verification** - Always verify results after operations
7. **Batch operations** - Use bulk APIs for large datasets
8. **Incremental sync** - Use date filters for efficient updates

