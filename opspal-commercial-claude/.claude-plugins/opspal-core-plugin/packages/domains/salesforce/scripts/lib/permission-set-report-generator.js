#!/usr/bin/env node

/**
 * Permission Set Assessment Report Generator
 *
 * Generates human-readable markdown reports from JSON assessment data.
 * Produces three types of reports:
 * 1. Discovery Report - Overview of all permission sets and initiatives
 * 2. Analysis Report - Detailed overlap and consolidation analysis
 * 3. Migration Plan Report - Step-by-step migration guide
 *
 * Usage:
 *   node permission-set-report-generator.js discovery <discovery.json> <output.md>
 *   node permission-set-report-generator.js analysis <analysis.json> <output.md>
 *   node permission-set-report-generator.js migration <plan.json> <output.md>
 *   node permission-set-report-generator.js all <discovery.json> <analysis.json> <plan.json> <output-dir>
 *
 * @author RevPal Engineering
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Main report generator class
 */
class PermissionSetReportGenerator {
  constructor(options = {}) {
    this.options = {
      includeTimestamp: true,
      includeTableOfContents: true,
      ...options
    };
  }

  /**
   * Generate discovery report from JSON
   */
  generateDiscoveryReport(discoveryData) {
    const lines = [];
    const date = new Date().toISOString().split('T')[0];

    // Header
    lines.push(`# Permission Set Discovery Report`);
    lines.push('');
    lines.push(`**Organization**: ${discoveryData.orgAlias || 'Unknown'}`);
    lines.push(`**Date**: ${date}`);
    lines.push(`**Status**: ${discoveryData.status || 'Complete'}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Executive Summary
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(`This report provides a comprehensive analysis of permission sets in the ${discoveryData.orgAlias} Salesforce organization.`);
    lines.push('');

    const summary = discoveryData.summary || {};
    lines.push('### Key Findings');
    lines.push('');
    lines.push(`- **Total Permission Sets**: ${summary.totalPermissionSets || 0}`);
    lines.push(`  - Custom: ${summary.customPermissionSets || 0}`);
    lines.push(`  - Managed: ${summary.managedPermissionSets || 0}`);
    lines.push(`- **Initiatives Detected**: ${summary.initiativesDetected || 0}`);
    lines.push(`- **Orphaned Sets**: ${summary.orphanedSets || 0}`);
    lines.push(`- **Total User Assignments**: ${summary.totalAssignments || 0}`);
    lines.push('');

    // Priority Matrix
    if (discoveryData.initiatives && discoveryData.initiatives.length > 0) {
      lines.push('### Fragmentation Priority Matrix');
      lines.push('');

      const highPriority = discoveryData.initiatives.filter(i => i.riskLevel === 'HIGH');
      const mediumPriority = discoveryData.initiatives.filter(i => i.riskLevel === 'MEDIUM');
      const lowPriority = discoveryData.initiatives.filter(i => i.riskLevel === 'LOW');

      lines.push(`🔴 **HIGH Priority** (Score 70+): ${highPriority.length} initiatives`);
      lines.push(`🟡 **MEDIUM Priority** (Score 40-69): ${mediumPriority.length} initiatives`);
      lines.push(`🟢 **LOW Priority** (Score <40): ${lowPriority.length} initiatives`);
      lines.push('');
    }

    // Recommendations
    lines.push('### Top Recommendations');
    lines.push('');
    if (discoveryData.recommendations && discoveryData.recommendations.length > 0) {
      discoveryData.recommendations.slice(0, 3).forEach((rec, idx) => {
        lines.push(`${idx + 1}. **${rec.priority || 'MEDIUM'}**: ${rec.recommendation}`);
      });
    } else {
      lines.push('*No specific recommendations at this time.*');
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // Detailed Findings by Priority
    lines.push('## Detailed Findings');
    lines.push('');

    if (discoveryData.initiatives && discoveryData.initiatives.length > 0) {
      // Sort by fragmentation score descending
      const sortedInitiatives = [...discoveryData.initiatives].sort((a, b) =>
        (b.fragmentationScore || 0) - (a.fragmentationScore || 0)
      );

      ['HIGH', 'MEDIUM', 'LOW'].forEach(riskLevel => {
        const initiatives = sortedInitiatives.filter(i => i.riskLevel === riskLevel);

        if (initiatives.length > 0) {
          const emoji = riskLevel === 'HIGH' ? '🔴' : riskLevel === 'MEDIUM' ? '🟡' : '🟢';
          lines.push(`### ${emoji} ${riskLevel} Priority Initiatives`);
          lines.push('');

          initiatives.forEach((initiative, idx) => {
            lines.push(`#### ${idx + 1}. ${initiative.initiativeName}`);
            lines.push('');
            lines.push(`**Fragmentation Score**: ${initiative.fragmentationScore}/100`);
            lines.push('');
            lines.push('**Details**:');
            lines.push(`- Permission Sets: ${initiative.permissionSets.length}`);
            lines.push(`- Total Assignments: ${initiative.totalAssignments || 0}`);
            lines.push(`- Active Users: ${initiative.activeUsers || 0}`);
            lines.push('');

            lines.push('**Permission Sets**:');
            initiative.permissionSets.forEach(ps => {
              lines.push(`- \`${ps.name}\` (${ps.assignmentCount || 0} assignments)`);
            });
            lines.push('');

            lines.push('**Fragmentation Indicators**:');
            const indicators = initiative.fragmentationIndicators || {};
            if (indicators.multiplePhases) {
              lines.push(`- ⚠️ Multiple phases detected (${indicators.phaseCount} phases)`);
            }
            if (indicators.inconsistentNaming) {
              lines.push('- ⚠️ Inconsistent naming patterns');
            }
            if (indicators.highUserCount) {
              lines.push(`- ⚠️ High user count (${initiative.totalAssignments}+ users)`);
            }
            if (indicators.excessSets) {
              lines.push(`- ⚠️ Excess permission sets (${initiative.permissionSets.length} sets, ideal is 2)`);
            }
            lines.push('');

            if (initiative.consolidationOpportunity) {
              lines.push('**Consolidation Opportunity**:');
              lines.push(`- Target: ${initiative.consolidationOpportunity.targetSetCount || 2} permission sets (Users + Admin)`);
              lines.push(`- Estimated Reduction: ${initiative.consolidationOpportunity.reductionPercentage || 'N/A'}%`);
              lines.push(`- Complexity: ${initiative.consolidationOpportunity.complexity || 'Medium'}`);
              lines.push('');
            }
          });
        }
      });
    }

    // Orphaned Permission Sets
    if (discoveryData.orphanedSets && discoveryData.orphanedSets.length > 0) {
      lines.push('### Orphaned Permission Sets');
      lines.push('');
      lines.push('These permission sets do not belong to any detected initiative:');
      lines.push('');
      discoveryData.orphanedSets.forEach(ps => {
        lines.push(`- \`${ps.name}\` (${ps.assignmentCount || 0} assignments)`);
        if (ps.description) {
          lines.push(`  - Description: ${ps.description}`);
        }
      });
      lines.push('');
    }

    // Managed Packages
    if (discoveryData.managedPackageSets && discoveryData.managedPackageSets.length > 0) {
      lines.push('### Managed Package Permission Sets');
      lines.push('');
      lines.push('*These are read-only and managed by packages:*');
      lines.push('');
      const packageGroups = this._groupByNamespace(discoveryData.managedPackageSets);
      Object.keys(packageGroups).forEach(namespace => {
        lines.push(`**${namespace}**: ${packageGroups[namespace].length} permission sets`);
      });
      lines.push('');
    }

    // Next Steps
    lines.push('---');
    lines.push('');
    lines.push('## Next Steps');
    lines.push('');
    lines.push('### Immediate Actions (High Priority)');
    lines.push('');
    const highPriorityInitiatives = (discoveryData.initiatives || []).filter(i => i.riskLevel === 'HIGH');
    if (highPriorityInitiatives.length > 0) {
      lines.push('1. **Analyze High Priority Initiatives**:');
      highPriorityInitiatives.slice(0, 3).forEach(initiative => {
        lines.push(`   - Run analysis for \`${initiative.initiativeName}\``);
        lines.push(`     \`\`\`bash`);
        lines.push(`     node permission-set-analyzer.js --org ${discoveryData.orgAlias} --initiative "${initiative.initiativeName}"`);
        lines.push(`     \`\`\``);
      });
      lines.push('');
    }

    lines.push('2. **Review and Prioritize**:');
    lines.push('   - Share this report with stakeholders');
    lines.push('   - Identify business-critical initiatives');
    lines.push('   - Schedule consolidation planning sessions');
    lines.push('');

    lines.push('### Medium-Term Actions');
    lines.push('');
    lines.push('1. Analyze medium priority initiatives');
    lines.push('2. Create migration plans for approved consolidations');
    lines.push('3. Test in sandbox environment');
    lines.push('4. Schedule production migrations');
    lines.push('');

    // Appendix
    lines.push('---');
    lines.push('');
    lines.push('## Appendix');
    lines.push('');
    lines.push('### Fragmentation Score Methodology');
    lines.push('');
    lines.push('Fragmentation scores range from 0-100 based on:');
    lines.push('- **Permission Set Count** (40 points): Penalty for sets beyond ideal 2-set model');
    lines.push('- **Naming Patterns** (20 points): Phased/versioned naming indicates fragmentation');
    lines.push('- **User Distribution** (25 points): High user counts increase migration complexity');
    lines.push('- **Assignment Patterns** (15 points): Inconsistent assignment patterns');
    lines.push('');
    lines.push('**Score Interpretation**:');
    lines.push('- **70-100**: HIGH - Immediate consolidation recommended');
    lines.push('- **40-69**: MEDIUM - Plan consolidation within quarter');
    lines.push('- **0-39**: LOW - Monitor, consolidate when convenient');
    lines.push('');

    lines.push('### Generated By');
    lines.push('');
    lines.push('Permission Set Assessment Wizard v1.0.0');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate analysis report from JSON
   */
  generateAnalysisReport(analysisData) {
    const lines = [];
    const date = new Date().toISOString().split('T')[0];

    // Header
    lines.push(`# Permission Set Analysis Report: ${analysisData.initiative}`);
    lines.push('');
    lines.push(`**Organization**: ${analysisData.orgAlias || 'Unknown'}`);
    lines.push(`**Initiative**: ${analysisData.initiative}`);
    lines.push(`**Date**: ${date}`);
    lines.push(`**Status**: ${analysisData.status || 'Complete'}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Executive Summary
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(`This report provides detailed overlap analysis and consolidation recommendations for the **${analysisData.initiative}** initiative.`);
    lines.push('');

    // Current State
    lines.push('### Current State');
    lines.push('');
    if (analysisData.permissionSets && analysisData.permissionSets.length > 0) {
      lines.push(`**Permission Sets** (${analysisData.permissionSets.length} total):`);
      analysisData.permissionSets.forEach(ps => {
        lines.push(`- \`${ps.name}\` (${ps.assignmentCount || 0} assignments, ${ps.tier || 'unknown'} tier)`);
        if (ps.description) {
          lines.push(`  - ${ps.description}`);
        }
      });
      lines.push('');
    }

    const metrics = analysisData.metrics || {};
    lines.push('**Key Metrics**:');
    lines.push(`- Fragmentation Score: ${metrics.fragmentationScore || 0}/100 (${analysisData.riskLevel || 'UNKNOWN'})`);
    lines.push(`- Average Overlap: ${metrics.averageOverlap || 0}%`);
    lines.push(`- Total Users: ${metrics.totalUsers || 0}`);
    lines.push(`- Active Users: ${metrics.activeUsers || 0}`);
    lines.push('');

    // Overlap Analysis
    if (analysisData.overlapAnalysis) {
      lines.push('---');
      lines.push('');
      lines.push('## Overlap Analysis');
      lines.push('');

      lines.push('### Pairwise Overlap Matrix');
      lines.push('');
      lines.push('*Percentage of overlapping permissions between permission sets:*');
      lines.push('');

      if (analysisData.overlapAnalysis.pairwiseOverlap && analysisData.overlapAnalysis.pairwiseOverlap.length > 0) {
        const overlaps = analysisData.overlapAnalysis.pairwiseOverlap
          .sort((a, b) => b.overlapPercentage - a.overlapPercentage);

        overlaps.forEach(overlap => {
          const emoji = overlap.overlapPercentage >= 70 ? '🔴' : overlap.overlapPercentage >= 40 ? '🟡' : '🟢';
          lines.push(`${emoji} **${overlap.set1} ↔ ${overlap.set2}**: ${overlap.overlapPercentage}% overlap`);
          lines.push(`   - Common field permissions: ${overlap.commonFieldPermissions || 0}`);
          lines.push(`   - Common object permissions: ${overlap.commonObjectPermissions || 0}`);
          lines.push('');
        });
      }

      lines.push('### Top Overlapping Permissions');
      lines.push('');
      if (analysisData.overlapAnalysis.topOverlappingPermissions && analysisData.overlapAnalysis.topOverlappingPermissions.length > 0) {
        lines.push('*Permissions that appear in multiple permission sets:*');
        lines.push('');
        analysisData.overlapAnalysis.topOverlappingPermissions.slice(0, 10).forEach(perm => {
          lines.push(`- **${perm.permission}**: Present in ${perm.setCount}/${analysisData.permissionSets.length} sets`);
          lines.push(`  - Sets: ${perm.sets.join(', ')}`);
        });
        lines.push('');
      }
    }

    // Consolidation Opportunities
    if (analysisData.consolidationOpportunities && analysisData.consolidationOpportunities.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Consolidation Opportunities');
      lines.push('');

      analysisData.consolidationOpportunities.forEach((opp, idx) => {
        const confidenceBadge = opp.confidence === 'HIGH' ? '✅' : opp.confidence === 'MEDIUM' ? '⚠️' : '❓';
        lines.push(`### ${idx + 1}. ${confidenceBadge} ${opp.title || 'Consolidation Opportunity'}`);
        lines.push('');
        lines.push(`**Confidence**: ${opp.confidence}`);
        lines.push(`**Type**: ${opp.type || 'Merge'}`);
        lines.push('');
        lines.push('**Description**:');
        lines.push(opp.description || 'No description provided');
        lines.push('');

        if (opp.sourceSets && opp.sourceSets.length > 0) {
          lines.push('**Source Permission Sets**:');
          opp.sourceSets.forEach(set => {
            lines.push(`- \`${set}\``);
          });
          lines.push('');
        }

        lines.push(`**Target**: \`${opp.targetSet || 'New canonical set'}\``);
        lines.push('');

        if (opp.benefits && opp.benefits.length > 0) {
          lines.push('**Benefits**:');
          opp.benefits.forEach(benefit => {
            lines.push(`- ${benefit}`);
          });
          lines.push('');
        }

        if (opp.considerations && opp.considerations.length > 0) {
          lines.push('**Considerations**:');
          opp.considerations.forEach(consideration => {
            lines.push(`- ${consideration}`);
          });
          lines.push('');
        }
      });
    }

    // Risk Assessment
    if (analysisData.riskAssessment) {
      lines.push('---');
      lines.push('');
      lines.push('## Risk Assessment');
      lines.push('');

      const risk = analysisData.riskAssessment;
      lines.push(`**Overall Risk Level**: ${risk.level || 'UNKNOWN'}`);
      lines.push(`**Risk Score**: ${risk.score || 0}/100`);
      lines.push('');

      if (risk.factors && risk.factors.length > 0) {
        lines.push('### Risk Factors');
        lines.push('');
        risk.factors.forEach(factor => {
          const impact = factor.impact === 'HIGH' ? '🔴' : factor.impact === 'MEDIUM' ? '🟡' : '🟢';
          lines.push(`${impact} **${factor.factor}**: ${factor.description}`);
          lines.push(`   - Impact: ${factor.impact}`);
          if (factor.score) {
            lines.push(`   - Score: ${factor.score}/100`);
          }
          lines.push('');
        });
      }

      if (risk.mitigations && risk.mitigations.length > 0) {
        lines.push('### Risk Mitigations');
        lines.push('');
        risk.mitigations.forEach((mitigation, idx) => {
          lines.push(`${idx + 1}. **${mitigation.risk}**: ${mitigation.mitigation}`);
        });
        lines.push('');
      }
    }

    // Recommendations
    if (analysisData.recommendations && analysisData.recommendations.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Recommendations');
      lines.push('');

      ['HIGH', 'MEDIUM', 'LOW'].forEach(priority => {
        const recs = analysisData.recommendations.filter(r => r.priority === priority);
        if (recs.length > 0) {
          const emoji = priority === 'HIGH' ? '🔴' : priority === 'MEDIUM' ? '🟡' : '🟢';
          lines.push(`### ${emoji} ${priority} Priority`);
          lines.push('');
          recs.forEach((rec, idx) => {
            lines.push(`${idx + 1}. ${rec.recommendation}`);
            if (rec.rationale) {
              lines.push(`   - *Rationale: ${rec.rationale}*`);
            }
            if (rec.estimatedEffort) {
              lines.push(`   - *Effort: ${rec.estimatedEffort}*`);
            }
          });
          lines.push('');
        }
      });
    }

    // Effort Estimation
    if (analysisData.effortEstimation) {
      lines.push('---');
      lines.push('');
      lines.push('## Effort Estimation');
      lines.push('');

      const effort = analysisData.effortEstimation;
      lines.push(`**Total Effort**: ${effort.totalTime || 'Unknown'}`);
      lines.push('');

      if (effort.breakdown) {
        lines.push('### Breakdown');
        lines.push('');
        Object.keys(effort.breakdown).forEach(phase => {
          lines.push(`- **${phase}**: ${effort.breakdown[phase]}`);
        });
        lines.push('');
      }

      if (effort.activeTime && effort.gracePeriod) {
        lines.push('**Timeline**:');
        lines.push(`- Active Implementation: ${effort.activeTime}`);
        lines.push(`- Grace Period: ${effort.gracePeriod}`);
        lines.push(`- Total Duration: ${effort.totalTime}`);
        lines.push('');
      }
    }

    // Next Steps
    lines.push('---');
    lines.push('');
    lines.push('## Next Steps');
    lines.push('');
    lines.push('### 1. Review and Approve');
    lines.push('- Share this analysis with stakeholders');
    lines.push('- Get approval for consolidation approach');
    lines.push('- Schedule planning session');
    lines.push('');
    lines.push('### 2. Generate Migration Plan');
    lines.push('```bash');
    lines.push(`node permission-set-migration-planner.js --org ${analysisData.orgAlias} --initiative "${analysisData.initiative}"`);
    lines.push('```');
    lines.push('');
    lines.push('### 3. Test in Sandbox');
    lines.push('- Execute migration plan in sandbox first');
    lines.push('- Validate user access');
    lines.push('- Document any issues');
    lines.push('');
    lines.push('### 4. Production Execution');
    lines.push('- Schedule maintenance window');
    lines.push('- Execute migration plan');
    lines.push('- Monitor during grace period');
    lines.push('');

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('### Generated By');
    lines.push('');
    lines.push('Permission Set Assessment Wizard v1.0.0');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate migration plan report from JSON
   */
  generateMigrationPlanReport(planData) {
    const lines = [];
    const date = new Date().toISOString().split('T')[0];

    // Header
    lines.push(`# Permission Set Migration Plan: ${planData.initiative}`);
    lines.push('');
    lines.push(`**Organization**: ${planData.orgAlias || 'Unknown'}`);
    lines.push(`**Initiative**: ${planData.initiative}`);
    lines.push(`**Plan ID**: ${planData.planId}`);
    lines.push(`**Status**: ${planData.status || 'PENDING_APPROVAL'}`);
    lines.push(`**Date**: ${date}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Executive Summary
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(`This migration plan consolidates fragmented permission sets for the **${planData.initiative}** initiative into a centralized two-tier architecture.`);
    lines.push('');

    // Current vs Target State
    lines.push('### Current State → Target State');
    lines.push('');
    if (planData.currentState && planData.currentState.permissionSets) {
      lines.push('**Current Permission Sets**:');
      planData.currentState.permissionSets.forEach(ps => {
        lines.push(`- \`${ps.name}\` (${ps.assignmentCount || 0} assignments)`);
      });
      lines.push('');
    }

    if (planData.targetState && planData.targetState.permissionSets) {
      lines.push('**Target Permission Sets**:');
      planData.targetState.permissionSets.forEach(ps => {
        lines.push(`- \`${ps.name}\` (consolidates ${ps.sourceCount || 0} sets)`);
        if (ps.description) {
          lines.push(`  - ${ps.description}`);
        }
      });
      lines.push('');
    }

    // Key Metrics
    if (planData.metrics) {
      lines.push('**Consolidation Metrics**:');
      const metrics = planData.metrics;
      lines.push(`- Sets Before: ${metrics.setsBefore || 0}`);
      lines.push(`- Sets After: ${metrics.setsAfter || 0}`);
      lines.push(`- Reduction: ${metrics.reduction || 0}%`);
      lines.push(`- Users Affected: ${metrics.usersAffected || 0}`);
      lines.push('');
    }

    // Timeline
    if (planData.timeline) {
      lines.push('**Timeline**:');
      lines.push(`- Active Implementation: ${planData.timeline.activeTime || 'Unknown'}`);
      lines.push(`- Grace Period: ${planData.timeline.gracePeriod || '30 days'}`);
      lines.push(`- Total Duration: ${planData.timeline.totalDuration || 'Unknown'}`);
      lines.push('');
    }

    // Migration Steps
    if (planData.migrationSteps && planData.migrationSteps.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Migration Steps');
      lines.push('');
      lines.push(`This migration consists of **${planData.migrationSteps.length} steps** executed in sequence.`);
      lines.push('');

      planData.migrationSteps.forEach((step, idx) => {
        const criticalBadge = step.critical ? '🔴 **CRITICAL**' : '🟡';
        lines.push(`### Step ${step.step}: ${step.action}`);
        lines.push('');
        lines.push(`${criticalBadge} | Phase: \`${step.phase}\` | Estimated Time: ${step.estimatedTime}`);
        lines.push('');

        if (step.description) {
          lines.push('**Description**:');
          lines.push(step.description);
          lines.push('');
        }

        if (step.command) {
          lines.push('**Command**:');
          lines.push('```bash');
          lines.push(step.command);
          lines.push('```');
          lines.push('');
        }

        if (step.dependencies && step.dependencies.length > 0) {
          lines.push('**Dependencies**:');
          step.dependencies.forEach(dep => {
            lines.push(`- Must complete Step ${dep} first`);
          });
          lines.push('');
        }

        if (step.validations && step.validations.length > 0) {
          lines.push('**Validation Checks**:');
          step.validations.forEach(validation => {
            lines.push(`- ✓ ${validation}`);
          });
          lines.push('');
        }

        if (step.notes) {
          lines.push('**Notes**:');
          lines.push(step.notes);
          lines.push('');
        }
      });
    }

    // Rollback Plan
    if (planData.rollbackPlan) {
      lines.push('---');
      lines.push('');
      lines.push('## Rollback Plan');
      lines.push('');
      lines.push('In case of issues, follow these steps to restore the original state:');
      lines.push('');

      const rollback = planData.rollbackPlan;
      lines.push(`**Estimated Rollback Time**: ${rollback.estimatedTime || '15-20 minutes'}`);
      lines.push('');

      if (rollback.steps && rollback.steps.length > 0) {
        rollback.steps.forEach((step, idx) => {
          lines.push(`### Rollback Step ${idx + 1}: ${step.action}`);
          lines.push('');
          if (step.command) {
            lines.push('```bash');
            lines.push(step.command);
            lines.push('```');
            lines.push('');
          }
          if (step.description) {
            lines.push(step.description);
            lines.push('');
          }
        });
      }

      if (rollback.backupLocation) {
        lines.push('**Backup Location**:');
        lines.push(`\`${rollback.backupLocation}\``);
        lines.push('');
      }
    }

    // Validation Checks
    if (planData.validationChecks && planData.validationChecks.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Validation Checks');
      lines.push('');
      lines.push('After migration, verify the following:');
      lines.push('');

      planData.validationChecks.forEach((check, idx) => {
        lines.push(`${idx + 1}. **${check.check}**`);
        if (check.command) {
          lines.push('   ```bash');
          lines.push(`   ${check.command}`);
          lines.push('   ```');
        }
        if (check.expectedResult) {
          lines.push(`   - Expected: ${check.expectedResult}`);
        }
        lines.push('');
      });
    }

    // Risk Assessment
    if (planData.riskAssessment) {
      lines.push('---');
      lines.push('');
      lines.push('## Risk Assessment');
      lines.push('');

      const risk = planData.riskAssessment;
      lines.push(`**Overall Risk Level**: ${risk.level || 'MEDIUM'}`);
      lines.push('');

      if (risk.risks && risk.risks.length > 0) {
        lines.push('### Identified Risks');
        lines.push('');
        risk.risks.forEach(r => {
          const emoji = r.severity === 'HIGH' ? '🔴' : r.severity === 'MEDIUM' ? '🟡' : '🟢';
          lines.push(`${emoji} **${r.risk}**`);
          lines.push(`   - Severity: ${r.severity}`);
          lines.push(`   - Mitigation: ${r.mitigation}`);
          lines.push('');
        });
      }
    }

    // Execution Checklist
    lines.push('---');
    lines.push('');
    lines.push('## Pre-Execution Checklist');
    lines.push('');
    lines.push('Before executing this migration plan, verify:');
    lines.push('');
    lines.push('- [ ] Plan reviewed and approved by stakeholders');
    lines.push('- [ ] Security/compliance team sign-off obtained');
    lines.push('- [ ] Tested successfully in sandbox environment');
    lines.push('- [ ] Backup location verified and accessible');
    lines.push('- [ ] Rollback plan tested and understood');
    lines.push('- [ ] Communication sent to affected users');
    lines.push('- [ ] Maintenance window scheduled (if applicable)');
    lines.push('- [ ] Team on standby to monitor during grace period');
    lines.push('');

    // Execution Instructions
    lines.push('---');
    lines.push('');
    lines.push('## Execution Instructions');
    lines.push('');
    lines.push('### Option 1: CLI Execution');
    lines.push('');
    lines.push('Execute the entire migration plan:');
    lines.push('');
    lines.push('```bash');
    lines.push(`node permission-set-cli.js --execute-migration ${planData.planId}.json --org ${planData.orgAlias}`);
    lines.push('```');
    lines.push('');
    lines.push('Dry-run first (recommended):');
    lines.push('');
    lines.push('```bash');
    lines.push(`node permission-set-cli.js --execute-migration ${planData.planId}.json --org ${planData.orgAlias} --dry-run`);
    lines.push('```');
    lines.push('');

    lines.push('### Option 2: Interactive Agent');
    lines.push('');
    lines.push('Use the assessment wizard agent:');
    lines.push('');
    lines.push('```');
    lines.push(`/assess-permissions ${planData.initiative}`);
    lines.push('```');
    lines.push('');
    lines.push('Then select: Execute migration plan');
    lines.push('');

    // Post-Migration
    lines.push('---');
    lines.push('');
    lines.push('## Post-Migration Monitoring');
    lines.push('');
    lines.push('### Grace Period (30 days)');
    lines.push('');
    lines.push('During the grace period:');
    lines.push('1. Monitor for user access issues');
    lines.push('2. Run validation checks weekly');
    lines.push('3. Keep rollback plan ready');
    lines.push('4. Document any issues or edge cases');
    lines.push('');
    lines.push('### After Grace Period');
    lines.push('');
    lines.push('Once grace period completes successfully:');
    lines.push('1. Deactivate old permission sets (do NOT delete immediately)');
    lines.push('2. Keep backups for additional 30 days');
    lines.push('3. Update documentation');
    lines.push('4. Archive migration records');
    lines.push('');

    // Contact Information
    lines.push('---');
    lines.push('');
    lines.push('## Support');
    lines.push('');
    lines.push('**Questions or Issues?**');
    lines.push('');
    lines.push('- Review documentation: `docs/PERMISSION_SET_USER_GUIDE.md`');
    lines.push('- Check rollback plan if issues arise');
    lines.push('- Contact: RevPal Engineering');
    lines.push('');

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('### Generated By');
    lines.push('');
    lines.push('Permission Set Assessment Wizard v1.0.0');
    lines.push(`Plan ID: ${planData.planId}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Helper: Group permission sets by namespace
   */
  _groupByNamespace(sets) {
    const groups = {};
    sets.forEach(set => {
      const namespace = set.namespacePrefix || 'Unknown';
      if (!groups[namespace]) {
        groups[namespace] = [];
      }
      groups[namespace].push(set);
    });
    return groups;
  }

  /**
   * Generate all reports from assessment data
   */
  generateAllReports(discoveryData, analysisData, planData, outputDir) {
    const reports = {};

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const date = new Date().toISOString().split('T')[0];

    // Discovery report
    if (discoveryData) {
      const discoveryMd = this.generateDiscoveryReport(discoveryData);
      const discoveryPath = path.join(outputDir, `DISCOVERY_REPORT_${date}.md`);
      fs.writeFileSync(discoveryPath, discoveryMd, 'utf-8');
      reports.discovery = discoveryPath;
      console.log(`✓ Discovery report: ${discoveryPath}`);
    }

    // Analysis report
    if (analysisData) {
      const analysisMd = this.generateAnalysisReport(analysisData);
      const initiative = analysisData.initiative.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const analysisPath = path.join(outputDir, `${initiative}_ANALYSIS_${date}.md`);
      fs.writeFileSync(analysisPath, analysisMd, 'utf-8');
      reports.analysis = analysisPath;
      console.log(`✓ Analysis report: ${analysisPath}`);
    }

    // Migration plan report
    if (planData) {
      const planMd = this.generateMigrationPlanReport(planData);
      const initiative = planData.initiative.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const planPath = path.join(outputDir, `${initiative}_MIGRATION_PLAN_${date}.md`);
      fs.writeFileSync(planPath, planMd, 'utf-8');
      reports.plan = planPath;
      console.log(`✓ Migration plan report: ${planPath}`);
    }

    return reports;
  }
}

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Permission Set Assessment Report Generator');
    console.log('');
    console.log('Usage:');
    console.log('  node permission-set-report-generator.js discovery <discovery.json> <output.md>');
    console.log('  node permission-set-report-generator.js analysis <analysis.json> <output.md>');
    console.log('  node permission-set-report-generator.js migration <plan.json> <output.md>');
    console.log('  node permission-set-report-generator.js all <discovery.json> <analysis.json> <plan.json> <output-dir>');
    console.log('');
    console.log('Examples:');
    console.log('  node permission-set-report-generator.js discovery discovery-2025-10-22.json DISCOVERY_REPORT.md');
    console.log('  node permission-set-report-generator.js all discovery.json analysis.json plan.json ./reports/');
    process.exit(0);
  }

  const command = args[0];
  const generator = new PermissionSetReportGenerator();

  try {
    if (command === 'discovery') {
      const inputPath = args[1];
      const outputPath = args[2];
      const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
      const markdown = generator.generateDiscoveryReport(data);
      fs.writeFileSync(outputPath, markdown, 'utf-8');
      console.log(`✓ Discovery report generated: ${outputPath}`);

    } else if (command === 'analysis') {
      const inputPath = args[1];
      const outputPath = args[2];
      const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
      const markdown = generator.generateAnalysisReport(data);
      fs.writeFileSync(outputPath, markdown, 'utf-8');
      console.log(`✓ Analysis report generated: ${outputPath}`);

    } else if (command === 'migration') {
      const inputPath = args[1];
      const outputPath = args[2];
      const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
      const markdown = generator.generateMigrationPlanReport(data);
      fs.writeFileSync(outputPath, markdown, 'utf-8');
      console.log(`✓ Migration plan report generated: ${outputPath}`);

    } else if (command === 'all') {
      const discoveryPath = args[1];
      const analysisPath = args[2];
      const planPath = args[3];
      const outputDir = args[4];

      const discoveryData = discoveryPath && fs.existsSync(discoveryPath)
        ? JSON.parse(fs.readFileSync(discoveryPath, 'utf-8'))
        : null;
      const analysisData = analysisPath && fs.existsSync(analysisPath)
        ? JSON.parse(fs.readFileSync(analysisPath, 'utf-8'))
        : null;
      const planData = planPath && fs.existsSync(planPath)
        ? JSON.parse(fs.readFileSync(planPath, 'utf-8'))
        : null;

      const reports = generator.generateAllReports(discoveryData, analysisData, planData, outputDir);
      console.log('');
      console.log('✓ All reports generated successfully');
      console.log('');
      console.log('Generated files:');
      Object.keys(reports).forEach(type => {
        console.log(`  - ${reports[type]}`);
      });

    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error generating report:', error.message);
    process.exit(1);
  }
}

module.exports = PermissionSetReportGenerator;
