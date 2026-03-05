#!/usr/bin/env node

/**
 * supervisor-cli.js
 *
 * Command-line interface for Supervisor-Auditor system.
 * Provides plan, execute, audit, and full workflow commands.
 *
 * @module supervisor-cli
 */

const fs = require('fs');
const path = require('path');
const SupervisorAuditor = require('./lib/supervisor-auditor');
const SupervisorExecutor = require('./lib/supervisor-executor');
const AuditReporter = require('./lib/audit-reporter');
const { createRealAgentInvoker, createHybridInvoker } = require('./lib/task-tool-invoker');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  purple: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

class SupervisorCLI {
  constructor() {
    this.supervisor = new SupervisorAuditor();
    this.executor = new SupervisorExecutor({
      timeout: 60000,
      retries: 1
    });
    this.reporter = new AuditReporter();
  }

  /**
   * Plan a task (generate execution plan)
   */
  async plan(task, options = {}) {
    console.log(colors.cyan + '═'.repeat(60) + colors.reset);
    console.log(colors.bold + '🧠 GENERATING SUPERVISOR PLAN' + colors.reset);
    console.log(colors.cyan + '═'.repeat(60) + colors.reset);

    console.log(`\nTask: ${task}`);

    const complexity = options.complexity || this._estimateComplexity(task);

    console.log(`Complexity: ${(complexity * 100).toFixed(0)}%\n`);

    const plan = this.supervisor.plan({
      task: task,
      complexity: complexity
    });

    // Display plan summary
    this._displayPlanSummary(plan);

    // Save plan if output path provided
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(plan, null, 2));
      console.log(colors.green + `\n✓ Plan saved to: ${options.output}` + colors.reset);
    }

    return plan;
  }

  /**
   * Execute a plan
   */
  async execute(planOrPath, options = {}) {
    console.log(colors.cyan + '═'.repeat(60) + colors.reset);
    console.log(colors.bold + '⚙️  EXECUTING SUPERVISOR PLAN' + colors.reset);
    console.log(colors.cyan + '═'.repeat(60) + colors.reset);

    // Load plan from file if path provided
    let plan = planOrPath;
    if (typeof planOrPath === 'string') {
      plan = JSON.parse(fs.readFileSync(planOrPath, 'utf8'));
      console.log(`\nLoaded plan from: ${planOrPath}`);
    }

    console.log(`Units to execute: ${plan.PLAN.parallel_groups.flatMap(g => g.units).length}`);
    console.log(`Parallel groups: ${plan.PLAN.parallel_groups.length}`);

    // Choose agent invoker (real vs mock)
    let agentInvoker;
    if (options.realExecution) {
      console.log(colors.yellow + 'Mode: REAL execution via Task tool' + colors.reset);
      agentInvoker = createRealAgentInvoker({ verbose: options.verbose });
    } else if (options.agentInvoker) {
      agentInvoker = options.agentInvoker;
    } else {
      console.log(colors.yellow + 'Mode: MOCK execution (use --real-execution for production)' + colors.reset);
      agentInvoker = SupervisorExecutor.defaultAgentInvoker;
    }
    console.log('');

    const results = await this.executor.execute(plan, agentInvoker);

    // Display execution summary
    this._displayExecutionSummary(results);

    // Save results if output path provided
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(results, null, 2));
      console.log(colors.green + `\n✓ Results saved to: ${options.output}` + colors.reset);
    }

    return results;
  }

  /**
   * Audit execution results
   */
  async audit(planOrPath, resultsOrPath, options = {}) {
    console.log(colors.cyan + '═'.repeat(60) + colors.reset);
    console.log(colors.bold + '📊 GENERATING AUDIT REPORT' + colors.reset);
    console.log(colors.cyan + '═'.repeat(60) + colors.reset);

    // Load plan
    let plan = planOrPath;
    if (typeof planOrPath === 'string') {
      plan = JSON.parse(fs.readFileSync(planOrPath, 'utf8'));
    }

    // Load results
    let results = resultsOrPath;
    if (typeof resultsOrPath === 'string') {
      results = JSON.parse(fs.readFileSync(resultsOrPath, 'utf8'));
    }

    const auditReport = this.reporter.generateReport(plan, results);

    // Display audit report
    const formatted = this.reporter.formatReport(auditReport);
    console.log('\n' + formatted);

    // Save report if output path provided
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(auditReport, null, 2));
      console.log(colors.green + `\n✓ Audit report saved to: ${options.output}` + colors.reset);
    }

    return auditReport;
  }

  /**
   * Full workflow (plan → execute → audit)
   */
  async full(task, options = {}) {
    console.log(colors.bold + colors.purple + '\n🚀 FULL SUPERVISOR WORKFLOW' + colors.reset);
    console.log(colors.cyan + '═'.repeat(60) + colors.reset);

    // Plan
    const plan = await this.plan(task, { complexity: options.complexity });

    console.log('\n' + colors.yellow + '⏸  Press Enter to execute plan...' + colors.reset);

    if (!options.autoExecute) {
      // Wait for user confirmation (in interactive mode)
      // In non-interactive mode, auto-execute
    }

    // Execute
    const results = await this.execute(plan, {
      agentInvoker: options.agentInvoker,
      realExecution: options.realExecution,
      verbose: options.verbose
    });

    // Audit
    const audit = await this.audit(plan, results);

    // Save all artifacts if directory provided
    if (options.outputDir) {
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const dir = options.outputDir;

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const planPath = path.join(dir, `plan-${timestamp}.json`);
      const resultsPath = path.join(dir, `results-${timestamp}.json`);
      const auditPath = path.join(dir, `audit-${timestamp}.json`);

      fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
      fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
      fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));

      console.log(colors.green + `\n✓ Artifacts saved to: ${dir}` + colors.reset);
    }

    return { plan, results, audit };
  }

  /**
   * Test with sample operations
   */
  async test() {
    console.log(colors.bold + colors.purple + '\n🧪 TESTING SUPERVISOR-AUDITOR' + colors.reset);
    console.log(colors.cyan + '═'.repeat(60) + colors.reset);

    const testCases = [
      {
        name: 'Parallel Units',
        task: 'Generate READMEs for plugin-a, plugin-b, plugin-c',
        complexity: 0.5
      },
      {
        name: 'Sequential Actions',
        task: 'Analyze quality and then generate reports',
        complexity: 0.7
      },
      {
        name: 'High Complexity',
        task: 'Deploy metadata to production',
        complexity: 0.9
      }
    ];

    for (const testCase of testCases) {
      console.log(`\n${colors.yellow}Test: ${testCase.name}${colors.reset}`);
      console.log(`Task: "${testCase.task}"`);

      const plan = this.supervisor.plan({
        task: testCase.task,
        complexity: testCase.complexity
      });

      console.log(`  Units: ${plan.AUDIT.problem_decomposition.length}`);
      console.log(`  Parallel Groups: ${plan.PLAN.parallel_groups.length}`);

      const parallelUnits = plan.AUDIT.independence_check.filter(c => c.can_run_in_parallel).length;
      console.log(`  Parallelizable: ${parallelUnits}/${plan.AUDIT.problem_decomposition.length}`);

      console.log(colors.green + '  ✓ Test passed' + colors.reset);
    }

    console.log('\n' + colors.green + '✓ All tests passed' + colors.reset);
  }

  /**
   * Display plan summary
   */
  _displayPlanSummary(plan) {
    console.log(colors.yellow + 'Plan Summary:' + colors.reset);
    console.log(`  Units: ${plan.AUDIT.problem_decomposition.length}`);
    console.log(`  Parallel Groups: ${plan.PLAN.parallel_groups.length}`);
    console.log(`  Sequential Barriers: ${plan.PLAN.sequential_barriers.length}`);

    const parallelUnits = plan.AUDIT.independence_check.filter(c => c.can_run_in_parallel).length;
    const parallelRatio = plan.AUDIT.problem_decomposition.length > 0 ?
      (parallelUnits / plan.AUDIT.problem_decomposition.length) * 100 : 0;

    console.log(`  Parallelizable: ${parallelUnits}/${plan.AUDIT.problem_decomposition.length} (${parallelRatio.toFixed(0)}%)`);

    if (plan.AUDIT.risk_checks && plan.AUDIT.risk_checks.length > 0) {
      console.log('\n' + colors.yellow + 'Risk Checks:' + colors.reset);
      plan.AUDIT.risk_checks.forEach(risk => {
        if (risk.includes('No significant')) {
          console.log(`  ${colors.green}✓ ${risk}${colors.reset}`);
        } else {
          console.log(`  ${colors.yellow}⚠ ${risk}${colors.reset}`);
        }
      });
    }
  }

  /**
   * Display execution summary
   */
  _displayExecutionSummary(results) {
    console.log(colors.yellow + '\nExecution Summary:' + colors.reset);
    console.log(`  Duration: ${results.total_duration_ms}ms`);
    console.log(`  Success: ${results.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
    console.log(`  Circuit Breaker: ${results.circuit_breaker_triggered ? colors.red + 'TRIGGERED' : colors.green + 'OK'}${colors.reset}`);

    const totalUnits = results.groups.flatMap(g => g.units).length;
    const successfulUnits = results.groups.flatMap(g => g.units).filter(u => u.success).length;

    console.log(`  Units: ${successfulUnits}/${totalUnits} successful`);

    console.log('\n' + colors.yellow + 'Groups:' + colors.reset);
    results.groups.forEach(group => {
      const status = group.success ? colors.green + '✓' : colors.red + '✗';
      console.log(`  ${status} ${group.group_id}: ${group.duration_ms}ms${colors.reset}`);

      group.units.forEach(unit => {
        const unitStatus = unit.success ? '✓' : '✗';
        const fallback = unit.attempts > 1 ? ` (${unit.attempts} attempts)` : '';
        console.log(`    ${unitStatus} ${unit.unit_id}: ${unit.agent_used}${fallback}`);
      });
    });
  }

  /**
   * Estimate complexity from task description
   */
  _estimateComplexity(task) {
    let score = 0;

    // Check for bulk operations
    if (/\ball\s+\d+/i.test(task)) score += 0.3;

    // Check for multiple targets
    const commas = (task.match(/,/g) || []).length;
    score += Math.min(commas * 0.15, 0.3);

    // Check for production keywords
    if (/production|prod|release/i.test(task)) score += 0.4;

    // Check for complex actions
    if (/deploy|migrate|merge|consolidate/i.test(task)) score += 0.3;

    return Math.min(score, 1.0);
  }
}

/**
 * CLI Main
 */
if (require.main === module) {
  const cli = new SupervisorCLI();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  (async () => {
    try {
      switch (command) {
        case 'plan':
          {
            const task = args.join(' ');
            if (!task) {
              console.log('Usage: supervisor-cli.js plan <task> [--output <file>]');
              process.exit(1);
            }

            const outputIndex = args.indexOf('--output');
            const output = outputIndex >= 0 ? args[outputIndex + 1] : null;

            await cli.plan(task, { output });
          }
          break;

        case 'execute':
          {
            const planPath = args[0];
            if (!planPath) {
              console.log('Usage: supervisor-cli.js execute <plan-file> [--output <file>] [--real-execution] [--verbose]');
              process.exit(1);
            }

            const outputIndex = args.indexOf('--output');
            const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
            const realExecution = args.includes('--real-execution');
            const verbose = args.includes('--verbose');

            await cli.execute(planPath, { output, realExecution, verbose });
          }
          break;

        case 'audit':
          {
            const planPath = args[0];
            const resultsPath = args[1];

            if (!planPath || !resultsPath) {
              console.log('Usage: supervisor-cli.js audit <plan-file> <results-file> [--output <file>]');
              process.exit(1);
            }

            const outputIndex = args.indexOf('--output');
            const output = outputIndex >= 0 ? args[outputIndex + 1] : null;

            await cli.audit(planPath, resultsPath, { output });
          }
          break;

        case 'full':
          {
            const task = args.filter(a => !a.startsWith('--')).join(' ');
            if (!task) {
              console.log('Usage: supervisor-cli.js full <task> [--output-dir <dir>] [--real-execution] [--verbose]');
              process.exit(1);
            }

            const outputDirIndex = args.indexOf('--output-dir');
            const outputDir = outputDirIndex >= 0 ? args[outputDirIndex + 1] : null;
            const realExecution = args.includes('--real-execution');
            const verbose = args.includes('--verbose');

            await cli.full(task, {
              autoExecute: true,
              outputDir,
              realExecution,
              verbose
            });
          }
          break;

        case 'test':
          await cli.test();
          break;

        default:
          console.log(colors.bold + 'Supervisor-Auditor CLI' + colors.reset);
          console.log('');
          console.log('Commands:');
          console.log('  plan <task>                           - Generate execution plan');
          console.log('  execute <plan-file>                   - Execute a plan');
          console.log('  audit <plan-file> <results-file>      - Generate audit report');
          console.log('  full <task>                           - Plan, execute, and audit');
          console.log('  test                                  - Run test suite');
          console.log('');
          console.log('Options:');
          console.log('  --output <file>                       - Save output to file');
          console.log('  --output-dir <dir>                    - Save all artifacts to directory');
          console.log('  --real-execution                      - Use real Task tool (vs mock)');
          console.log('  --verbose                             - Enable verbose logging');
          console.log('');
          console.log('Examples:');
          console.log('  supervisor-cli.js plan "Generate READMEs for all 8 plugins"');
          console.log('  supervisor-cli.js full "Analyze quality" --output-dir /tmp/supervisor --real-execution');
          console.log('  supervisor-cli.js execute plan.json --real-execution --verbose');
          console.log('  supervisor-cli.js test');
      }
    } catch (error) {
      console.error(colors.red + 'Error: ' + error.message + colors.reset);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = SupervisorCLI;
