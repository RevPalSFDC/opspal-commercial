/**
 * CPQ Admin Onboarding Guide Generator
 *
 * Generates admin-friendly narrative explanations of the Q2C process from technical audit findings.
 *
 * Features:
 * - Translates technical metrics into practical guidance
 * - Stage-by-stage walkthroughs with "What Happens Here" sections
 * - Troubleshooting guides mapped to common complaints
 * - Monitoring priorities based on risk scores
 * - Plain-language technical debt recommendations
 *
 * Usage:
 *   const generator = new CPQAdminGuideGenerator(orgAlias, processExtrapolation, automationData, options);
 *   const guide = await generator.generateGuide();
 *
 * @phase Phase 7: Generate Admin Onboarding Guide (v3.47.1)
 */

const fs = require('fs');
const path = require('path');

class CPQAdminGuideGenerator {
  constructor(orgAlias, processExtrapolation, automationData, options = {}) {
    this.orgAlias = orgAlias;
    this.processExtrapolation = processExtrapolation || {};
    this.automationData = automationData || {};
    this.options = {
      outputDir: options.outputDir || './diagrams',
      verbose: options.verbose || false
    };

    // Extract key data
    this.stages = this.processExtrapolation.stages || [];
    this.stageRisks = this.processExtrapolation.stageRisks || {};
    this.bottlenecks = this.processExtrapolation.bottlenecks || [];
    this.processEfficiency = this.processExtrapolation.processEfficiency || 0;
    this.circularDeps = this.automationData.circularDependencyDetails || [];

    // Extract automation components for detailed analysis
    this.allAutomation = this.automationData.automation || {};
    this.validationRules = this.allAutomation.validationRules || [];
    this.flows = this.allAutomation.flows || [];
  }

  /**
   * Main entry point - generates complete admin onboarding guide
   * @returns {Object} Generated guide metadata
   */
  async generateGuide() {
    if (this.options.verbose) {
      console.log('\n📖 Generating Admin Onboarding Guide...');
    }

    let guide = this._generateHeader();
    guide += this._generateTableOfContents();
    guide += this._generateBigPicture();
    guide += this._generateStageWalkthroughs();
    guide += this._generateCriticalIssues();
    guide += this._generateTroubleshootingGuide();
    guide += this._generateMonitoringPriorities();
    guide += this._generateTechnicalDebt();
    guide += this._generateFooter();

    const guidePath = path.join(this.options.outputDir, 'ADMIN-ONBOARDING-GUIDE.md');
    fs.writeFileSync(guidePath, guide);

    if (this.options.verbose) {
      console.log(`  ✓ Admin guide saved: ${guidePath}`);
    }

    return {
      generated: true,
      path: guidePath,
      sections: 7
    };
  }

  /**
   * Generate guide header
   * @private
   */
  _generateHeader() {
    return `# Quote-to-Cash Process: Admin Onboarding Guide

**Organization**: ${this.orgAlias}
**Generated**: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
**Purpose**: Onboard new Salesforce admins to the Q2C process

---

*This guide explains your Quote-to-Cash process in practical, admin-friendly terms. Use it to understand how the process works, troubleshoot issues, and support your GTM team effectively.*

---

`;
  }

  /**
   * Generate table of contents
   * @private
   */
  _generateTableOfContents() {
    return `## Table of Contents

1. [The Big Picture](#the-big-picture)
2. [Stage-by-Stage Walkthrough](#stage-by-stage-walkthrough)
3. [Critical Issues You Need to Know About](#critical-issues-you-need-to-know-about)
4. [Troubleshooting Guide](#troubleshooting-guide)
5. [Monitoring Priorities](#monitoring-priorities)
6. [Technical Debt to Address](#technical-debt-to-address)

---

`;
  }

  /**
   * Generate "The Big Picture" section
   * @private
   */
  _generateBigPicture() {
    const healthyCount = Object.values(this.stageRisks).filter(r => r.level === 'LOW').length;
    const moderateCount = Object.values(this.stageRisks).filter(r => r.level === 'MEDIUM').length;
    const highCount = Object.values(this.stageRisks).filter(r => r.level === 'HIGH').length;

    const totalComponents = Object.values(this.stageRisks).reduce((sum, r) => sum + r.componentCount, 0);

    return `## The Big Picture

### Your Quote-to-Cash Process Overview

Your Q2C process moves opportunities through **${this.stages.length} key stages**, from initial quote creation to recognizing revenue. Think of it as an assembly line - each stage adds value and transforms the data until you have a closed deal with recognized revenue.

**Overall Health**: ${this.processEfficiency}/100 ${this._getHealthDescription(this.processEfficiency)}

**Process Flow**:
${this.stages.map((s, i) => `${i + 1}. ${s.name}`).join(' → ')}

**Health Summary**:
- 🟢 **Healthy Stages**: ${healthyCount} ${healthyCount === 1 ? 'stage' : 'stages'}
- 🟡 **Moderate Risk**: ${moderateCount} ${moderateCount === 1 ? 'stage' : 'stages'}
- 🔴 **High Risk**: ${highCount} ${highCount === 1 ? 'stage' : 'stages'}

**Automation Complexity**: ${totalComponents} automation components across all stages

${this._getComplexityGuidance(totalComponents)}

---

`;
  }

  /**
   * Generate stage-by-stage walkthroughs
   * @private
   */
  _generateStageWalkthroughs() {
    let content = `## Stage-by-Stage Walkthrough

*Each stage below explains what happens, the technical reality, and what it means for you as an admin.*

---

`;

    this.stages.forEach((stage, index) => {
      const risk = this.stageRisks[stage.id] || {};
      content += this._generateStageSection(stage, risk, index + 1);
    });

    return content;
  }

  /**
   * Generate individual stage section
   * @private
   */
  _generateStageSection(stage, risk, stageNumber) {
    const emoji = risk.level === 'HIGH' ? '🔴' : risk.level === 'MEDIUM' ? '🟡' : '🟢';
    const complexityLabel = risk.componentCount > 75 ? 'High Complexity' :
                           risk.componentCount > 25 ? 'Moderate Complexity' : 'Low Complexity';

    const objectCount = stage.mappedComponents.objects.length;
    const objectList = objectCount > 0 ? stage.mappedComponents.objects.join(', ') : 'N/A';

    return `### Stage ${stageNumber}: ${stage.name} ${emoji} (${complexityLabel})

**What Happens Here:**
- ${stage.description}
${this._generateStageWhatHappens(stage)}

**The Technical Reality:**
- **${objectCount} Core Object${objectCount !== 1 ? 's' : ''}**: ${objectList}
- **${risk.componentCount} Automation Components**: ${this._getAutomationDescription(risk.componentCount)}
${this._generateAutomationBreakdown(stage)}

**What This Means for You:**
${this._generateStageImplications(stage, risk)}

**Field Requirements & Business Rules:**
${this._generateFieldRequirements(stage)}

**Common Issues:**
${this._generateCommonIssues(stage, risk)}

**Your Job:**
${this._generateAdminResponsibilities(stage, risk)}

---

`;
  }

  /**
   * Generate "what happens" details for a stage
   * @private
   */
  _generateStageWhatHappens(stage) {
    const details = [];
    if (stage.mappedComponents.objects.length > 0) {
      details.push(`- Key objects involved: ${stage.mappedComponents.objects.join(', ')}`);
    }
    if (stage.mappedComponents.automation.length > 0) {
      details.push(`- ${stage.mappedComponents.automation.length} automation rules process the data`);
    }
    return details.join('\n');
  }

  /**
   * Generate automation breakdown
   * @private
   */
  _generateAutomationBreakdown(stage) {
    const automation = stage.mappedComponents.automation || [];
    const types = {
      trigger: automation.filter(a => a.type === 'Trigger').length,
      validation: automation.filter(a => a.type === 'ValidationRule').length,
      workflow: automation.filter(a => a.type === 'WorkflowRule').length,
      flow: automation.filter(a => a.type === 'Flow').length
    };

    const parts = [];
    if (types.trigger > 0) parts.push(`${types.trigger} trigger${types.trigger !== 1 ? 's' : ''}`);
    if (types.validation > 0) parts.push(`${types.validation} validation rule${types.validation !== 1 ? 's' : ''}`);
    if (types.workflow > 0) parts.push(`${types.workflow} workflow rule${types.workflow !== 1 ? 's' : ''}`);
    if (types.flow > 0) parts.push(`${types.flow} flow${types.flow !== 1 ? 's' : ''}`);

    if (parts.length === 0) return '';

    return `  - Breakdown: ${parts.join(', ')}\n`;
  }

  /**
   * Generate stage implications
   * @private
   */
  _generateStageImplications(stage, risk) {
    const implications = [];

    if (risk.componentCount > 75) {
      implications.push('- **High automation complexity** - Changes here can have cascading effects. Test carefully in sandbox.');
      implications.push('- **Performance risk** - Slow processing possible due to heavy automation load');
    } else if (risk.componentCount > 25) {
      implications.push('- **Moderate automation** - Well-structured but requires careful testing');
    } else {
      implications.push('- **Light automation** - Simpler stage with fewer moving parts');
    }

    if (risk.level === 'HIGH' || risk.level === 'MEDIUM') {
      implications.push(`- **Risk level: ${risk.level}** - Monitor closely for errors and performance issues`);
    }

    return implications.join('\n');
  }

  /**
   * Generate common issues for a stage
   * @private
   */
  _generateCommonIssues(stage, risk) {
    const issues = [];

    if (risk.componentCount > 75) {
      issues.push('- Slow performance due to automation overhead');
      issues.push('- Governor limit errors (CPU time, DML operations)');
      issues.push('- Difficult to troubleshoot due to complexity');
    } else if (risk.componentCount > 25) {
      issues.push('- Occasional validation rule errors');
      issues.push('- Moderate troubleshooting complexity');
    } else {
      issues.push('- Generally stable with few issues');
      issues.push('- Easy to troubleshoot when problems occur');
    }

    return issues.join('\n');
  }

  /**
   * Generate admin responsibilities for a stage
   * @private
   */
  _generateAdminResponsibilities(stage, risk) {
    const responsibilities = [];

    if (risk.componentCount > 75) {
      responsibilities.push(`- Monitor for governor limit errors in debug logs`);
      responsibilities.push(`- Track processing time during peak usage`);
      responsibilities.push(`- Document automation execution order for troubleshooting`);
    } else if (risk.componentCount > 25) {
      responsibilities.push(`- Review validation rule errors monthly`);
      responsibilities.push(`- Test changes thoroughly before deploying`);
    } else {
      responsibilities.push(`- Monitor for data quality issues`);
      responsibilities.push(`- Keep validation rules up to date`);
    }

    return responsibilities.join('\n');
  }

  /**
   * Generate field requirements and business rules for a stage
   * @private
   */
  _generateFieldRequirements(stage) {
    const requirements = [];
    const stageObjects = stage.mappedComponents.objects;

    // Get validation rules for this stage's objects
    const stageValidationRules = stage.mappedComponents.automation.filter(component =>
      (component.type === 'ValidationRule' || component.Type === 'ValidationRule') &&
      stageObjects.some(obj => component.object && component.object.includes(obj))
    );

    // Get flows for this stage's objects
    const stageFlows = stage.mappedComponents.automation.filter(component =>
      (component.type === 'Flow' || component.Type === 'Flow') &&
      stageObjects.some(obj => component.object && component.object.includes(obj))
    );

    // Group validation rules by object
    const rulesByObject = {};
    stageValidationRules.forEach(rule => {
      const obj = rule.object || 'Unknown';
      if (!rulesByObject[obj]) rulesByObject[obj] = [];
      rulesByObject[obj].push(rule);
    });

    // Generate validation rule section
    if (stageValidationRules.length > 0) {
      requirements.push(`**Data Validation Enforced** (${stageValidationRules.length} rules active):`);

      Object.keys(rulesByObject).forEach(objName => {
        const rules = rulesByObject[objName];
        const shortName = objName.replace('SBQQ__', '').replace('__c', '');
        requirements.push(`- **${shortName}**: ${rules.length} validation rule${rules.length !== 1 ? 's' : ''} enforce data quality`);

        // Show first few rule names as examples
        const exampleRules = rules.slice(0, 3).map(r => `  - ${r.name || r.label}`).join('\n');
        if (exampleRules) requirements.push(exampleRules);
        if (rules.length > 3) requirements.push(`  - ...and ${rules.length - 3} more`);
      });

      requirements.push('');
      requirements.push('*These rules run BEFORE records save. Users will see error messages if validation fails.*');
    } else {
      requirements.push('**⚠️ Limited Data Validation**: Few or no validation rules detected.');
      requirements.push('*Consider adding validation rules to enforce data quality and prevent bad data entry.*');
    }

    requirements.push('');

    // Generate flow dependencies section
    if (stageFlows.length > 0) {
      requirements.push(`**Automated Processes** (${stageFlows.length} flow${stageFlows.length !== 1 ? 's' : ''} active):`);

      stageFlows.slice(0, 5).forEach(flow => {
        const shortName = flow.name || flow.label || 'Unnamed Flow';
        const obj = flow.object ? flow.object.replace('SBQQ__', '').replace('__c', '') : 'Unknown';
        requirements.push(`- **${shortName}** (${obj}): Runs automatically when records change`);
      });

      if (stageFlows.length > 5) {
        requirements.push(`- ...and ${stageFlows.length - 5} more flows`);
      }

      requirements.push('');
      requirements.push('*These flows run AFTER records save. They update related records, send notifications, etc.*');
    }

    // Add guidance if no automation detected
    if (stageValidationRules.length === 0 && stageFlows.length === 0) {
      requirements.push('**Minimal Automation**: This stage has very light automation.');
      requirements.push('*Data quality depends on user diligence and process adherence.*');
    }

    return requirements.length > 0 ? requirements.join('\n') : 'No specific requirements identified.';
  }

  /**
   * Generate critical issues section
   * @private
   */
  _generateCriticalIssues() {
    let content = `## Critical Issues You Need to Know About

`;

    if (this.circularDeps.length > 0) {
      content += `### 🚨 Circular Dependencies (${this.circularDeps.length} Found)

You have automation that can trigger itself infinitely:

`;
      this.circularDeps.forEach((dep, index) => {
        content += `${index + 1}. **${dep.chain[0]} Loop**: ${dep.chain.join(' → ')} → back to ${dep.chain[0]}\n`;
      });

      content += `
**What This Means**: Under certain conditions, these can cause "Maximum CPU time exceeded" errors or "Too many DML operations" errors. Your org hasn't blown up yet, but it's a ticking time bomb.

**Fix Needed**: Implement recursion prevention in these triggers (add a static flag to prevent re-entry).

`;
    }

    if (this.bottlenecks.length > 0) {
      content += `### ⚠️ Process Bottlenecks (${this.bottlenecks.length} Identified)

These stages are slowing down your Q2C process:

`;
      this.bottlenecks.forEach((bottleneck, index) => {
        content += `${index + 1}. **${bottleneck.stage}**: ${bottleneck.issue}\n`;
        content += `   - *Impact*: ${bottleneck.impact}\n`;
        content += `   - *Fix*: ${bottleneck.recommendation}\n\n`;
      });
    }

    if (this.circularDeps.length === 0 && this.bottlenecks.length === 0) {
      content += `✅ **No critical issues detected**

Your Q2C process is technically sound. Continue monitoring for new issues as the process evolves.

`;
    }

    content += `---

`;

    return content;
  }

  /**
   * Generate troubleshooting guide
   * @private
   */
  _generateTroubleshootingGuide() {
    const highRiskStages = this.stages.filter(s => {
      const risk = this.stageRisks[s.id];
      return risk && (risk.level === 'HIGH' || risk.componentCount > 75);
    });

    const moderateRiskStages = this.stages.filter(s => {
      const risk = this.stageRisks[s.id];
      return risk && risk.level === 'MEDIUM' && risk.componentCount <= 75;
    });

    let content = `## Troubleshooting Guide

### When Sales Complains...

`;

    if (highRiskStages.length > 0) {
      content += `**"Quotes/orders are slow"**
→ Check ${highRiskStages.map(s => s.name).join(' or ')} stage (${highRiskStages.map(s => this.stageRisks[s.id].componentCount).join(' or ')} components)
→ Look for governor limit errors in debug logs
→ Check for long-running triggers or workflows

`;
    }

    content += `**"I'm getting validation errors"**
→ Check which stage the user is in
→ Review validation rules for that stage's objects
→ Verify required fields are populated

**"Approvals aren't routing correctly"**
→ Check ${this.stages.find(s => s.id === 'approval')?.name || 'Approval'} stage
→ Review approval automation components
→ Verify approval process entry criteria

**"Data isn't flowing to the next stage"**
→ Check triggers and workflows between stages
→ Look for errors in automation execution
→ Verify record meets criteria to advance

### When Finance Complains...

**"Revenue numbers don't match"**
→ Check ${this.stages.find(s => s.id === 'revenue')?.name || 'Revenue Recognition'} stage
→ Review revenue calculation automation
→ Verify subscription and opportunity line item creation

**"Subscriptions are missing"**
→ Check ${this.stages.find(s => s.id === 'contract')?.name || 'Contract Generation'} stage
→ Review subscription creation logic in triggers
→ Verify quote-to-contract conversion automation

**"Invoicing data is wrong"**
→ Check ${this.stages.find(s => s.id === 'revenue')?.name || 'Revenue Recognition'} stage
→ Review invoice-related automation components
→ Verify opportunity line item calculations

### General Troubleshooting Steps

1. **Identify the stage** where the issue is occurring
2. **Check debug logs** for that stage's automation components
3. **Review recent changes** to automation in that stage
4. **Test in sandbox** before making fixes in production
5. **Document the resolution** for future reference

---

`;

    return content;
  }

  // Helper methods
  _getHealthDescription(efficiency) {
    if (efficiency >= 90) return '(Excellent!)';
    if (efficiency >= 75) return '(Pretty good!)';
    if (efficiency >= 50) return '(Needs attention)';
    return '(Critical - immediate action needed)';
  }

  _getComplexityGuidance(componentCount) {
    if (componentCount > 300) {
      return `**⚠️ High Complexity**: Your process has significant automation. Changes require careful testing and can have unexpected ripple effects.`;
    } else if (componentCount > 150) {
      return `**📊 Moderate Complexity**: Your process is well-automated but manageable. Test changes in sandbox before deploying.`;
    } else {
      return `**✅ Low Complexity**: Your process is straightforward with minimal automation. Easier to maintain and troubleshoot.`;
    }
  }

  _getAutomationDescription(count) {
    if (count > 75) return 'Heavy automation! This is your busiest stage.';
    if (count > 25) return 'Moderate automation';
    return 'Light automation';
  }

  _generateMonitoringPriorities() {
    return `---

## Monitoring Priorities

### High Priority (Check Daily)
- Stages with 75+ automation components
- Stages with MEDIUM or HIGH risk levels
- Circular dependency errors

### Medium Priority (Check Weekly)
- Stages with 25-75 automation components
- Validation rule failures
- Performance degradation

### Low Priority (Check Monthly)
- Stages with <25 automation components
- Data quality issues
- Process efficiency trends

---

`;
  }

  _generateTechnicalDebt() {
    return `## Technical Debt to Address

1. ✅ **Fix circular dependencies** (prevents future outages)
2. ⚠️ **Consolidate triggers** in high-complexity stages (reduce maintenance burden)
3. ⚠️ **Add data quality validation** at stage entry points (prevents bad data propagation)
4. 💡 **Document automation execution order** (improves troubleshooting speed)

---

`;
  }

  _generateFooter() {
    return `**Bottom Line**: You have a functioning Q2C process with ${this.processEfficiency >= 75 ? 'good' : 'moderate'} health. Your main job as admin is keeping these ${Object.values(this.stageRisks).reduce((sum, r) => sum + r.componentCount, 0)}+ automation components running smoothly and understanding how they interconnect when issues arise.

---

*Generated by Salesforce Plugin Q2C Audit Tool v3.47.1*
`;
  }
}

module.exports = CPQAdminGuideGenerator;
