#!/usr/bin/env node

/**
 * Pre-Session Validators for Silent Failure Detection
 *
 * Purpose: Detect silent failure conditions BEFORE a session begins
 *
 * Validators:
 * - EnvBypassValidator: Detects dangerous environment variables that disable safety
 * - CircuitBreakerStateValidator: Checks if circuit breakers are open (skipping hooks)
 * - CacheStalenessValidator: Detects stale cached data that may cause incorrect results
 * - PackageAuditValidator: Verifies critical system and npm packages are installed
 * - EnvironmentIsolationValidator: Detects environment variable leakage between sessions
 *
 * Usage:
 *   const { runAllPreSessionValidators, EnvBypassValidator } = require('./pre-session-validators');
 *
 *   // Run all validators
 *   const results = await runAllPreSessionValidators();
 *
 *   // Run specific validator
 *   const envCheck = new EnvBypassValidator().check();
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// =============================================================================
// Constants
// =============================================================================

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO'
};

// Load config if available
let CONFIG;
try {
  const configPath = path.join(__dirname, '..', '..', '..', 'config', 'silent-failure-detection.json');
  if (fs.existsSync(configPath)) {
    CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch {
  // Use defaults
}

const DEFAULT_DANGEROUS_ENV_VARS = [
  { name: 'SKIP_VALIDATION', severity: SEVERITY.CRITICAL, risk: 'ALL safety checks disabled' },
  { name: 'SKIP_TOOL_VALIDATION', severity: SEVERITY.HIGH, risk: 'Tool contract checks disabled' },
  { name: 'SKIP_MOCKS_CHECK', severity: SEVERITY.HIGH, risk: 'No-mocks policy bypassed' },
  { name: 'SKIP_PRE_COMMIT', severity: SEVERITY.MEDIUM, risk: 'Pre-commit hooks skipped' },
  { name: 'FORCE_CACHE', severity: SEVERITY.MEDIUM, risk: 'Live-first mode disabled' },
  { name: 'GLOBAL_LIVE_FIRST', severity: SEVERITY.MEDIUM, risk: 'Cache fallback to stale data enabled', triggerValue: 'false' }
];

const DEFAULT_ISOLATED_ENV_VARS = ['ORG_SLUG', 'SF_TARGET_ORG', 'HUBSPOT_PORTAL_ID', 'MARKETO_INSTANCE_ID'];

const DEFAULT_CACHE_THRESHOLDS = {
  'field-dictionary': 24 * 60 * 60 * 1000,  // 24 hours
  'org-context': 7 * 24 * 60 * 60 * 1000,   // 7 days
  'api-cache': 60 * 60 * 1000,              // 1 hour
  'metadata-cache': 24 * 60 * 60 * 1000     // 24 hours
};

const DEFAULT_CRITICAL_PACKAGES = [
  { name: 'jq', checkCmd: 'jq --version', impact: 'Hook JSON processing' },
  { name: 'node', checkCmd: 'node --version', impact: 'Script execution' }
];

// =============================================================================
// Base Validator Class
// =============================================================================

class BaseValidator {
  constructor(name) {
    this.name = name;
  }

  /**
   * Run the validator check
   * @returns {Object} { validator: string, violations: Array, passed: boolean }
   */
  check() {
    throw new Error('Subclasses must implement check()');
  }

  /**
   * Create a violation object
   */
  createViolation(type, severity, message, details = {}) {
    return {
      type,
      severity,
      message,
      timestamp: new Date().toISOString(),
      ...details
    };
  }
}

// =============================================================================
// Environment Bypass Validator
// =============================================================================

/**
 * Detects dangerous environment variables that disable safety checks
 */
class EnvBypassValidator extends BaseValidator {
  constructor(options = {}) {
    super('env-bypass');
    this.dangerousVars = options.dangerousVars ||
      CONFIG?.dangerousEnvVars ||
      DEFAULT_DANGEROUS_ENV_VARS;
  }

  check() {
    const violations = [];

    for (const envVar of this.dangerousVars) {
      const currentValue = process.env[envVar.name];

      // Check if variable is set to a "truthy" disabling value
      let isViolation = false;

      if (envVar.triggerValue !== undefined) {
        // Specific trigger value (e.g., GLOBAL_LIVE_FIRST=false)
        isViolation = currentValue === envVar.triggerValue;
      } else {
        // Default: any truthy value
        isViolation = currentValue === '1' || currentValue === 'true' || currentValue === 'yes';
      }

      if (isViolation) {
        violations.push(this.createViolation(
          'ENV_BYPASS',
          envVar.severity,
          `${envVar.name} is set, which ${envVar.risk}`,
          {
            variable: envVar.name,
            currentValue,
            risk: envVar.risk,
            recommendation: `Unset ${envVar.name} unless intentionally testing: unset ${envVar.name}`
          }
        ));
      }
    }

    return {
      validator: this.name,
      violations,
      passed: violations.length === 0,
      criticalCount: violations.filter(v => v.severity === SEVERITY.CRITICAL).length,
      highCount: violations.filter(v => v.severity === SEVERITY.HIGH).length
    };
  }
}

// =============================================================================
// Circuit Breaker State Validator
// =============================================================================

/**
 * Checks if any circuit breakers are in OPEN state (silently skipping operations)
 */
class CircuitBreakerStateValidator extends BaseValidator {
  constructor(options = {}) {
    super('circuit-breaker');
    this.stateFilePaths = options.stateFilePaths || [
      path.join(process.cwd(), '.claude', 'hook-circuit-state.json'),
      path.join(os.homedir(), '.claude', 'circuit-breaker-state.json')
    ];
  }

  check() {
    const violations = [];

    // Check hook circuit breaker state files
    for (const stateFile of this.stateFilePaths) {
      if (fs.existsSync(stateFile)) {
        try {
          const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

          if (state.state === 'OPEN') {
            const openedAt = state.openedAt ? new Date(state.openedAt) : null;
            const openDuration = openedAt ? Date.now() - openedAt.getTime() : 0;

            violations.push(this.createViolation(
              'CIRCUIT_OPEN',
              SEVERITY.CRITICAL,
              `Circuit breaker for ${state.serviceName || 'hooks'} is OPEN - validation hooks are being SKIPPED`,
              {
                service: state.serviceName || 'hooks',
                failureCount: state.failureCount || 0,
                openedAt: state.openedAt,
                openDurationMs: openDuration,
                stateFile,
                recommendation: `Fix underlying issue, then reset: rm "${stateFile}"`
              }
            ));
          } else if (state.state === 'HALF_OPEN') {
            violations.push(this.createViolation(
              'CIRCUIT_HALF_OPEN',
              SEVERITY.MEDIUM,
              `Circuit breaker for ${state.serviceName || 'hooks'} is HALF_OPEN - testing recovery`,
              {
                service: state.serviceName || 'hooks',
                stateFile,
                recommendation: 'Monitor closely - circuit is testing recovery'
              }
            ));
          }
        } catch (err) {
          // Malformed state file
          violations.push(this.createViolation(
            'CIRCUIT_STATE_CORRUPTED',
            SEVERITY.MEDIUM,
            `Circuit breaker state file is corrupted: ${stateFile}`,
            {
              stateFile,
              error: err.message,
              recommendation: `Remove corrupted file: rm "${stateFile}"`
            }
          ));
        }
      }
    }

    // Try to check global circuit breaker registry if available
    try {
      const circuitBreakerPath = path.join(__dirname, '..', '..', '..', '..', '..', '.claude', 'scripts', 'lib', 'circuit-breaker.js');
      if (fs.existsSync(circuitBreakerPath)) {
        const { globalRegistry } = require(circuitBreakerPath);
        if (globalRegistry && typeof globalRegistry.getHealthReport === 'function') {
          const report = globalRegistry.getHealthReport();

          if (report.open > 0) {
            const openBreakers = Object.entries(report.breakers || {})
              .filter(([_, v]) => v.state === 'OPEN')
              .map(([k]) => k);

            violations.push(this.createViolation(
              'SERVICE_CIRCUIT_OPEN',
              SEVERITY.HIGH,
              `${report.open} service circuit breaker(s) are OPEN`,
              {
                services: openBreakers,
                recommendation: 'Check service health before proceeding'
              }
            ));
          }
        }
      }
    } catch {
      // Circuit breaker module not available - that's okay
    }

    return {
      validator: this.name,
      violations,
      passed: violations.length === 0,
      criticalCount: violations.filter(v => v.severity === SEVERITY.CRITICAL).length,
      highCount: violations.filter(v => v.severity === SEVERITY.HIGH).length
    };
  }
}

// =============================================================================
// Cache Staleness Validator
// =============================================================================

/**
 * Detects stale cached data that may cause incorrect results
 */
class CacheStalenessValidator extends BaseValidator {
  constructor(options = {}) {
    super('cache-staleness');
    this.thresholds = options.thresholds ||
      CONFIG?.cacheThresholds ||
      DEFAULT_CACHE_THRESHOLDS;
    this.cacheDirs = options.cacheDirs || [
      path.join(os.homedir(), '.claude', 'cache'),
      path.join(process.cwd(), '.claude', 'cache'),
      path.join(process.cwd(), 'orgs')  // Check org-specific caches
    ];
  }

  check() {
    const violations = [];
    const now = Date.now();

    for (const cacheDir of this.cacheDirs) {
      if (!fs.existsSync(cacheDir)) continue;

      // Check specific cache types
      for (const [cacheType, threshold] of Object.entries(this.thresholds)) {
        const cachePaths = this.findCachePaths(cacheDir, cacheType);

        for (const cachePath of cachePaths) {
          try {
            const stats = fs.statSync(cachePath);
            const age = now - stats.mtimeMs;

            if (age > threshold) {
              const ageHours = Math.round(age / (60 * 60 * 1000));
              const thresholdHours = Math.round(threshold / (60 * 60 * 1000));

              violations.push(this.createViolation(
                'STALE_CACHE',
                SEVERITY.MEDIUM,
                `Cache "${cacheType}" is ${ageHours} hours old (threshold: ${thresholdHours} hours)`,
                {
                  cache: cacheType,
                  cachePath,
                  ageMs: age,
                  ageHours,
                  thresholdMs: threshold,
                  thresholdHours,
                  recommendation: `Refresh cache or delete: rm "${cachePath}"`
                }
              ));
            }
          } catch {
            // File might have been deleted
          }
        }
      }
    }

    return {
      validator: this.name,
      violations,
      passed: violations.length === 0,
      criticalCount: 0,  // Cache staleness is never critical
      highCount: 0
    };
  }

  findCachePaths(baseDir, cacheType) {
    const paths = [];
    const patterns = {
      'field-dictionary': ['field-dictionary.yaml', 'field-dictionary.json', '**/configs/field-dictionary.yaml'],
      'org-context': ['org-context.json', '**/org.yaml'],
      'api-cache': ['api-cache.json', 'api-cache/**/*.json'],
      'metadata-cache': ['metadata-cache.json', 'metadata/**/*.json']
    };

    const filePatterns = patterns[cacheType] || [`${cacheType}.json`, `${cacheType}.yaml`];

    for (const pattern of filePatterns) {
      if (pattern.includes('**')) {
        // Skip glob patterns for now - just check direct files
        continue;
      }

      const fullPath = path.join(baseDir, pattern);
      if (fs.existsSync(fullPath)) {
        paths.push(fullPath);
      }
    }

    return paths;
  }
}

// =============================================================================
// Package Audit Validator
// =============================================================================

/**
 * Verifies critical system and npm packages are installed
 */
class PackageAuditValidator extends BaseValidator {
  constructor(options = {}) {
    super('package-audit');
    this.criticalPackages = options.criticalPackages ||
      CONFIG?.criticalPackages ||
      DEFAULT_CRITICAL_PACKAGES;
    this.pluginsDir = options.pluginsDir ||
      path.join(process.cwd(), 'plugins');
  }

  check() {
    const violations = [];

    // Check system dependencies
    for (const pkg of this.criticalPackages) {
      try {
        execSync(pkg.checkCmd, { stdio: 'pipe', timeout: 5000 });
      } catch {
        violations.push(this.createViolation(
          'MISSING_SYSTEM_PACKAGE',
          SEVERITY.HIGH,
          `System package "${pkg.name}" is not installed`,
          {
            package: pkg.name,
            impact: pkg.impact,
            recommendation: `Install: brew install ${pkg.name} (macOS) or apt install ${pkg.name} (Linux)`
          }
        ));
      }
    }

    // Check npm packages for plugins (quick check - detailed check via /checkdependencies)
    if (fs.existsSync(this.pluginsDir)) {
      const missingCount = this.quickNpmCheck();
      if (missingCount > 0) {
        violations.push(this.createViolation(
          'MISSING_NPM_PACKAGES',
          SEVERITY.MEDIUM,
          `${missingCount} npm package(s) may be missing across plugins`,
          {
            count: missingCount,
            recommendation: 'Run /checkdependencies --fix to install missing packages'
          }
        ));
      }
    }

    return {
      validator: this.name,
      violations,
      passed: violations.length === 0,
      criticalCount: 0,
      highCount: violations.filter(v => v.severity === SEVERITY.HIGH).length
    };
  }

  quickNpmCheck() {
    let missingCount = 0;

    try {
      const plugins = fs.readdirSync(this.pluginsDir);

      for (const plugin of plugins.slice(0, 5)) {  // Check first 5 plugins only for speed
        const pkgJsonPath = path.join(this.pluginsDir, plugin, 'package.json');
        const nodeModulesPath = path.join(this.pluginsDir, plugin, 'node_modules');

        if (fs.existsSync(pkgJsonPath)) {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          const deps = Object.keys(pkgJson.dependencies || {});

          if (deps.length > 0 && !fs.existsSync(nodeModulesPath)) {
            missingCount += deps.length;
          }
        }
      }
    } catch {
      // Error reading plugins - that's okay
    }

    return missingCount;
  }
}

// =============================================================================
// Environment Isolation Validator
// =============================================================================

/**
 * Detects environment variable leakage between sessions (wrong client context)
 */
class EnvironmentIsolationValidator extends BaseValidator {
  constructor(options = {}) {
    super('env-isolation');
    this.isolatedVars = options.isolatedVars ||
      CONFIG?.isolatedEnvVars ||
      DEFAULT_ISOLATED_ENV_VARS;
    this.sessionFile = options.sessionFile ||
      path.join(os.homedir(), '.claude', 'current-session.json');
  }

  check() {
    const violations = [];

    // Check for ORG_SLUG without matching directory context
    const orgSlug = process.env.ORG_SLUG;
    if (orgSlug) {
      const orgDir = path.join(process.cwd(), 'orgs', orgSlug);
      const instanceDir = path.join(process.cwd(), 'instances');

      // If we're in a different org's directory, that's a problem
      const cwd = process.cwd();
      if (cwd.includes('/orgs/') && !cwd.includes(`/orgs/${orgSlug}`)) {
        violations.push(this.createViolation(
          'ENV_LEAKAGE',
          SEVERITY.HIGH,
          `ORG_SLUG="${orgSlug}" but working directory suggests different client`,
          {
            variable: 'ORG_SLUG',
            currentValue: orgSlug,
            workingDir: cwd,
            recommendation: `Verify correct client context or run: unset ORG_SLUG`
          }
        ));
      }

      // Check if org directory exists
      if (!fs.existsSync(orgDir) && !fs.existsSync(path.join(instanceDir, 'salesforce', orgSlug))) {
        violations.push(this.createViolation(
          'ENV_UNKNOWN_ORG',
          SEVERITY.MEDIUM,
          `ORG_SLUG="${orgSlug}" but no matching org directory found`,
          {
            variable: 'ORG_SLUG',
            currentValue: orgSlug,
            expectedPath: orgDir,
            recommendation: `Create org directory or verify ORG_SLUG value`
          }
        ));
      }
    }

    // Check session file for context mismatch
    if (fs.existsSync(this.sessionFile)) {
      try {
        const session = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));

        for (const varName of this.isolatedVars) {
          const currentValue = process.env[varName];
          const sessionValue = session.env?.[varName];

          if (currentValue && sessionValue && currentValue !== sessionValue) {
            violations.push(this.createViolation(
              'ENV_SESSION_MISMATCH',
              SEVERITY.HIGH,
              `${varName} changed from "${sessionValue}" to "${currentValue}" during session`,
              {
                variable: varName,
                sessionValue,
                currentValue,
                recommendation: `Verify correct context: expected "${sessionValue}"`
              }
            ));
          }
        }
      } catch {
        // Malformed session file
      }
    }

    return {
      validator: this.name,
      violations,
      passed: violations.length === 0,
      criticalCount: 0,
      highCount: violations.filter(v => v.severity === SEVERITY.HIGH).length
    };
  }
}

// =============================================================================
// Runner Function
// =============================================================================

/**
 * Run all pre-session validators
 * @param {Object} options - Options to pass to validators
 * @returns {Object} Combined results from all validators
 */
async function runAllPreSessionValidators(options = {}) {
  const validators = [
    new EnvBypassValidator(options),
    new CircuitBreakerStateValidator(options),
    new CacheStalenessValidator(options),
    new PackageAuditValidator(options),
    new EnvironmentIsolationValidator(options)
  ];

  const results = [];
  let totalViolations = 0;
  let criticalCount = 0;
  let highCount = 0;

  for (const validator of validators) {
    try {
      const result = validator.check();
      results.push(result);
      totalViolations += result.violations.length;
      criticalCount += result.criticalCount || 0;
      highCount += result.highCount || 0;
    } catch (err) {
      results.push({
        validator: validator.name,
        violations: [{
          type: 'VALIDATOR_ERROR',
          severity: SEVERITY.MEDIUM,
          message: `Validator failed: ${err.message}`
        }],
        passed: false,
        error: err.message
      });
    }
  }

  // Generate summary
  const criticalViolations = results
    .flatMap(r => r.violations)
    .filter(v => v.severity === SEVERITY.CRITICAL);

  const criticalSummary = criticalViolations.length > 0
    ? criticalViolations.map(v => v.message).join('; ')
    : null;

  return {
    timestamp: new Date().toISOString(),
    passed: totalViolations === 0,
    totalViolations,
    criticalCount,
    highCount,
    criticalSummary,
    results,
    validators: results.map(r => ({
      name: r.validator,
      passed: r.passed,
      violationCount: r.violations.length
    }))
  };
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const verbose = args.includes('--verbose');

  runAllPreSessionValidators().then(results => {
    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      // Human-readable output
      console.log('\n=== Pre-Session Validation Results ===\n');

      for (const result of results.results) {
        const status = result.passed ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m';
        console.log(`${status} ${result.validator}: ${result.violations.length} issue(s)`);

        if (!result.passed || verbose) {
          for (const violation of result.violations) {
            const severityColor = {
              CRITICAL: '\x1b[31m',
              HIGH: '\x1b[33m',
              MEDIUM: '\x1b[34m',
              LOW: '\x1b[90m'
            }[violation.severity] || '';

            console.log(`   ${severityColor}[${violation.severity}]\x1b[0m ${violation.message}`);
            if (verbose && violation.recommendation) {
              console.log(`      Recommendation: ${violation.recommendation}`);
            }
          }
        }
      }

      console.log(`\nTotal: ${results.totalViolations} violations (${results.criticalCount} critical, ${results.highCount} high)`);

      if (results.criticalCount > 0) {
        console.log('\n\x1b[31m\u26a0\ufe0f  CRITICAL issues detected - review before proceeding\x1b[0m');
      }
    }

    process.exit(results.criticalCount > 0 ? 2 : (results.totalViolations > 0 ? 1 : 0));
  }).catch(err => {
    console.error('Error running validators:', err.message);
    process.exit(1);
  });
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  runAllPreSessionValidators,
  EnvBypassValidator,
  CircuitBreakerStateValidator,
  CacheStalenessValidator,
  PackageAuditValidator,
  EnvironmentIsolationValidator,
  BaseValidator,
  SEVERITY
};
