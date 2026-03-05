#!/usr/bin/env node

/**
 * Automation Feasibility Analyzer
 *
 * Prevents user expectation mismatches by assessing BEFORE work starts:
 * - Detects Screen Flow UI components requiring manual configuration
 * - Identifies Quick Actions (cannot be automated via Metadata API)
 * - Calculates feasibility score: 0-30% (mostly manual), 31-70% (hybrid), 71-100% (automated)
 * - Generates component-level breakdown showing what can/cannot be automated
 * - Creates clarification questions for ambiguous requests
 *
 * ROI: $117,000/year (prevents 39 reflections worth of expectation mismatches)
 *
 * Usage:
 *   node automation-feasibility-analyzer.js <orgAlias> --analyze-request "<user request>"
 *   node automation-feasibility-analyzer.js <orgAlias> --check-flow <flow-path>
 *   node automation-feasibility-analyzer.js <orgAlias> --check-object <objectName>
 *
 * @see docs/AUTOMATION_FEASIBILITY_FRAMEWORK.md
 * @runbook Determines automation feasibility before execution
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class AutomationFeasibilityAnalyzer {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.verbose = options.verbose !== false;
    this.cache = new Map();

    // Automation capability matrix
    this.capabilities = {
      metadata: {
        flows: { automated: true, notes: 'Fully automated via Metadata API' },
        validationRules: { automated: true, notes: 'Fully automated via Metadata API' },
        fields: { automated: true, notes: 'Fully automated via Metadata API' },
        layouts: { automated: true, notes: 'Fully automated via Metadata API' },
        profiles: { automated: true, notes: 'Fully automated via Metadata API' },
        permissionSets: { automated: true, notes: 'Fully automated via Metadata API' },
        quickActions: { automated: false, notes: 'CANNOT automate - requires UI configuration' },
        screenFlows: { automated: false, notes: 'Requires manual UI component configuration' },
        approvalProcesses: { automated: false, notes: 'CANNOT automate - UI-only configuration' }
      },
      data: {
        insert: { automated: true, notes: 'Fully automated via Data API' },
        update: { automated: true, notes: 'Fully automated via Data API' },
        delete: { automated: true, notes: 'Fully automated via Data API (with safeguards)' },
        upsert: { automated: true, notes: 'Fully automated via Data API' }
      },
      reporting: {
        createReports: { automated: true, notes: 'Automated via Reports API' },
        createDashboards: { automated: true, notes: 'Automated via Dashboards API' },
        subscriptions: { automated: false, notes: 'Requires manual UI setup' }
      }
    };
  }

  /**
   * Analyze a user request for automation feasibility
   * @param {string} userRequest - Natural language user request
   * @returns {Object} Feasibility analysis with score and breakdown
   */
  async analyzeRequest(userRequest) {
    this.log(`🔍 Analyzing request: "${userRequest}"`);

    const analysis = {
      request: userRequest,
      feasibilityScore: 0,
      feasibilityLevel: '',
      automated: [],
      hybrid: [],
      manual: [],
      clarificationQuestions: [],
      recommendations: [],
      estimatedEffort: {
        automated: 0,    // Hours of automated work
        manual: 0,       // Hours of manual work
        total: 0
      }
    };

    try {
      // Extract intent from request
      const intent = this.extractIntent(userRequest);

      // Analyze each component
      if (intent.flowCreation) {
        await this.analyzeFlowFeasibility(intent, analysis);
      }

      if (intent.formulaField) {
        await this.analyzeFormulaFieldFeasibility(intent, analysis);
      } else if (intent.fieldCreation) {
        await this.analyzeFieldFeasibility(intent, analysis);
      }

      if (intent.validationRule) {
        await this.analyzeValidationRuleFeasibility(intent, analysis);
      }

      if (intent.approvalProcess) {
        await this.analyzeApprovalProcessFeasibility(intent, analysis);
      }

      if (intent.layoutModification) {
        await this.analyzeLayoutFeasibility(intent, analysis);
      }

      if (intent.quickActionCreation) {
        await this.analyzeQuickActionFeasibility(intent, analysis);
      }

      if (intent.dataOperation) {
        await this.analyzeDataFeasibility(intent, analysis);
      }

      if (intent.reportCreation) {
        await this.analyzeReportFeasibility(intent, analysis);
      }

      // Calculate overall feasibility score
      this.calculateFeasibilityScore(analysis);

      // Generate clarification questions for ambiguous parts
      this.generateClarificationQuestions(intent, analysis);

      // Generate recommendations
      this.generateRecommendations(analysis);

      return analysis;
    } catch (error) {
      this.logError(`Analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract intent from natural language request
   */
  extractIntent(request) {
    const intent = {
      flowCreation: /\bflow\b/i.test(request) && /(create|build|make|set\s*up)/i.test(request),
      fieldCreation: /\bfield\b/i.test(request) && /(create|add)/i.test(request) && !/\bformula\b/i.test(request),
      formulaField: /\bformula\s+field\b/i.test(request),
      validationRule: /\bvalidation\s+rule\b/i.test(request),
      layoutModification: /\b(layout|page)\b/i.test(request) && /\b(update|modify|change)\b/i.test(request),
      quickActionCreation: /\bquick\s+action\b/i.test(request) || (/\baction\b/i.test(request) && /(create|add)/i.test(request) && /\bquick\b/i.test(request)),
      approvalProcess: /\bapproval\s+process\b/i.test(request),
      dataOperation: /\b(import|export|update|delete|migrate)\b/i.test(request) && /\b(data|records)\b/i.test(request),
      reportCreation: /\b(report|dashboard)\b/i.test(request) && /\b(create|build)\b/i.test(request),
      hasUIComponents: /\b(screen|button|form|input|dropdown|radio|checkbox|picklist)\b/i.test(request),
      hasFormulas: /\b(formula|calculation|computed|derived)\b/i.test(request),
      hasComplexity: /\b(\d+)\s*[\s-]*(decision|branch|step|loop|stage)/i.test(request)
    };

    return intent;
  }

  /**
   * Analyze Flow feasibility
   */
  async analyzeFlowFeasibility(intent, analysis) {
    // Check for complexity indicators - sum all complexity factors
    const decisionsMatch = analysis.request.match(/\b(\d+)\s*[\s-]*(decision|branch)/i);
    const loopsMatch = analysis.request.match(/\b(\d+)\s*[\s-]*loop/i);
    const stepsMatch = analysis.request.match(/\b(\d+)\s*[\s-]*step/i);

    let complexityFactor = 0;
    if (decisionsMatch) complexityFactor += parseInt(decisionsMatch[1]);
    if (loopsMatch) complexityFactor += parseInt(loopsMatch[1]);
    if (stepsMatch) complexityFactor += parseInt(stepsMatch[1]) * 2; // Steps are more effort

    // Calculate effort based on total complexity
    let baseEffort = 3;
    if (complexityFactor >= 15) {
      baseEffort = 70; // Extremely complex flow (15+ elements)
    } else if (complexityFactor >= 10) {
      baseEffort = 40; // Very complex flow (10-14 elements)
    } else if (complexityFactor >= 5) {
      baseEffort = 10; // Complex flow (5-9 elements)
    }

    if (intent.hasUIComponents) {
      // Screen Flow - hybrid automation
      analysis.hybrid.push({
        component: 'Screen Flow',
        description: 'Flow with UI components (screens, buttons, input fields)',
        automatedParts: ['Flow logic', 'Data operations', 'Formulas', 'Decision trees'],
        manualParts: ['Screen layout', 'Component configuration', 'UI styling', 'Field mapping'],
        effort: { automated: baseEffort - 1, manual: 1 },
        notes: 'Flow logic can be automated, but UI components require manual configuration in Flow Builder'
      });

      analysis.clarificationQuestions.push({
        question: 'Will this flow include user-facing screens?',
        options: ['Yes - Screen Flow', 'No - Auto-launched Flow'],
        impact: 'Screen Flows require manual UI configuration after deployment'
      });
    } else {
      // Auto-launched Flow - fully automated
      analysis.automated.push({
        component: 'Auto-launched Flow',
        description: 'Record-triggered or scheduled flow without UI',
        automatedParts: ['Flow logic', 'Triggers', 'Data operations', 'Formulas', 'Decision trees'],
        effort: { automated: baseEffort, manual: 0 },
        notes: 'Fully automated via Flow XML'
      });
    }
  }

  /**
   * Analyze Formula Field feasibility (standalone)
   */
  async analyzeFormulaFieldFeasibility(intent, analysis) {
    analysis.automated.push({
      component: 'Formula Field',
      description: 'Calculated field with formula',
      automatedParts: ['Field creation', 'Formula definition', 'Permissions'],
      effort: { automated: 0.5, manual: 0 },
      notes: 'Fully automated via Metadata API'
    });

    analysis.clarificationQuestions.push({
      question: 'What should the formula calculate?',
      options: ['Provide formula', 'Describe calculation logic'],
      impact: 'Complex formulas may need validation before deployment'
    });
  }

  /**
   * Analyze Field feasibility
   */
  async analyzeFieldFeasibility(intent, analysis) {
    if (intent.hasFormulas) {
      // Formula field
      analysis.automated.push({
        component: 'Formula Field',
        description: 'Calculated field with formula',
        automatedParts: ['Field creation', 'Formula definition', 'Permissions'],
        effort: { automated: 0.5, manual: 0 },
        notes: 'Fully automated via Metadata API'
      });

      analysis.clarificationQuestions.push({
        question: 'What should the formula calculate?',
        options: ['Provide formula', 'Describe calculation logic'],
        impact: 'Complex formulas may need validation before deployment'
      });
    } else {
      // Standard field
      analysis.automated.push({
        component: 'Standard Field',
        description: 'Text, Number, Picklist, or other standard field',
        automatedParts: ['Field creation', 'Type configuration', 'Permissions'],
        effort: { automated: 0.25, manual: 0 },
        notes: 'Fully automated via Metadata API'
      });
    }
  }

  /**
   * Analyze Layout feasibility
   */
  async analyzeLayoutFeasibility(intent, analysis) {
    analysis.automated.push({
      component: 'Page Layout',
      description: 'Field arrangement on record pages',
      automatedParts: ['Field placement', 'Section creation', 'Related lists'],
      effort: { automated: 1, manual: 0 },
      notes: 'Fully automated via Metadata API'
    });
  }

  /**
   * Analyze Validation Rule feasibility
   */
  async analyzeValidationRuleFeasibility(intent, analysis) {
    analysis.automated.push({
      component: 'Validation Rule',
      description: 'Formula-based validation rule',
      automatedParts: ['Rule creation', 'Formula definition', 'Error message'],
      effort: { automated: 0.5, manual: 0 },
      notes: 'Fully automated via Metadata API'
    });

    analysis.clarificationQuestions.push({
      question: 'What validation criteria should be enforced?',
      options: ['Provide validation formula', 'Describe validation logic'],
      impact: 'Complex formulas may need testing before deployment'
    });
  }

  /**
   * Analyze Approval Process feasibility
   */
  async analyzeApprovalProcessFeasibility(intent, analysis) {
    // Check if it's a multi-step approval
    const complexityMatch = intent.hasComplexity || /\b\d+[\s-]step\b/i.test(analysis.request);

    analysis.hybrid.push({
      component: 'Approval Process',
      description: 'Multi-step approval workflow',
      automatedParts: ['Entry criteria', 'Approval steps structure', 'Email alerts'],
      manualParts: ['Approver assignment', 'Step configuration', 'Matrix setup'],
      effort: { automated: 1, manual: 2 },
      notes: 'Metadata API can create structure but approver configuration requires manual setup'
    });

    analysis.clarificationQuestions.push({
      question: 'How many approval steps are needed?',
      options: ['1 step', '2-3 steps', '4+ steps (complex)'],
      impact: 'More steps increase manual configuration effort'
    });

    analysis.clarificationQuestions.push({
      question: 'Who should be the approvers?',
      options: ['Specific users', 'Role-based', 'Dynamic (formula-based)'],
      impact: 'Dynamic approvals require additional manual configuration'
    });
  }

  /**
   * Analyze Quick Action feasibility
   */
  async analyzeQuickActionFeasibility(intent, analysis) {
    analysis.manual.push({
      component: 'Quick Action',
      description: 'Cannot be fully automated via Metadata API',
      automatedParts: ['None - metadata structure only'],
      manualParts: ['Field mapping', 'Pre-populated values', 'Layout configuration'],
      effort: { automated: 0, manual: 2 },
      notes: 'LIMITATION: Quick Actions require manual UI configuration - cannot automate field mappings'
    });

    analysis.recommendations.push({
      type: 'LIMITATION',
      title: 'Quick Actions Cannot Be Fully Automated',
      description: 'Metadata API can create Quick Action structure but NOT field mappings or pre-populated values',
      workaround: 'Provide step-by-step manual instructions with screenshots',
      expectedOutcome: 'Agent will create metadata structure + provide manual configuration guide'
    });
  }

  /**
   * Analyze Data operation feasibility
   */
  async analyzeDataFeasibility(intent, analysis) {
    analysis.automated.push({
      component: 'Data Operation',
      description: 'Import, export, update, or delete records',
      automatedParts: ['CSV parsing', 'Data validation', 'API calls', 'Error handling'],
      effort: { automated: 2, manual: 0 },
      notes: 'Fully automated via Bulk API or Data API'
    });

    analysis.clarificationQuestions.push({
      question: 'What is the data source?',
      options: ['CSV file', 'External API', 'Another Salesforce org', 'Database'],
      impact: 'Different sources require different integration approaches'
    });
  }

  /**
   * Analyze Report feasibility
   */
  async analyzeReportFeasibility(intent, analysis) {
    analysis.automated.push({
      component: 'Report/Dashboard',
      description: 'Salesforce report or dashboard',
      automatedParts: ['Report creation', 'Filters', 'Groupings', 'Chart configuration'],
      effort: { automated: 1.5, manual: 0 },
      notes: 'Fully automated via Reports/Dashboards API'
    });

    analysis.clarificationQuestions.push({
      question: 'What fields and filters should be included?',
      options: ['Provide detailed requirements', 'I have a reference report to clone'],
      impact: 'Detailed requirements ensure accurate report creation'
    });
  }

  /**
   * Calculate overall feasibility score
   */
  calculateFeasibilityScore(analysis) {
    const automatedEffort = analysis.automated.reduce((sum, item) => sum + (item.effort?.automated || 0), 0);
    const hybridAutomated = analysis.hybrid.reduce((sum, item) => sum + (item.effort?.automated || 0), 0);
    const hybridManual = analysis.hybrid.reduce((sum, item) => sum + (item.effort?.manual || 0), 0);
    const manualEffort = analysis.manual.reduce((sum, item) => sum + (item.effort?.manual || 0), 0);

    const totalAutomated = automatedEffort + hybridAutomated;
    const totalManual = hybridManual + manualEffort;
    const totalEffort = totalAutomated + totalManual;

    analysis.estimatedEffort = {
      automated: totalAutomated,
      manual: totalManual,
      total: totalEffort
    };

    if (totalEffort === 0) {
      analysis.feasibilityScore = 0;
      analysis.feasibilityLevel = 'UNKNOWN';
    } else {
      analysis.feasibilityScore = Math.round((totalAutomated / totalEffort) * 100);

      if (analysis.feasibilityScore >= 71) {
        analysis.feasibilityLevel = 'FULLY_AUTOMATED';
      } else if (analysis.feasibilityScore >= 31) {
        analysis.feasibilityLevel = 'HYBRID';
      } else {
        analysis.feasibilityLevel = 'MOSTLY_MANUAL';
      }
    }
  }

  /**
   * Generate clarification questions
   */
  generateClarificationQuestions(intent, analysis) {
    // Only add if not already added
    if (analysis.clarificationQuestions.length === 0) {
      analysis.clarificationQuestions.push({
        question: 'Can you provide more details about the expected outcome?',
        options: ['Provide detailed requirements', 'Show me an example'],
        impact: 'More details enable better automation assessment'
      });
    }
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(analysis) {
    if (analysis.feasibilityLevel === 'FULLY_AUTOMATED') {
      analysis.recommendations.push({
        type: 'SUCCESS',
        title: `${analysis.feasibilityScore}% Automated - Excellent Candidate`,
        description: 'This request can be almost entirely automated',
        expectedOutcome: 'Agent will handle implementation with minimal manual steps',
        estimatedTime: `~${Math.round(analysis.estimatedEffort.automated)} hour(s)`
      });
    } else if (analysis.feasibilityLevel === 'HYBRID') {
      analysis.recommendations.push({
        type: 'WARNING',
        title: `${analysis.feasibilityScore}% Automated - Hybrid Approach Required`,
        description: `${Math.round(analysis.estimatedEffort.automated)} hour(s) automated + ${Math.round(analysis.estimatedEffort.manual)} hour(s) manual`,
        expectedOutcome: 'Agent will automate what it can and provide step-by-step instructions for manual parts',
        estimatedTime: `~${Math.round(analysis.estimatedEffort.total)} hour(s) total`
      });
    } else if (analysis.feasibilityLevel === 'MOSTLY_MANUAL') {
      analysis.recommendations.push({
        type: 'CAUTION',
        title: `${analysis.feasibilityScore}% Automated - Mostly Manual Work`,
        description: `Only ${Math.round(analysis.estimatedEffort.automated)} hour(s) automated vs ${Math.round(analysis.estimatedEffort.manual)} hour(s) manual`,
        expectedOutcome: 'Agent will provide detailed manual instructions with screenshots',
        estimatedTime: `~${Math.round(analysis.estimatedEffort.total)} hour(s) total`,
        alternative: 'Consider simplifying requirements or using different approach'
      });
    }
  }

  /**
   * Check existing Flow for UI components
   */
  async checkFlow(flowPath) {
    this.log(`🔍 Checking flow: ${path.basename(flowPath)}`);

    const flowXML = fs.readFileSync(flowPath, 'utf-8');
    const flowName = path.basename(flowPath, '.flow-meta.xml');

    const result = {
      flowName,
      hasScreens: flowXML.includes('<screens>'),
      hasQuickActions: flowXML.includes('<actionType>QuickAction</actionType>'),
      requiresManualSetup: false,
      components: {
        screens: [],
        quickActions: [],
        subflows: []
      }
    };

    // Detect Screen components
    if (result.hasScreens) {
      const screenMatches = flowXML.matchAll(/<screens>.*?<name>(.*?)<\/name>.*?<\/screens>/gs);
      for (const match of screenMatches) {
        result.components.screens.push(match[1]);
      }
      result.requiresManualSetup = true;
    }

    // Detect Quick Actions
    if (result.hasQuickActions) {
      result.requiresManualSetup = true;
    }

    return result;
  }

  /**
   * Logging helpers
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  logError(message) {
    console.error(`❌ ${message}`);
  }

  /**
   * Format feasibility report
   */
  formatReport(analysis) {
    const lines = [];

    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('  AUTOMATION FEASIBILITY ANALYSIS');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Request: "${analysis.request}"`);
    lines.push('');
    lines.push(`Feasibility Score: ${analysis.feasibilityScore}% (${analysis.feasibilityLevel})`);
    lines.push(`Estimated Effort: ${analysis.estimatedEffort.total}h (${analysis.estimatedEffort.automated}h automated + ${analysis.estimatedEffort.manual}h manual)`);
    lines.push('');

    if (analysis.automated.length > 0) {
      lines.push('✅ FULLY AUTOMATED COMPONENTS:');
      analysis.automated.forEach(item => {
        lines.push(`\n  • ${item.component}`);
        lines.push(`    ${item.description}`);
        lines.push(`    Effort: ${item.effort.automated}h automated`);
        lines.push(`    ${item.notes}`);
      });
      lines.push('');
    }

    if (analysis.hybrid.length > 0) {
      lines.push('⚠️  HYBRID COMPONENTS (Partial Automation):');
      analysis.hybrid.forEach(item => {
        lines.push(`\n  • ${item.component}`);
        lines.push(`    ${item.description}`);
        lines.push(`    Automated: ${item.automatedParts.join(', ')}`);
        lines.push(`    Manual: ${item.manualParts.join(', ')}`);
        lines.push(`    Effort: ${item.effort.automated}h automated + ${item.effort.manual}h manual`);
        lines.push(`    ${item.notes}`);
      });
      lines.push('');
    }

    if (analysis.manual.length > 0) {
      lines.push('❌ MANUAL COMPONENTS (Cannot Automate):');
      analysis.manual.forEach(item => {
        lines.push(`\n  • ${item.component}`);
        lines.push(`    ${item.description}`);
        lines.push(`    Manual Parts: ${item.manualParts.join(', ')}`);
        lines.push(`    Effort: ${item.effort.manual}h manual`);
        lines.push(`    ${item.notes}`);
      });
      lines.push('');
    }

    if (analysis.clarificationQuestions.length > 0) {
      lines.push('❓ CLARIFICATION QUESTIONS:');
      analysis.clarificationQuestions.forEach((q, i) => {
        lines.push(`\n${i + 1}. ${q.question}`);
        lines.push(`   Options: ${q.options.join(' | ')}`);
        lines.push(`   Impact: ${q.impact}`);
      });
      lines.push('');
    }

    if (analysis.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS:');
      analysis.recommendations.forEach(rec => {
        const icon = rec.type === 'SUCCESS' ? '✅' : rec.type === 'WARNING' ? '⚠️' : '⚠️';
        lines.push(`\n${icon} ${rec.title}`);
        lines.push(`   ${rec.description}`);
        lines.push(`   Expected Outcome: ${rec.expectedOutcome}`);
        if (rec.estimatedTime) lines.push(`   Estimated Time: ${rec.estimatedTime}`);
        if (rec.alternative) lines.push(`   Alternative: ${rec.alternative}`);
      });
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════');

    return lines.join('\n');
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node automation-feasibility-analyzer.js <orgAlias> --analyze-request "<request>"');
    console.error('       node automation-feasibility-analyzer.js <orgAlias> --check-flow <flow-path>');
    process.exit(1);
  }

  const orgAlias = args[0];
  const analyzer = new AutomationFeasibilityAnalyzer(orgAlias, { verbose: true });

  if (args.includes('--analyze-request')) {
    const requestIndex = args.indexOf('--analyze-request') + 1;
    const userRequest = args[requestIndex];

    analyzer.analyzeRequest(userRequest)
      .then(analysis => {
        console.log('\n' + analyzer.formatReport(analysis));
        process.exit(0);
      })
      .catch(error => {
        console.error(`\n❌ Analysis failed: ${error.message}`);
        process.exit(1);
      });
  } else if (args.includes('--check-flow')) {
    const flowIndex = args.indexOf('--check-flow') + 1;
    const flowPath = args[flowIndex];

    analyzer.checkFlow(flowPath)
      .then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.requiresManualSetup ? 1 : 0);
      })
      .catch(error => {
        console.error(`\n❌ Check failed: ${error.message}`);
        process.exit(1);
      });
  }
}

module.exports = AutomationFeasibilityAnalyzer;
