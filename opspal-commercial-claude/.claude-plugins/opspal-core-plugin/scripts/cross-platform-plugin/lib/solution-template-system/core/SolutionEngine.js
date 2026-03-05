/**
 * SolutionEngine.js
 *
 * Main orchestrator for solution template deployment. Coordinates template
 * processing, environment resolution, dependency ordering, and multi-platform
 * deployment with checkpoint/rollback support.
 *
 * @module solution-template-system/core/SolutionEngine
 */

'use strict';

const fs = require('fs');
const path = require('path');
const TemplateProcessor = require('./TemplateProcessor');
const EnvironmentManager = require('./EnvironmentManager');
const ValidationEngine = require('./ValidationEngine');
const DependencyResolver = require('./DependencyResolver');

/**
 * Main orchestrator for solution deployments
 */
class SolutionEngine {
  constructor(options = {}) {
    this.options = {
      solutionsDir: options.solutionsDir || './solutions/templates',
      environmentsDir: options.environmentsDir || './solutions/environments',
      checkpointsDir: options.checkpointsDir || './solutions/checkpoints',
      dryRun: options.dryRun || false,
      validateOnly: options.validateOnly || false,
      verbose: options.verbose || false,
      ...options
    };

    // Initialize core components
    this.templateProcessor = new TemplateProcessor();
    this.environmentManager = new EnvironmentManager({
      environmentsDir: this.options.environmentsDir
    });
    this.validationEngine = new ValidationEngine();
    this.dependencyResolver = new DependencyResolver();

    // Platform deployers (lazy-loaded)
    this.deployers = {};

    // Deployment state
    this.currentDeployment = null;
    this.deploymentHistory = [];
  }

  /**
   * Load a solution manifest from file
   * @param {string} solutionPath - Path to solution.json or solution directory
   * @returns {Object} Loaded and validated solution
   */
  async loadSolution(solutionPath) {
    let manifestPath = solutionPath;

    // Handle directory path
    if (fs.existsSync(solutionPath) && fs.statSync(solutionPath).isDirectory()) {
      manifestPath = path.join(solutionPath, 'solution.json');
    }

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Solution manifest not found: ${manifestPath}`);
    }

    const content = fs.readFileSync(manifestPath, 'utf-8');
    const solution = JSON.parse(content);

    // Store base path for resolving template references
    solution._basePath = path.dirname(manifestPath);

    // Validate the solution
    const validation = this.validationEngine.validateSolution(solution);

    if (!validation.valid) {
      throw new Error(
        `Invalid solution: ${validation.errors.map(e => e.message).join(', ')}`
      );
    }

    return {
      solution,
      validation,
      basePath: solution._basePath
    };
  }

  /**
   * Main deployment entry point
   * @param {string} solutionName - Solution name or path
   * @param {string} environmentName - Target environment name
   * @param {Object} overrides - Parameter overrides
   * @returns {Object} Deployment result
   */
  async deploy(solutionName, environmentName, overrides = {}) {
    const startTime = Date.now();

    try {
      // Phase 1: Load solution
      this.log('Phase 1: Loading solution...');
      const { solution, basePath } = await this.loadSolution(
        this.resolveSolutionPath(solutionName)
      );

      // Phase 2: Load environment
      this.log('Phase 2: Loading environment profile...');
      const environment = await this.loadEnvironment(environmentName);

      // Phase 3: Merge parameters
      this.log('Phase 3: Resolving parameters...');
      const parameters = this.mergeParameters(
        solution.parameters,
        environment.parameters || {},
        overrides
      );

      // Validate required parameters
      const paramValidation = this.validationEngine.validateParameters(
        parameters,
        solution.parameters
      );

      if (!paramValidation.valid) {
        return {
          success: false,
          phase: 'parameter_validation',
          errors: paramValidation.errors,
          duration: Date.now() - startTime
        };
      }

      // Phase 4: Pre-flight validation
      this.log('Phase 4: Running pre-flight checks...');
      const preflightResult = await this.runPreflightChecks(
        solution,
        environment,
        parameters
      );

      if (!preflightResult.success) {
        return {
          success: false,
          phase: 'preflight',
          errors: preflightResult.errors,
          warnings: preflightResult.warnings,
          duration: Date.now() - startTime
        };
      }

      // Phase 5: Resolve dependencies
      this.log('Phase 5: Resolving component dependencies...');
      const dependencyResult = this.dependencyResolver.resolve(solution.components);

      if (!dependencyResult.success) {
        return {
          success: false,
          phase: 'dependency_resolution',
          errors: dependencyResult.errors,
          cycles: dependencyResult.cycles,
          duration: Date.now() - startTime
        };
      }

      // Phase 6: Process templates
      this.log('Phase 6: Processing templates...');
      const processedComponents = await this.processComponents(
        dependencyResult.orderedComponents,
        {
          ...parameters,
          environment,
          solution: {
            name: solution.name,
            version: solution.version
          }
        },
        basePath,
        environment
      );

      // Exit early if validate-only mode
      if (this.options.validateOnly) {
        return {
          success: true,
          phase: 'validation_complete',
          message: 'Validation completed successfully (dry run)',
          components: processedComponents,
          deploymentOrder: dependencyResult.metadata.deploymentPhases,
          duration: Date.now() - startTime
        };
      }

      // Phase 7: Create checkpoint
      this.log('Phase 7: Creating deployment checkpoint...');
      const checkpoint = await this.createCheckpoint(solution, environment);

      // Phase 8: Deploy components
      this.log('Phase 8: Deploying components...');
      const deploymentResult = await this.deployComponents(
        processedComponents,
        environment,
        dependencyResult.metadata.deploymentPhases
      );

      if (!deploymentResult.success) {
        // Attempt rollback
        if (!this.options.dryRun && checkpoint) {
          this.log('Deployment failed. Initiating rollback...');
          await this.rollback(checkpoint.id);
        }

        return {
          success: false,
          phase: 'deployment',
          errors: deploymentResult.errors,
          deployedComponents: deploymentResult.deployedComponents,
          checkpoint: checkpoint?.id,
          duration: Date.now() - startTime
        };
      }

      // Phase 9: Post-deployment validation
      this.log('Phase 9: Running post-deployment validation...');
      const postValidation = await this.runPostDeploymentChecks(
        solution,
        environment,
        deploymentResult
      );

      // Record deployment
      const deployment = {
        id: this.generateDeploymentId(),
        solution: solution.name,
        version: solution.version,
        environment: environmentName,
        status: postValidation.success ? 'success' : 'warning',
        checkpoint: checkpoint?.id,
        components: deploymentResult.deployedComponents,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        warnings: postValidation.warnings || []
      };

      this.deploymentHistory.push(deployment);
      await this.saveDeploymentRecord(deployment);

      return {
        success: true,
        deployment,
        components: deploymentResult.deployedComponents,
        postValidation,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        phase: 'error',
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Load and resolve environment profile
   * @param {string} environmentName - Environment name
   * @returns {Object} Resolved environment profile
   */
  async loadEnvironment(environmentName) {
    return this.environmentManager.loadProfile(environmentName);
  }

  /**
   * Merge parameter sources (solution defaults, environment overrides, runtime overrides)
   * @param {Object} solutionParams - Solution parameter definitions
   * @param {Object} environmentParams - Environment parameter values
   * @param {Object} runtimeOverrides - Runtime parameter overrides
   * @returns {Object} Merged parameter values
   */
  mergeParameters(solutionParams, environmentParams, runtimeOverrides) {
    const merged = {};

    // Start with solution defaults
    for (const [name, def] of Object.entries(solutionParams || {})) {
      if (def.default !== undefined) {
        merged[name] = def.default;
      }
    }

    // Apply environment values
    for (const [name, value] of Object.entries(environmentParams || {})) {
      merged[name] = value;
    }

    // Apply runtime overrides
    for (const [name, value] of Object.entries(runtimeOverrides || {})) {
      merged[name] = value;
    }

    return merged;
  }

  /**
   * Run pre-flight validation checks
   * @param {Object} solution - Solution manifest
   * @param {Object} environment - Environment profile
   * @param {Object} parameters - Resolved parameters
   * @returns {Object} Pre-flight check result
   */
  async runPreflightChecks(solution, environment, parameters) {
    const checks = solution.preDeployChecks || [];
    const errors = [];
    const warnings = [];

    for (const check of checks) {
      try {
        const result = await this.validationEngine.runPreDeployChecks(
          [check],
          { environment, parameters, solution }
        );

        errors.push(...result.errors);
        warnings.push(...result.warnings);
      } catch (error) {
        if (check.severity === 'error') {
          errors.push({
            check: check.name,
            type: 'preflight_error',
            message: error.message
          });
        } else {
          warnings.push({
            check: check.name,
            type: 'preflight_warning',
            message: error.message
          });
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Process component templates
   * @param {Array} components - Ordered components
   * @param {Object} parameters - Parameter values
   * @param {string} basePath - Solution base path
   * @param {Object} environment - Environment profile
   * @returns {Array} Processed components with rendered templates
   */
  async processComponents(components, parameters, basePath, environment) {
    const processed = [];

    for (const component of components) {
      const templatePath = path.join(basePath, component.template);

      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templatePath} (component: ${component.id})`);
      }

      const templateContent = fs.readFileSync(templatePath, 'utf-8');

      // Prepare template context
      const context = {
        ...parameters,
        component: {
          id: component.id,
          type: component.type
        }
      };

      // Process template
      const rendered = this.templateProcessor.process(
        templateContent,
        context,
        { environment }
      );

      processed.push({
        ...component,
        originalTemplate: templatePath,
        renderedContent: rendered,
        processedAt: new Date().toISOString()
      });
    }

    return processed;
  }

  /**
   * Deploy processed components to target environment
   * @param {Array} components - Processed components
   * @param {Object} environment - Target environment
   * @param {Array} phases - Deployment phases
   * @returns {Object} Deployment result
   */
  async deployComponents(components, environment, phases) {
    if (this.options.dryRun) {
      this.log('DRY RUN: Would deploy components:', components.map(c => c.id));
      return {
        success: true,
        deployedComponents: components.map(c => ({
          id: c.id,
          type: c.type,
          status: 'dry_run'
        })),
        errors: []
      };
    }

    const deployedComponents = [];
    const errors = [];

    // Deploy phase by phase
    for (const phase of phases) {
      this.log(`Deploying phase ${phase.phase}: ${phase.components.join(', ')}`);

      // Components in a phase can be deployed in parallel
      const phaseComponents = components.filter(c =>
        phase.components.includes(c.id)
      );

      const results = await Promise.allSettled(
        phaseComponents.map(component =>
          this.deployComponent(component, environment)
        )
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const component = phaseComponents[i];

        if (result.status === 'fulfilled' && result.value.success) {
          deployedComponents.push({
            id: component.id,
            type: component.type,
            status: 'deployed',
            result: result.value
          });
        } else {
          const error = result.status === 'rejected'
            ? result.reason
            : result.value.error;

          errors.push({
            component: component.id,
            type: component.type,
            error: error.message || error
          });

          // Stop deployment on error (don't proceed to next phase)
          return {
            success: false,
            deployedComponents,
            errors,
            failedPhase: phase.phase
          };
        }
      }
    }

    return {
      success: true,
      deployedComponents,
      errors: []
    };
  }

  /**
   * Deploy a single component
   * @param {Object} component - Component to deploy
   * @param {Object} environment - Target environment
   * @returns {Object} Deployment result
   */
  async deployComponent(component, environment) {
    // Parse platform from component type (e.g., "salesforce:flow")
    const [platform, metadataType] = component.type.split(':');

    // Get or initialize deployer for platform
    const deployer = await this.getDeployer(platform, environment);

    if (!deployer) {
      throw new Error(`No deployer available for platform: ${platform}`);
    }

    return deployer.deploy({
      component,
      metadataType,
      content: component.renderedContent,
      environment
    });
  }

  /**
   * Get or initialize platform deployer
   * @param {string} platform - Platform name
   * @param {Object} environment - Environment profile
   * @returns {Object} Platform deployer
   */
  async getDeployer(platform, environment) {
    if (this.deployers[platform]) {
      return this.deployers[platform];
    }

    try {
      const deployerPath = path.join(
        __dirname,
        '..',
        'deployers',
        `${this.capitalizeFirst(platform)}Deployer.js`
      );

      if (fs.existsSync(deployerPath)) {
        const DeployerClass = require(deployerPath);
        this.deployers[platform] = new DeployerClass({
          credentials: environment.credentials?.[platform],
          defaults: environment.defaults?.[platform]
        });
        return this.deployers[platform];
      }
    } catch (error) {
      this.log(`Failed to load deployer for ${platform}: ${error.message}`);
    }

    return null;
  }

  /**
   * Create deployment checkpoint for rollback
   * @param {Object} solution - Solution manifest
   * @param {Object} environment - Target environment
   * @returns {Object} Checkpoint data
   */
  async createCheckpoint(solution, environment) {
    if (this.options.dryRun) {
      return null;
    }

    const checkpoint = {
      id: this.generateCheckpointId(),
      solution: solution.name,
      version: solution.version,
      environment: environment.name,
      createdAt: new Date().toISOString(),
      components: solution.components.map(c => ({
        id: c.id,
        type: c.type
      })),
      // In production, this would capture current state of each component
      state: {}
    };

    // Save checkpoint
    const checkpointPath = path.join(
      this.options.checkpointsDir,
      `${checkpoint.id}.json`
    );

    // Ensure checkpoints directory exists
    if (!fs.existsSync(this.options.checkpointsDir)) {
      fs.mkdirSync(this.options.checkpointsDir, { recursive: true });
    }

    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

    return checkpoint;
  }

  /**
   * Rollback to a previous checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Object} Rollback result
   */
  async rollback(checkpointId) {
    const checkpointPath = path.join(
      this.options.checkpointsDir,
      `${checkpointId}.json`
    );

    if (!fs.existsSync(checkpointPath)) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));

    this.log(`Rolling back to checkpoint ${checkpointId}...`);

    // In production, this would restore each component to checkpoint state
    // For now, log the intended rollback
    for (const component of checkpoint.components) {
      this.log(`  Would rollback: ${component.id} (${component.type})`);
    }

    return {
      success: true,
      checkpoint: checkpointId,
      rolledBack: checkpoint.components.length
    };
  }

  /**
   * Run post-deployment validation
   * @param {Object} solution - Solution manifest
   * @param {Object} environment - Target environment
   * @param {Object} deploymentResult - Deployment result
   * @returns {Object} Post-validation result
   */
  async runPostDeploymentChecks(solution, environment, deploymentResult) {
    const actions = solution.postDeployActions || [];
    const warnings = [];
    const errors = [];

    for (const action of actions) {
      try {
        // Execute post-deployment action
        this.log(`Running post-deploy action: ${action.name}`);
        // Actions would be executed here in production
      } catch (error) {
        if (action.failOnError) {
          errors.push({
            action: action.name,
            message: error.message
          });
        } else {
          warnings.push({
            action: action.name,
            message: error.message
          });
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Save deployment record
   * @param {Object} deployment - Deployment record
   */
  async saveDeploymentRecord(deployment) {
    const recordsDir = path.join(this.options.checkpointsDir, '..', 'deployments');

    if (!fs.existsSync(recordsDir)) {
      fs.mkdirSync(recordsDir, { recursive: true });
    }

    const recordPath = path.join(recordsDir, `${deployment.id}.json`);
    fs.writeFileSync(recordPath, JSON.stringify(deployment, null, 2));
  }

  /**
   * List available solutions
   * @returns {Array} Array of solution summaries
   */
  listSolutions() {
    const solutions = [];

    if (!fs.existsSync(this.options.solutionsDir)) {
      return solutions;
    }

    const entries = fs.readdirSync(this.options.solutionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = path.join(
          this.options.solutionsDir,
          entry.name,
          'solution.json'
        );

        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            solutions.push({
              name: manifest.name,
              version: manifest.version,
              description: manifest.description,
              path: path.join(this.options.solutionsDir, entry.name),
              metadata: manifest.metadata
            });
          } catch (error) {
            // Skip invalid manifests
          }
        }
      }
    }

    return solutions;
  }

  /**
   * Get deployment history
   * @param {Object} filters - Optional filters
   * @returns {Array} Deployment history
   */
  getDeploymentHistory(filters = {}) {
    let history = [...this.deploymentHistory];

    if (filters.solution) {
      history = history.filter(d => d.solution === filters.solution);
    }

    if (filters.environment) {
      history = history.filter(d => d.environment === filters.environment);
    }

    if (filters.status) {
      history = history.filter(d => d.status === filters.status);
    }

    return history.sort((a, b) =>
      new Date(b.startTime) - new Date(a.startTime)
    );
  }

  /**
   * Resolve solution path from name or path
   * @param {string} nameOrPath - Solution name or path
   * @returns {string} Full path to solution
   */
  resolveSolutionPath(nameOrPath) {
    // If it's an absolute path, use it directly
    if (path.isAbsolute(nameOrPath)) {
      return nameOrPath;
    }

    // If it's a relative path that exists, use it
    if (fs.existsSync(nameOrPath)) {
      return path.resolve(nameOrPath);
    }

    // Otherwise, look in solutions directory
    return path.join(this.options.solutionsDir, nameOrPath);
  }

  /**
   * Generate unique deployment ID
   * @returns {string} Deployment ID
   */
  generateDeploymentId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `deploy-${timestamp}-${random}`;
  }

  /**
   * Generate unique checkpoint ID
   * @returns {string} Checkpoint ID
   */
  generateCheckpointId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `checkpoint-${timestamp}-${random}`;
  }

  /**
   * Capitalize first letter
   * @param {string} str - Input string
   * @returns {string} Capitalized string
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Log message if verbose mode is enabled
   * @param {...any} args - Log arguments
   */
  log(...args) {
    if (this.options.verbose) {
      console.log('[SolutionEngine]', ...args);
    }
  }
}

module.exports = SolutionEngine;
