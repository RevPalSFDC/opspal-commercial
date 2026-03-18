#!/usr/bin/env node

/**
 * Intake Runbook Builder
 *
 * Purpose: Generate PROJECT_RUNBOOK.md from validated intake form data and gathered context
 * Usage: node scripts/lib/intake/intake-runbook-builder.js --form-data ./intake.json --output ./PROJECT_RUNBOOK.md
 *
 * Features:
 * - Converts intake JSON to structured markdown runbook
 * - Integrates gathered context (Asana, Salesforce, existing runbooks)
 * - Generates requirements table with IDs (REQ-001, etc.)
 * - Creates dependency matrix with blocking analysis
 * - Produces comprehensive stakeholder and communication plan
 * - Includes generation metadata and validation summary
 *
 * Output Sections:
 * 1. Project Overview
 * 2. Business Objectives & Success Metrics
 * 3. Scope (In/Out, Assumptions, Constraints)
 * 4. Requirements Table
 * 5. Technical Details
 * 6. Data Sources & Integrations
 * 7. Dependencies & Risks Matrix
 * 8. Timeline & Milestones
 * 9. Stakeholders & Communication Plan
 * 10. Gathered Context
 * 11. Approval & Sign-off
 * 12. Generation Metadata
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error
 */

const fs = require('fs');
const path = require('path');

/**
 * IntakeRunbookBuilder - Generates PROJECT_RUNBOOK.md from intake data
 */
class IntakeRunbookBuilder {
  constructor(options = {}) {
    this.options = {
      includeEmptySections: false,
      includeMetadata: true,
      requirementPrefix: 'REQ',
      ...options
    };

    this.requirementCounter = 0;
  }

  /**
   * Build runbook from intake data and context
   * @param {Object} formData - Validated intake form data
   * @param {Object} context - Gathered context (Asana, Salesforce, runbooks)
   * @param {Object} validation - Validation results
   * @returns {string} - Generated markdown content
   */
  build(formData, context = {}, validation = {}) {
    const sections = [];

    // Header
    sections.push(this.buildHeader(formData));

    // Project Overview
    sections.push(this.buildOverview(formData));

    // Business Objectives
    sections.push(this.buildObjectives(formData));

    // Scope
    sections.push(this.buildScope(formData));

    // Requirements Table
    sections.push(this.buildRequirements(formData));

    // Technical Details
    sections.push(this.buildTechnicalDetails(formData));

    // Data Sources & Integrations
    sections.push(this.buildDataSources(formData));

    // Dependencies & Risks
    sections.push(this.buildDependenciesRisks(formData));

    // Timeline & Milestones
    sections.push(this.buildTimeline(formData));

    // Stakeholders & Communication
    sections.push(this.buildStakeholders(formData));

    // Gathered Context
    if (context && Object.keys(context).length > 0) {
      sections.push(this.buildGatheredContext(context));
    }

    // Approval & Sign-off
    sections.push(this.buildApproval(formData));

    // Generation Metadata
    if (this.options.includeMetadata) {
      sections.push(this.buildMetadata(formData, validation));
    }

    return sections.filter(Boolean).join('\n\n');
  }

  /**
   * Build document header
   */
  buildHeader(formData) {
    const projectName = formData.projectIdentity?.projectName || 'Unnamed Project';
    const projectType = this.formatProjectType(formData.projectIdentity?.projectType);

    return `# ${projectName}

**Project Type:** ${projectType}
**Generated:** ${new Date().toISOString().split('T')[0]}
**Status:** Draft - Pending Approval

---`;
  }

  /**
   * Build project overview section
   */
  buildOverview(formData) {
    const identity = formData.projectIdentity || {};
    const goals = formData.goalsObjectives || {};

    const lines = ['## 1. Project Overview'];

    // Owner info
    if (identity.projectOwner) {
      lines.push('');
      lines.push('### Project Owner');
      lines.push(`- **Name:** ${identity.projectOwner.name || 'TBD'}`);
      lines.push(`- **Email:** ${identity.projectOwner.email || 'TBD'}`);
      if (identity.projectOwner.phone) {
        lines.push(`- **Phone:** ${identity.projectOwner.phone}`);
      }
      if (identity.projectOwner.department) {
        lines.push(`- **Department:** ${identity.projectOwner.department}`);
      }
    }

    // Description
    if (identity.description || goals.businessObjective) {
      lines.push('');
      lines.push('### Description');
      if (identity.description) {
        lines.push(identity.description);
      }
      if (goals.businessObjective) {
        lines.push('');
        lines.push('**Business Context:**');
        lines.push(goals.businessObjective);
      }
    }

    // Quick facts
    lines.push('');
    lines.push('### Quick Facts');
    lines.push(`| Attribute | Value |`);
    lines.push(`|-----------|-------|`);
    lines.push(`| Project Type | ${this.formatProjectType(identity.projectType)} |`);
    lines.push(`| Priority | ${this.formatPriority(identity.priority)} |`);
    if (formData.technicalRequirements?.platforms) {
      const platforms = Array.isArray(formData.technicalRequirements.platforms)
        ? formData.technicalRequirements.platforms.join(', ')
        : formData.technicalRequirements.platforms;
      lines.push(`| Platform(s) | ${platforms} |`);
    }
    if (formData.technicalRequirements?.complexity) {
      lines.push(`| Complexity | ${this.capitalize(formData.technicalRequirements.complexity)} |`);
    }
    if (formData.timelineBudget?.budgetRange) {
      lines.push(`| Budget Range | ${formData.timelineBudget.budgetRange} |`);
    }

    return lines.join('\n');
  }

  /**
   * Build business objectives section
   */
  buildObjectives(formData) {
    const goals = formData.goalsObjectives || {};
    const lines = ['## 2. Business Objectives & Success Metrics'];

    // Business Objective
    lines.push('');
    lines.push('### Business Objective');
    lines.push(goals.businessObjective || '_No business objective specified_');

    // Success Metrics
    lines.push('');
    lines.push('### Success Metrics');
    if (goals.successMetrics && goals.successMetrics.length > 0) {
      goals.successMetrics.forEach((metric, idx) => {
        if (typeof metric === 'string') {
          lines.push(`${idx + 1}. ${metric}`);
        } else if (metric.metric) {
          const target = metric.target ? ` (Target: ${metric.target})` : '';
          lines.push(`${idx + 1}. **${metric.metric}**${target}`);
          if (metric.measurement) {
            lines.push(`   - Measurement: ${metric.measurement}`);
          }
        }
      });
    } else {
      lines.push('_No success metrics defined_');
    }

    // User Impact (if provided)
    if (goals.userImpact) {
      lines.push('');
      lines.push('### Expected User Impact');
      lines.push(goals.userImpact);
    }

    return lines.join('\n');
  }

  /**
   * Build scope section
   */
  buildScope(formData) {
    const scope = formData.scope || {};
    const lines = ['## 3. Project Scope'];

    // In Scope
    lines.push('');
    lines.push('### In Scope');
    if (scope.inScope && scope.inScope.length > 0) {
      scope.inScope.forEach((item, idx) => {
        lines.push(`${idx + 1}. ${this.formatScopeItem(item)}`);
      });
    } else {
      lines.push('_No in-scope items specified_');
    }

    // Out of Scope
    lines.push('');
    lines.push('### Out of Scope');
    if (scope.outOfScope && scope.outOfScope.length > 0) {
      scope.outOfScope.forEach((item, idx) => {
        lines.push(`${idx + 1}. ${this.formatScopeItem(item)}`);
      });
    } else {
      lines.push('_No out-of-scope items specified_');
    }

    // Assumptions
    lines.push('');
    lines.push('### Assumptions');
    if (scope.assumptions && scope.assumptions.length > 0) {
      scope.assumptions.forEach((assumption, idx) => {
        const validated = assumption.validated ? ' ✅ Validated' : ' ⚠️ Unvalidated';
        const text = typeof assumption === 'string' ? assumption : assumption.assumption;
        lines.push(`${idx + 1}. ${text}${validated}`);
      });
    } else {
      lines.push('_No assumptions documented_');
    }

    // Constraints
    if (scope.constraints && scope.constraints.length > 0) {
      lines.push('');
      lines.push('### Constraints');
      scope.constraints.forEach((constraint, idx) => {
        lines.push(`${idx + 1}. ${this.formatConstraint(constraint)}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Build requirements table
   */
  buildRequirements(formData) {
    const scope = formData.scope || {};
    const lines = ['## 4. Requirements'];

    // Extract requirements from in-scope items
    const requirements = this.extractRequirements(formData);

    if (requirements.length === 0) {
      lines.push('');
      lines.push('_Requirements to be defined during planning phase_');
      return lines.join('\n');
    }

    // Requirements table
    lines.push('');
    lines.push('| ID | Requirement | Type | Priority | Dependencies |');
    lines.push('|----|-------------|------|----------|--------------|');

    requirements.forEach(req => {
      const deps = req.dependencies.length > 0 ? req.dependencies.join(', ') : 'None';
      lines.push(`| ${req.id} | ${req.title} | ${req.type} | ${req.priority} | ${deps} |`);
    });

    // Detailed requirements
    lines.push('');
    lines.push('### Detailed Requirements');

    requirements.forEach(req => {
      lines.push('');
      lines.push(`#### ${req.id}: ${req.title}`);
      lines.push('');
      lines.push(`**Type:** ${req.type}  `);
      lines.push(`**Priority:** ${req.priority}  `);
      lines.push(`**Dependencies:** ${req.dependencies.length > 0 ? req.dependencies.join(', ') : 'None'}`);
      lines.push('');
      lines.push('**Description:**');
      lines.push(req.description || '_To be detailed_');
      lines.push('');
      lines.push('**Acceptance Criteria:**');
      if (req.acceptanceCriteria && req.acceptanceCriteria.length > 0) {
        req.acceptanceCriteria.forEach(criteria => {
          lines.push(`- [ ] ${criteria}`);
        });
      } else {
        lines.push('- [ ] _To be defined_');
      }
    });

    return lines.join('\n');
  }

  /**
   * Build technical details section
   */
  buildTechnicalDetails(formData) {
    const tech = formData.technicalRequirements || {};
    const lines = ['## 5. Technical Details'];

    // Platforms
    lines.push('');
    lines.push('### Platforms');
    if (tech.platforms) {
      const platforms = Array.isArray(tech.platforms) ? tech.platforms : [tech.platforms];
      platforms.forEach(platform => {
        lines.push(`- ${this.capitalize(platform)}`);
      });
    } else {
      lines.push('_No platforms specified_');
    }

    // Salesforce Details
    if (tech.salesforceOrg) {
      lines.push('');
      lines.push('### Salesforce Configuration');
      lines.push(`| Setting | Value |`);
      lines.push(`|---------|-------|`);
      if (tech.salesforceOrg.orgAlias) {
        lines.push(`| Org Alias | ${tech.salesforceOrg.orgAlias} |`);
      }
      if (tech.salesforceOrg.orgType) {
        lines.push(`| Org Type | ${this.capitalize(tech.salesforceOrg.orgType)} |`);
      }
      if (tech.salesforceOrg.edition) {
        lines.push(`| Edition | ${tech.salesforceOrg.edition} |`);
      }
      if (tech.salesforceOrg.hasCPQ !== undefined) {
        lines.push(`| CPQ Installed | ${tech.salesforceOrg.hasCPQ ? 'Yes' : 'No'} |`);
      }
      if (tech.salesforceOrg.hasExperienceCloud !== undefined) {
        lines.push(`| Experience Cloud | ${tech.salesforceOrg.hasExperienceCloud ? 'Yes' : 'No'} |`);
      }
    }

    // HubSpot Details
    if (tech.hubspotPortal) {
      lines.push('');
      lines.push('### HubSpot Configuration');
      lines.push(`| Setting | Value |`);
      lines.push(`|---------|-------|`);
      if (tech.hubspotPortal.portalId) {
        lines.push(`| Portal ID | ${tech.hubspotPortal.portalId} |`);
      }
      if (tech.hubspotPortal.tier) {
        lines.push(`| Tier | ${this.capitalize(tech.hubspotPortal.tier)} |`);
      }
      if (tech.hubspotPortal.hubs) {
        const hubs = Array.isArray(tech.hubspotPortal.hubs)
          ? tech.hubspotPortal.hubs.join(', ')
          : tech.hubspotPortal.hubs;
        lines.push(`| Active Hubs | ${hubs} |`);
      }
    }

    // Complexity Assessment
    lines.push('');
    lines.push('### Complexity Assessment');
    lines.push(`**Overall Complexity:** ${this.capitalize(tech.complexity || 'moderate')}`);

    if (tech.complexityFactors && tech.complexityFactors.length > 0) {
      lines.push('');
      lines.push('**Contributing Factors:**');
      tech.complexityFactors.forEach(factor => {
        lines.push(`- ${factor}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Build data sources section
   */
  buildDataSources(formData) {
    const data = formData.dataSources || {};
    const lines = ['## 6. Data Sources & Integrations'];

    // Primary Data Sources
    lines.push('');
    lines.push('### Primary Data Sources');
    if (data.primarySources && data.primarySources.length > 0) {
      lines.push('');
      lines.push('| Source | Type | Direction | Records Est. |');
      lines.push('|--------|------|-----------|--------------|');

      data.primarySources.forEach(source => {
        const name = typeof source === 'string' ? source : source.name;
        const type = source.type || 'Unknown';
        const direction = source.direction || 'N/A';
        const records = source.estimatedRecords || 'TBD';
        lines.push(`| ${name} | ${this.capitalize(type)} | ${direction} | ${records} |`);
      });
    } else {
      lines.push('_No data sources specified_');
    }

    // Integrations
    if (data.integrations && data.integrations.length > 0) {
      lines.push('');
      lines.push('### Integrations');
      data.integrations.forEach((integration, idx) => {
        const name = typeof integration === 'string' ? integration : integration.name;
        lines.push(`${idx + 1}. **${name}**`);
        if (integration.type) {
          lines.push(`   - Type: ${integration.type}`);
        }
        if (integration.endpoint) {
          lines.push(`   - Endpoint: ${integration.endpoint}`);
        }
        if (integration.authentication) {
          lines.push(`   - Auth: ${integration.authentication}`);
        }
      });
    }

    // Existing Automations
    if (data.existingAutomations && data.existingAutomations.length > 0) {
      lines.push('');
      lines.push('### Existing Automations to Consider');
      data.existingAutomations.forEach((automation, idx) => {
        const name = typeof automation === 'string' ? automation : automation.name;
        lines.push(`${idx + 1}. ${name}`);
        if (automation.impact) {
          lines.push(`   - Impact: ${automation.impact}`);
        }
      });
    }

    return lines.join('\n');
  }

  /**
   * Build dependencies and risks section
   */
  buildDependenciesRisks(formData) {
    const deps = formData.dependenciesRisks || {};
    const lines = ['## 7. Dependencies & Risks'];

    // Dependencies
    lines.push('');
    lines.push('### Dependencies');
    if (deps.dependencies && deps.dependencies.length > 0) {
      lines.push('');
      lines.push('| Dependency | Type | Status | Blocks If Delayed |');
      lines.push('|------------|------|--------|-------------------|');

      deps.dependencies.forEach(dep => {
        const name = typeof dep === 'string' ? dep : dep.name;
        const type = dep.type || 'Unknown';
        const status = dep.status || 'Pending';
        const blocks = dep.blocksIfDelayed ? '⚠️ Yes' : 'No';
        lines.push(`| ${name} | ${this.capitalize(type)} | ${this.formatStatus(status)} | ${blocks} |`);
      });

      // Dependency details
      const blockingDeps = deps.dependencies.filter(d => d.blocksIfDelayed);
      if (blockingDeps.length > 0) {
        lines.push('');
        lines.push('**⚠️ Critical Dependencies (Blocking):**');
        blockingDeps.forEach(dep => {
          const name = typeof dep === 'string' ? dep : dep.name;
          lines.push(`- **${name}**: ${dep.description || 'No description'}`);
        });
      }
    } else {
      lines.push('_No dependencies identified_');
    }

    // Risks
    lines.push('');
    lines.push('### Risks');
    if (deps.risks && deps.risks.length > 0) {
      lines.push('');
      lines.push('| Risk | Impact | Probability | Mitigation |');
      lines.push('|------|--------|-------------|------------|');

      deps.risks.forEach(risk => {
        const name = typeof risk === 'string' ? risk : risk.name;
        const impact = risk.impact || 'Medium';
        const probability = risk.probability || 'Medium';
        const mitigation = risk.mitigation || 'TBD';
        lines.push(`| ${name} | ${this.formatRiskLevel(impact)} | ${this.formatRiskLevel(probability)} | ${mitigation} |`);
      });

      // High-priority risk details
      const highRisks = deps.risks.filter(r => r.impact === 'high' || r.probability === 'high');
      if (highRisks.length > 0) {
        lines.push('');
        lines.push('**🔴 High-Priority Risks:**');
        highRisks.forEach(risk => {
          const name = typeof risk === 'string' ? risk : risk.name;
          lines.push(`- **${name}**`);
          if (risk.description) {
            lines.push(`  - ${risk.description}`);
          }
          if (risk.mitigation) {
            lines.push(`  - Mitigation: ${risk.mitigation}`);
          }
        });
      }
    } else {
      lines.push('_No risks identified_');
    }

    return lines.join('\n');
  }

  /**
   * Build timeline section
   */
  buildTimeline(formData) {
    const timeline = formData.timelineBudget || {};
    const lines = ['## 8. Timeline & Milestones'];

    // Key Dates
    lines.push('');
    lines.push('### Key Dates');
    lines.push(`| Milestone | Date | Status |`);
    lines.push(`|-----------|------|--------|`);

    if (timeline.targetStartDate) {
      lines.push(`| Project Start | ${timeline.targetStartDate} | ${this.isDatePast(timeline.targetStartDate) ? '✅ Started' : '⏳ Planned'} |`);
    }

    if (timeline.milestones && timeline.milestones.length > 0) {
      timeline.milestones.forEach(milestone => {
        const name = typeof milestone === 'string' ? milestone : milestone.name;
        const date = milestone.date || 'TBD';
        const status = milestone.status || 'Planned';
        lines.push(`| ${name} | ${date} | ${this.formatMilestoneStatus(status)} |`);
      });
    }

    if (timeline.targetEndDate) {
      lines.push(`| Project End | ${timeline.targetEndDate} | ⏳ Target |`);
    }

    // Hard Deadline
    if (timeline.hardDeadline) {
      lines.push('');
      lines.push('### ⚠️ Hard Deadline');
      lines.push(`**Date:** ${timeline.targetEndDate || 'Not specified'}`);
      if (timeline.deadlineReason) {
        lines.push(`**Reason:** ${timeline.deadlineReason}`);
      }
    }

    // Budget
    if (timeline.budgetRange || timeline.budgetFlexibility) {
      lines.push('');
      lines.push('### Budget');
      if (timeline.budgetRange) {
        lines.push(`**Range:** ${timeline.budgetRange}`);
      }
      if (timeline.budgetFlexibility) {
        lines.push(`**Flexibility:** ${this.formatBudgetFlexibility(timeline.budgetFlexibility)}`);
      }
      if (timeline.budgetNotes) {
        lines.push(`**Notes:** ${timeline.budgetNotes}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build stakeholders section
   */
  buildStakeholders(formData) {
    const identity = formData.projectIdentity || {};
    const approval = formData.approvalSignoff || {};
    const lines = ['## 9. Stakeholders & Communication'];

    // Key Stakeholders
    lines.push('');
    lines.push('### Key Stakeholders');
    lines.push('');
    lines.push('| Name | Role | Email | Involvement |');
    lines.push('|------|------|-------|-------------|');

    // Project Owner
    if (identity.projectOwner) {
      lines.push(`| ${identity.projectOwner.name || 'TBD'} | Project Owner | ${identity.projectOwner.email || 'TBD'} | Primary |`);
    }

    // Additional stakeholders
    if (identity.stakeholders && identity.stakeholders.length > 0) {
      identity.stakeholders.forEach(stakeholder => {
        const name = typeof stakeholder === 'string' ? stakeholder : stakeholder.name;
        const role = stakeholder.role || 'Stakeholder';
        const email = stakeholder.email || 'TBD';
        const involvement = stakeholder.involvement || 'Informed';
        lines.push(`| ${name} | ${role} | ${email} | ${involvement} |`);
      });
    }

    // Approvers
    if (approval.approvers && approval.approvers.length > 0) {
      lines.push('');
      lines.push('### Approvers');
      lines.push('');
      lines.push('| Name | Type | Status |');
      lines.push('|------|------|--------|');

      approval.approvers.forEach(approver => {
        const name = typeof approver === 'string' ? approver : approver.name;
        const type = approver.type || 'General';
        const status = approver.approved ? '✅ Approved' : '⏳ Pending';
        lines.push(`| ${name} | ${this.capitalize(type)} | ${status} |`);
      });
    }

    // Communication Plan
    lines.push('');
    lines.push('### Communication Plan');

    if (approval.communicationPlan) {
      const plan = approval.communicationPlan;

      if (plan.primaryChannel) {
        lines.push(`**Primary Channel:** ${this.formatChannel(plan.primaryChannel)}`);
      }
      if (plan.updateFrequency) {
        lines.push(`**Update Frequency:** ${this.formatFrequency(plan.updateFrequency)}`);
      }
      if (plan.notificationLevel) {
        lines.push(`**Notification Level:** ${this.formatNotificationLevel(plan.notificationLevel)}`);
      }
    } else {
      lines.push('_Communication plan to be established_');
    }

    return lines.join('\n');
  }

  /**
   * Build gathered context section
   */
  buildGatheredContext(context) {
    const lines = ['## 10. Gathered Context'];
    lines.push('');
    lines.push('_The following context was automatically gathered from connected systems:_');

    // Salesforce Context
    if (context.salesforce) {
      lines.push('');
      lines.push('### Salesforce Org Context');

      if (context.salesforce.orgInfo) {
        const org = context.salesforce.orgInfo;
        lines.push('');
        lines.push('**Org Details:**');
        if (org.username) lines.push(`- Username: ${org.username}`);
        if (org.instanceUrl) lines.push(`- Instance: ${org.instanceUrl}`);
        if (org.orgId) lines.push(`- Org ID: ${org.orgId}`);
      }

      if (context.salesforce.objectCounts && Object.keys(context.salesforce.objectCounts).length > 0) {
        lines.push('');
        lines.push('**Object Record Counts:**');
        Object.entries(context.salesforce.objectCounts).forEach(([obj, count]) => {
          lines.push(`- ${obj}: ${count.toLocaleString()} records`);
        });
      }

      if (context.salesforce.validatedAssumptions && context.salesforce.validatedAssumptions.length > 0) {
        lines.push('');
        lines.push('**Validated Assumptions:**');
        context.salesforce.validatedAssumptions.forEach(a => {
          const icon = a.validated ? '✅' : '❌';
          lines.push(`- ${icon} ${a.assumption}: ${a.result}`);
        });
      }
    }

    // Asana Context
    if (context.asana) {
      lines.push('');
      lines.push('### Asana Context');

      if (context.asana.projectInfo) {
        const proj = context.asana.projectInfo;
        lines.push('');
        lines.push('**Project Info:**');
        if (proj.name) lines.push(`- Name: ${proj.name}`);
        if (proj.workspace) lines.push(`- Workspace: ${proj.workspace}`);
      }

      if (context.asana.taskHistory && context.asana.taskHistory.length > 0) {
        lines.push('');
        lines.push('**Recent Tasks:**');
        context.asana.taskHistory.slice(0, 5).forEach(task => {
          const status = task.completed ? '✅' : '⬜';
          lines.push(`- ${status} ${task.name}`);
        });
      }

      if (context.asana.similarProjects && context.asana.similarProjects.length > 0) {
        lines.push('');
        lines.push('**Similar Past Projects:**');
        context.asana.similarProjects.forEach(proj => {
          lines.push(`- ${proj.name} (${proj.similarity}% match)`);
        });
      }
    }

    // Related Runbooks
    if (context.runbooks && context.runbooks.length > 0) {
      lines.push('');
      lines.push('### Related Runbooks');
      lines.push('');
      lines.push('| Runbook | Match Score | Key Patterns |');
      lines.push('|---------|-------------|--------------|');

      context.runbooks.forEach(rb => {
        const patterns = rb.patterns ? rb.patterns.slice(0, 2).join(', ') : 'N/A';
        lines.push(`| ${rb.name} | ${rb.matchScore}% | ${patterns} |`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Build approval section
   */
  buildApproval(formData) {
    const approval = formData.approvalSignoff || {};
    const lines = ['## 11. Approval & Sign-off'];

    lines.push('');
    lines.push('### Sign-off Checklist');
    lines.push('');
    lines.push('- [ ] Project scope reviewed and approved');
    lines.push('- [ ] Requirements validated');
    lines.push('- [ ] Timeline and milestones confirmed');
    lines.push('- [ ] Budget approved');
    lines.push('- [ ] Dependencies confirmed');
    lines.push('- [ ] Risk mitigation plans accepted');
    lines.push('- [ ] Communication plan established');

    // Signatures section
    lines.push('');
    lines.push('### Approvals');
    lines.push('');
    lines.push('| Role | Name | Date | Signature |');
    lines.push('|------|------|------|-----------|');
    lines.push('| Project Owner | | | |');
    lines.push('| Technical Lead | | | |');
    lines.push('| Business Sponsor | | | |');

    if (approval.additionalNotes) {
      lines.push('');
      lines.push('### Additional Notes');
      lines.push(approval.additionalNotes);
    }

    return lines.join('\n');
  }

  /**
   * Build metadata section
   */
  buildMetadata(formData, validation) {
    const lines = ['---', '', '## Generation Metadata'];

    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    lines.push(`| Generated | ${new Date().toISOString()} |`);
    lines.push(`| Generator | Intake Runbook Builder v1.0.0 |`);

    if (validation.completenessScore !== undefined) {
      lines.push(`| Completeness Score | ${validation.completenessScore}% |`);
    }

    if (validation.valid !== undefined) {
      lines.push(`| Validation Status | ${validation.valid ? '✅ Valid' : '⚠️ Has Issues'} |`);
    }

    if (validation.errors && validation.errors.length > 0) {
      lines.push(`| Validation Errors | ${validation.errors.length} |`);
    }

    if (validation.warnings && validation.warnings.length > 0) {
      lines.push(`| Validation Warnings | ${validation.warnings.length} |`);
    }

    // Source file
    if (formData._sourceFile) {
      lines.push(`| Source File | ${formData._sourceFile} |`);
    }

    return lines.join('\n');
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  /**
   * Extract requirements from form data
   */
  extractRequirements(formData) {
    const requirements = [];
    const scope = formData.scope || {};

    // Convert in-scope items to requirements
    if (scope.inScope && scope.inScope.length > 0) {
      scope.inScope.forEach((item, idx) => {
        this.requirementCounter++;
        const req = {
          id: `${this.options.requirementPrefix}-${String(this.requirementCounter).padStart(3, '0')}`,
          title: typeof item === 'string' ? item : item.title || item.name || item.feature,
          type: this.inferRequirementType(item),
          priority: item.priority || formData.projectIdentity?.priority || 'medium',
          description: item.description || '',
          dependencies: item.dependencies || [],
          acceptanceCriteria: item.acceptanceCriteria || []
        };
        requirements.push(req);
      });
    }

    return requirements;
  }

  /**
   * Infer requirement type from item
   */
  inferRequirementType(item) {
    if (typeof item === 'object' && item.type) {
      return this.capitalize(item.type);
    }

    const text = (typeof item === 'string' ? item : item.title || '').toLowerCase();

    if (text.includes('report') || text.includes('dashboard')) return 'Functional';
    if (text.includes('integration') || text.includes('api')) return 'Integration';
    if (text.includes('migrate') || text.includes('import')) return 'Data';
    if (text.includes('flow') || text.includes('automation')) return 'Automation';
    if (text.includes('field') || text.includes('object')) return 'Data';
    if (text.includes('test')) return 'Testing';
    if (text.includes('deploy')) return 'Deployment';

    return 'Functional';
  }

  /**
   * Format project type
   */
  formatProjectType(type) {
    if (!type) return 'Not Specified';

    const typeMap = {
      'salesforce-implementation': 'Salesforce Implementation',
      'hubspot-implementation': 'HubSpot Implementation',
      'cross-platform-integration': 'Cross-Platform Integration',
      'data-migration': 'Data Migration',
      'automation-build': 'Automation Build',
      'reporting-analytics': 'Reporting & Analytics',
      'cpq-configuration': 'CPQ Configuration',
      'custom-development': 'Custom Development',
      'process-optimization': 'Process Optimization',
      'security-audit': 'Security Audit'
    };

    return typeMap[type] || this.capitalize(type.replace(/-/g, ' '));
  }

  /**
   * Format priority level
   */
  formatPriority(priority) {
    if (!priority) return 'Medium';

    const priorityMap = {
      'critical': '🔴 Critical',
      'high': '🟠 High',
      'medium': '🟡 Medium',
      'low': '🟢 Low'
    };

    return priorityMap[priority.toLowerCase()] || this.capitalize(priority);
  }

  /**
   * Format scope item
   */
  formatScopeItem(item) {
    if (typeof item === 'string') return item;
    return item.title || item.name || item.feature || item.description || JSON.stringify(item);
  }

  /**
   * Format constraint
   */
  formatConstraint(constraint) {
    if (typeof constraint === 'string') return constraint;
    const type = constraint.type ? `[${this.capitalize(constraint.type)}] ` : '';
    return `${type}${constraint.constraint || constraint.description || JSON.stringify(constraint)}`;
  }

  /**
   * Format dependency/risk status
   */
  formatStatus(status) {
    const statusMap = {
      'confirmed': '✅ Confirmed',
      'pending': '⏳ Pending',
      'at-risk': '⚠️ At Risk',
      'blocked': '🚫 Blocked'
    };
    return statusMap[status.toLowerCase()] || this.capitalize(status);
  }

  /**
   * Format risk level
   */
  formatRiskLevel(level) {
    if (!level) return 'Medium';
    const levelMap = {
      'high': '🔴 High',
      'medium': '🟡 Medium',
      'low': '🟢 Low'
    };
    return levelMap[level.toLowerCase()] || this.capitalize(level);
  }

  /**
   * Format milestone status
   */
  formatMilestoneStatus(status) {
    const statusMap = {
      'completed': '✅ Completed',
      'in-progress': '🔄 In Progress',
      'planned': '⏳ Planned',
      'at-risk': '⚠️ At Risk',
      'delayed': '🔴 Delayed'
    };
    return statusMap[status.toLowerCase()] || status;
  }

  /**
   * Format budget flexibility
   */
  formatBudgetFlexibility(flexibility) {
    const flexMap = {
      'fixed': 'Fixed Budget',
      'some-flexibility': 'Some Flexibility Available',
      'flexible': 'Flexible'
    };
    return flexMap[flexibility] || this.capitalize(flexibility);
  }

  /**
   * Format communication channel
   */
  formatChannel(channel) {
    const channelMap = {
      'slack': 'Slack',
      'email': 'Email',
      'asana': 'Asana',
      'teams': 'Microsoft Teams'
    };
    return channelMap[channel] || this.capitalize(channel);
  }

  /**
   * Format update frequency
   */
  formatFrequency(frequency) {
    const freqMap = {
      'daily': 'Daily',
      'weekly': 'Weekly',
      'bi-weekly': 'Bi-Weekly',
      'milestone-only': 'Milestone-Only'
    };
    return freqMap[frequency] || this.capitalize(frequency);
  }

  /**
   * Format notification level
   */
  formatNotificationLevel(level) {
    const levelMap = {
      'all-updates': 'All Updates',
      'milestones-only': 'Milestones Only',
      'completion-only': 'Completion Only'
    };
    return levelMap[level] || this.capitalize(level);
  }

  /**
   * Check if date is in the past
   */
  isDatePast(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  /**
   * Capitalize string
   */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// =============================================================================
// CLI Functions
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    formData: null,
    context: null,
    validation: null,
    output: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--form-data':
        options.formData = next;
        i++;
        break;
      case '--context':
        options.context = next;
        i++;
        break;
      case '--validation':
        options.validation = next;
        i++;
        break;
      case '--output':
        options.output = next;
        i++;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`❌ Unknown option: ${arg}`);
          printUsage();
          process.exit(1);
        }
    }
  }

  return options;
}

function printUsage() {
  console.log('Usage: intake-runbook-builder.js --form-data <file> [options]');
  console.log('');
  console.log('Required Arguments:');
  console.log('  --form-data <file>    Path to validated intake JSON file');
  console.log('');
  console.log('Optional Arguments:');
  console.log('  --context <file>      Path to gathered context JSON');
  console.log('  --validation <file>   Path to validation results JSON');
  console.log('  --output <file>       Output path for generated runbook (default: stdout)');
  console.log('');
  console.log('Examples:');
  console.log('  # Generate runbook from intake data');
  console.log('  node intake-runbook-builder.js --form-data ./intake.json --output ./PROJECT_RUNBOOK.md');
  console.log('');
  console.log('  # With context and validation');
  console.log('  node intake-runbook-builder.js \\');
  console.log('    --form-data ./intake.json \\');
  console.log('    --context ./context.json \\');
  console.log('    --validation ./validation.json \\');
  console.log('    --output ./PROJECT_RUNBOOK.md');
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`❌ Failed to load ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const options = parseArgs();

  if (!options.formData) {
    console.error('❌ Missing required argument: --form-data');
    printUsage();
    process.exit(1);
  }

  console.log('📋 Loading intake form data...');
  const formData = loadJson(options.formData);
  formData._sourceFile = options.formData;

  let context = {};
  if (options.context) {
    console.log('🔍 Loading gathered context...');
    context = loadJson(options.context);
  }

  let validation = {};
  if (options.validation) {
    console.log('✅ Loading validation results...');
    validation = loadJson(options.validation);
  }

  console.log('🏗️  Building runbook...');
  const builder = new IntakeRunbookBuilder();
  const runbook = builder.build(formData, context, validation);

  if (options.output) {
    const outputDir = path.dirname(options.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(options.output, runbook, 'utf-8');
    console.log(`✅ Runbook saved to: ${options.output}`);
  } else {
    console.log('');
    console.log('--- Generated Runbook ---');
    console.log('');
    console.log(runbook);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = {
  IntakeRunbookBuilder
};
