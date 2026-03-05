/**
 * HubSpot Workflow API Auditor
 *
 * Verifies that workflow API operations succeeded correctly, safely, and in the right order.
 * Returns evidence-based validation with actionable remediation recommendations.
 *
 * Part of: HubSpot Core Plugin v1.0.0
 * Created: 2025-10-16
 *
 * @module hubspot-workflow-auditor
 */

const HubSpotAPIValidator = require('./hubspot-api-validator');

/**
 * @typedef {Object} AuditInput
 * @property {string} task_description - Natural-language summary of what was attempted
 * @property {Object} intended_payload - The exact JSON sent for create/update
 * @property {Array<HttpLogEntry>} http_log - Ordered HTTP requests/responses
 * @property {Object} environment - Base URL, account/portal ID, scopes, object types
 * @property {Object} [constraints] - Known API limits or rules
 */

/**
 * @typedef {Object} HttpLogEntry
 * @property {string} verb - HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @property {string} url - Full request URL
 * @property {number} status - HTTP status code
 * @property {Object} [request_body] - Request payload
 * @property {Object} [response_body] - Response payload
 * @property {string} [timestamp] - ISO timestamp
 */

/**
 * @typedef {Object} AuditReport
 * @property {string} summary - Executive summary of audit results
 * @property {string} overall_status - PASS | FAIL | PARTIAL
 * @property {Object} scorecard - Scores for each category (0-10)
 * @property {Array<Assertion>} assertions - Required validation assertions
 * @property {Array<Finding>} findings - Detailed findings with priority
 * @property {Array<string>} recommended_fixes - Actionable fix recommendations
 * @property {Object} completeness - Input completeness check
 */

class HubSpotWorkflowAuditor {
  constructor() {
    this.validator = HubSpotAPIValidator;
  }

  /**
   * Main audit entry point
   * @param {AuditInput} inputs - Audit inputs
   * @returns {AuditReport} Complete audit report
   */
  audit(inputs) {
    // Validate inputs
    const completeness = this._checkCompleteness(inputs);

    // Extract components
    const { task_description, intended_payload, http_log, environment, constraints } = inputs;

    // Initialize report structure
    const findings = [];
    const assertions = this._initializeAssertions();
    const scorecard = {
      endpoint_scope: 0,
      sequence: 0,
      proof_of_success: 0,
      branching_rules: 0,
      data_validation: 0,
      error_handling: 0,
      enablement: 0,
      logging: 0
    };

    // Best-effort checks with what we have
    if (http_log && http_log.length > 0) {
      // 1. Endpoint & Scope Sanity (P1)
      const endpointFindings = this._validateEndpointScope(http_log, environment);
      findings.push(...endpointFindings);
      scorecard.endpoint_scope = this._scoreFindings(endpointFindings, 'Endpoint/Scope');

      // 2. Safe Sequence (P1)
      const sequenceFindings = this._validateSequence(http_log);
      findings.push(...sequenceFindings);
      scorecard.sequence = this._scoreFindings(sequenceFindings, 'Sequence');

      // 3. Proof of Success (P1)
      const proofFindings = this._proveSuccess(http_log, intended_payload, assertions);
      findings.push(...proofFindings);
      scorecard.proof_of_success = this._scoreFindings(proofFindings, 'Graph');

      // 4. Branching Rules (P1)
      const branchingFindings = this._validateBranchingRules(http_log, intended_payload, assertions);
      findings.push(...branchingFindings);
      scorecard.branching_rules = this._scoreFindings(branchingFindings, 'Branching');

      // 5. Data Validation (P1)
      const dataFindings = this._validateDataReferences(http_log, environment, assertions);
      findings.push(...dataFindings);
      scorecard.data_validation = this._scoreFindings(dataFindings, 'Data');

      // 6. Error Handling & Rollback (P2)
      const errorFindings = this._checkErrorHandling(http_log, assertions);
      findings.push(...errorFindings);
      scorecard.error_handling = this._scoreFindings(errorFindings, 'ErrorHandling');

      // 7. Enablement & Post-Checks (P2)
      const enablementFindings = this._checkEnablement(http_log, intended_payload, assertions);
      findings.push(...enablementFindings);
      scorecard.enablement = this._scoreFindings(enablementFindings, 'Enablement');

      // 8. Logging & Transparency (P3)
      const loggingFindings = this._checkLogging(http_log);
      findings.push(...loggingFindings);
      scorecard.logging = this._scoreFindings(loggingFindings, 'Logging');
    } else {
      findings.push({
        priority: 'P1',
        category: 'Endpoint/Scope',
        description: 'No HTTP log provided - cannot validate any operations',
        evidence: 'http_log is empty or missing'
      });
    }

    // Generate recommended fixes
    const recommended_fixes = this._generateRecommendedFixes(findings, assertions);

    // Determine overall status
    const overall_status = this._determineOverallStatus(assertions, findings);

    // Generate summary
    const summary = this._generateSummary(overall_status, scorecard, findings, task_description);

    return {
      summary,
      overall_status,
      scorecard,
      assertions,
      findings,
      recommended_fixes,
      completeness
    };
  }

  /**
   * Check input completeness
   * @private
   */
  _checkCompleteness(inputs) {
    const missing_inputs = [];

    if (!inputs.task_description) missing_inputs.push('task_description');
    if (!inputs.intended_payload) missing_inputs.push('intended_payload');
    if (!inputs.http_log || inputs.http_log.length === 0) missing_inputs.push('http_log');
    if (!inputs.environment) missing_inputs.push('environment');
    if (!inputs.constraints) missing_inputs.push('constraints');

    return {
      ok: missing_inputs.length === 0,
      missing_inputs
    };
  }

  /**
   * Initialize assertion structure
   * @private
   */
  _initializeAssertions() {
    return [
      {
        name: 'created_or_updated',
        pass: false,
        evidence: null,
        failure_reason: 'Not yet validated'
      },
      {
        name: 'graph_is_connected',
        pass: false,
        evidence: null,
        failure_reason: 'Not yet validated'
      },
      {
        name: 'enrollment_matches_intent',
        pass: false,
        evidence: null,
        failure_reason: 'Not yet validated'
      },
      {
        name: 'actions_match_intent',
        pass: false,
        evidence: null,
        failure_reason: 'Not yet validated'
      },
      {
        name: 'unsupported_features_not_claimed',
        pass: true, // Assume true until proven otherwise
        evidence: null,
        failure_reason: null
      },
      {
        name: 'enabled_state_correct',
        pass: false,
        evidence: null,
        failure_reason: 'Not yet validated'
      },
      {
        name: 'ids_validated',
        pass: false,
        evidence: null,
        failure_reason: 'Not yet validated'
      },
      {
        name: 'no_silent_failures',
        pass: true, // Assume true until proven otherwise
        evidence: null,
        failure_reason: null
      }
    ];
  }

  /**
   * 1. Validate Endpoint & Scope Sanity (P1)
   * @private
   */
  _validateEndpointScope(http_log, environment) {
    const findings = [];

    for (const entry of http_log) {
      // Check for deprecated endpoints
      if (entry.url.includes('/workflows/v2') || entry.url.includes('/workflows/v1')) {
        findings.push({
          priority: 'P1',
          category: 'Endpoint/Scope',
          description: 'Using deprecated workflow API endpoint',
          evidence: `${entry.verb} ${entry.url} - Should use /automation/v4/flows`
        });
      }

      // Check for v4 endpoint usage
      if (entry.url.includes('/automation/v4/flows')) {
        // This is correct - no finding needed
        continue;
      }

      // Check for cross-platform calls
      if (entry.url.includes('salesforce') || entry.url.includes('sfdc')) {
        findings.push({
          priority: 'P1',
          category: 'Endpoint/Scope',
          description: 'Cross-platform call detected (Salesforce) in HubSpot workflow task',
          evidence: `${entry.verb} ${entry.url}`
        });
      }

      // Check for object type support
      if (environment && environment.objectType) {
        if (environment.objectType !== 'contact' && environment.objectType !== 'CONTACT') {
          findings.push({
            priority: 'P1',
            category: 'Endpoint/Scope',
            description: 'Non-contact workflows not supported via API (deals, companies, tickets, custom objects)',
            evidence: `Object type: ${environment.objectType} - API only supports contact-based workflows`
          });
        }
      }
    }

    return findings;
  }

  /**
   * 2. Validate Safe Sequence (P1)
   * @private
   */
  _validateSequence(http_log) {
    const findings = [];

    // Track workflow operations in sequence
    const operations = http_log
      .filter(entry => entry.url.includes('/automation/v4/flows'))
      .map(entry => ({
        type: this._inferOperationType(entry),
        status: entry.status,
        url: entry.url,
        timestamp: entry.timestamp,
        flowId: this._extractFlowIdFromUrl(entry.url) || this._extractFlowIdFromResponse(entry.response_body)
      }));

    // Check for proper sequence: create → validate → patch → validate → enable
    let lastCreateOrUpdate = null;
    let hasValidationAfterMutation = false;
    let enabledBeforeValidation = false;

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];

      // Track mutations
      if (op.type === 'CREATE' || op.type === 'UPDATE') {
        lastCreateOrUpdate = op;
        hasValidationAfterMutation = false;
      }

      // Track validations (GET requests)
      if (op.type === 'GET' && lastCreateOrUpdate) {
        hasValidationAfterMutation = true;
      }

      // Check for enabling before validation
      if (op.type === 'ENABLE' && !hasValidationAfterMutation && lastCreateOrUpdate) {
        enabledBeforeValidation = true;
        findings.push({
          priority: 'P1',
          category: 'Sequence',
          description: 'Workflow enabled before validation GET request',
          evidence: `Flow ${op.flowId} enabled without GET validation after ${lastCreateOrUpdate.type}`
        });
      }
    }

    // Check for idempotency issues
    const creates = operations.filter(op => op.type === 'CREATE');
    if (creates.length > 1) {
      // Multiple creates might indicate duplicate workflows
      findings.push({
        priority: 'P2',
        category: 'Sequence',
        description: 'Multiple CREATE operations detected - may indicate lack of idempotency',
        evidence: `${creates.length} CREATE operations found - consider checking for existing workflows by name/external key first`
      });
    }

    return findings;
  }

  /**
   * 3. Prove Success (P1)
   * @private
   */
  _proveSuccess(http_log, intended_payload, assertions) {
    const findings = [];

    // Find successful create/update responses
    const mutations = http_log.filter(entry =>
      entry.url.includes('/automation/v4/flows') &&
      (entry.verb === 'POST' || entry.verb === 'PUT' || entry.verb === 'PATCH') &&
      entry.status >= 200 && entry.status < 300
    );

    if (mutations.length === 0) {
      findings.push({
        priority: 'P1',
        category: 'Graph',
        description: 'No successful CREATE/UPDATE operation found',
        evidence: 'No 2xx responses for POST/PUT/PATCH to /automation/v4/flows'
      });
      assertions[0].pass = false;
      assertions[0].failure_reason = 'No successful mutation operation';
      return findings;
    }

    // Extract flowId from mutation response
    const flowId = this._extractFlowIdFromResponse(mutations[0].response_body);

    if (!flowId) {
      findings.push({
        priority: 'P1',
        category: 'Graph',
        description: 'No flowId returned in mutation response',
        evidence: 'Response body missing flowId field'
      });
      assertions[0].pass = false;
      assertions[0].failure_reason = 'Missing flowId in response';
      return findings;
    }

    // Find subsequent GET to validate
    const validation_gets = http_log.filter(entry =>
      entry.url.includes(`/automation/v4/flows/${flowId}`) &&
      entry.verb === 'GET' &&
      entry.status === 200
    );

    if (validation_gets.length === 0) {
      findings.push({
        priority: 'P1',
        category: 'Graph',
        description: 'No GET validation performed after mutation',
        evidence: `Flow ${flowId} created/updated but not verified with GET`
      });
      assertions[0].pass = false;
      assertions[0].failure_reason = 'No validation GET after mutation';
    } else {
      // Validate graph structure
      const workflow = validation_gets[validation_gets.length - 1].response_body;

      // Check for connected graph
      const graphFindings = this._validateGraphConnectivity(workflow);
      findings.push(...graphFindings);

      if (graphFindings.length === 0) {
        assertions[1].pass = true;
        assertions[1].evidence = `Flow ${flowId} graph validated - ${workflow.actions?.length || 0} actions connected`;
      } else {
        assertions[1].pass = false;
        assertions[1].failure_reason = 'Graph connectivity issues found';
      }

      // Validate enrollment criteria
      const enrollmentFindings = this._validateEnrollmentCriteria(workflow, intended_payload);
      findings.push(...enrollmentFindings);

      if (enrollmentFindings.length === 0) {
        assertions[2].pass = true;
        assertions[2].evidence = `Enrollment criteria matches intent`;
      } else {
        assertions[2].pass = false;
        assertions[2].failure_reason = 'Enrollment criteria mismatch';
      }

      // Validate actions match intent
      const actionFindings = this._validateActionsMatchIntent(workflow, intended_payload);
      findings.push(...actionFindings);

      if (actionFindings.length === 0) {
        assertions[3].pass = true;
        assertions[3].evidence = `${workflow.actions?.length || 0} actions match intent`;
      } else {
        assertions[3].pass = false;
        assertions[3].failure_reason = 'Action mismatch detected';
      }

      // Mark created_or_updated as passed
      assertions[0].pass = true;
      assertions[0].evidence = `Flow ${flowId} created/updated with ${workflow.actions?.length || 0} actions`;
    }

    return findings;
  }

  /**
   * 4. Validate Branching Rules (P1)
   * @private
   */
  _validateBranchingRules(http_log, intended_payload, assertions) {
    const findings = [];

    // Check if LIST_BRANCH was claimed in intended payload
    if (intended_payload && intended_payload.actions) {
      const listBranches = intended_payload.actions.filter(action =>
        action.actionTypeId === 'LIST_BRANCH' || action.type === 'LIST_BRANCH'
      );

      if (listBranches.length > 0) {
        // Check if API accepted it (would be 400 error)
        const mutations = http_log.filter(entry =>
          entry.url.includes('/automation/v4/flows') &&
          (entry.verb === 'POST' || entry.verb === 'PUT' || entry.verb === 'PATCH')
        );

        const anyFailed = mutations.some(m => m.status === 400);

        if (anyFailed) {
          findings.push({
            priority: 'P1',
            category: 'Branching',
            description: 'LIST_BRANCH actions are not supported via API',
            evidence: `${listBranches.length} LIST_BRANCH actions in payload - API returned 400. Use Playwright for complex branching.`
          });
          assertions[4].pass = false;
          assertions[4].failure_reason = 'LIST_BRANCH claimed but API rejected';
        } else {
          // Check if it's actually in the GET response (shouldn't be)
          const gets = http_log.filter(entry =>
            entry.verb === 'GET' &&
            entry.url.includes('/automation/v4/flows') &&
            entry.status === 200
          );

          if (gets.length > 0) {
            const workflow = gets[gets.length - 1].response_body;
            const actualListBranches = workflow.actions?.filter(action =>
              action.actionTypeId === 'LIST_BRANCH'
            ) || [];

            if (actualListBranches.length === 0) {
              findings.push({
                priority: 'P1',
                category: 'Branching',
                description: 'LIST_BRANCH claimed but not present in workflow',
                evidence: 'Intended payload had LIST_BRANCH, but GET response does not'
              });
              assertions[4].pass = false;
              assertions[4].failure_reason = 'LIST_BRANCH claimed without evidence';
            }
          }
        }
      }
    }

    // Check for STATIC_BRANCH or AB_TEST_BRANCH usage (these are supported)
    const gets = http_log.filter(entry =>
      entry.verb === 'GET' &&
      entry.url.includes('/automation/v4/flows') &&
      entry.status === 200
    );

    if (gets.length > 0) {
      const workflow = gets[gets.length - 1].response_body;
      const staticBranches = workflow.actions?.filter(action =>
        action.actionTypeId === 'STATIC_BRANCH'
      ) || [];

      const abTestBranches = workflow.actions?.filter(action =>
        action.actionTypeId === 'AB_TEST_BRANCH'
      ) || [];

      // Validate STATIC_BRANCH has required fields
      for (const branch of staticBranches) {
        if (!branch.splitOnProperty) {
          findings.push({
            priority: 'P1',
            category: 'Branching',
            description: 'STATIC_BRANCH missing splitOnProperty',
            evidence: `Action ${branch.stepId || branch.id} has no splitOnProperty defined`
          });
        }
      }

      // Validate AB_TEST_BRANCH has proper distribution
      for (const branch of abTestBranches) {
        if (!branch.branches || branch.branches.length < 2) {
          findings.push({
            priority: 'P1',
            category: 'Branching',
            description: 'AB_TEST_BRANCH has fewer than 2 branches',
            evidence: `Action ${branch.stepId || branch.id} has ${branch.branches?.length || 0} branches`
          });
        }
      }
    }

    return findings;
  }

  /**
   * 5. Validate Data References (P1)
   * @private
   */
  _validateDataReferences(http_log, environment, assertions) {
    const findings = [];

    // Get the workflow from GET response
    const gets = http_log.filter(entry =>
      entry.verb === 'GET' &&
      entry.url.includes('/automation/v4/flows') &&
      entry.status === 200
    );

    if (gets.length === 0) {
      return findings; // Can't validate without GET
    }

    const workflow = gets[gets.length - 1].response_body;

    // Track all IDs that should be validated
    const idsToValidate = {
      listIds: new Set(),
      propertyNames: new Set(),
      emailTemplateIds: new Set(),
      ownerIds: new Set(),
      pipelineStageIds: new Set()
    };

    // Extract IDs from actions
    if (workflow.actions) {
      for (const action of workflow.actions) {
        // List membership actions
        if (action.actionTypeId === 'ADD_TO_LIST' || action.actionTypeId === 'REMOVE_FROM_LIST') {
          if (action.listId) idsToValidate.listIds.add(action.listId);
        }

        // Property updates
        if (action.actionTypeId === 'SET_PROPERTY_VALUE') {
          if (action.propertyName) idsToValidate.propertyNames.add(action.propertyName);
        }

        // Email actions
        if (action.actionTypeId === 'SEND_EMAIL') {
          if (action.emailTemplateId) idsToValidate.emailTemplateIds.add(action.emailTemplateId);
        }

        // Owner assignments
        if (action.actionTypeId === 'SET_OWNER') {
          if (action.ownerId) idsToValidate.ownerIds.add(action.ownerId);
        }

        // Pipeline stage updates
        if (action.actionTypeId === 'SET_PIPELINE_STAGE') {
          if (action.stageId) idsToValidate.pipelineStageIds.add(action.stageId);
        }
      }
    }

    // Check if validation requests were made for these IDs
    // In a full implementation, we'd check for auxiliary GET requests to:
    // - /lists/{listId}
    // - /properties/{propertyName}
    // - /templates/{templateId}
    // etc.

    // For now, warn if no validation was performed
    if (idsToValidate.listIds.size > 0 || idsToValidate.propertyNames.size > 0) {
      const validationGets = http_log.filter(entry =>
        entry.verb === 'GET' &&
        (entry.url.includes('/lists/') ||
         entry.url.includes('/properties/') ||
         entry.url.includes('/templates/'))
      );

      if (validationGets.length === 0) {
        findings.push({
          priority: 'P1',
          category: 'Data',
          description: 'No pre-flight validation of referenced IDs detected',
          evidence: `Workflow references ${idsToValidate.listIds.size} lists, ${idsToValidate.propertyNames.size} properties - no validation GET requests found`
        });
        assertions[6].pass = false;
        assertions[6].failure_reason = 'IDs not validated before use';
      } else {
        assertions[6].pass = true;
        assertions[6].evidence = `${validationGets.length} validation requests performed`;
      }
    }

    // Check for obviously invalid/placeholder IDs
    for (const listId of idsToValidate.listIds) {
      if (listId === null || listId === 0 || listId === '0' || listId === 'null') {
        findings.push({
          priority: 'P1',
          category: 'Data',
          description: 'Invalid/placeholder list ID detected',
          evidence: `listId: ${listId}`
        });
      }
    }

    for (const propName of idsToValidate.propertyNames) {
      if (!propName || propName === 'null' || propName === 'undefined') {
        findings.push({
          priority: 'P1',
          category: 'Data',
          description: 'Invalid/placeholder property name detected',
          evidence: `propertyName: ${propName}`
        });
      }
    }

    return findings;
  }

  /**
   * 6. Check Error Handling & Rollback (P2)
   * @private
   */
  _checkErrorHandling(http_log, assertions) {
    const findings = [];

    // Check for any 4xx/5xx responses
    const errors = http_log.filter(entry => entry.status >= 400);

    for (const error of errors) {
      // Check if subsequent operations still claimed success
      const errorIndex = http_log.indexOf(error);
      const subsequentOps = http_log.slice(errorIndex + 1);

      findings.push({
        priority: 'P2',
        category: 'ErrorHandling',
        description: `${error.status} error encountered`,
        evidence: `${error.verb} ${error.url} returned ${error.status}: ${error.response_body?.message || 'No message'}`
      });

      // Check if any successful mutations happened after error (bad)
      const successAfterError = subsequentOps.filter(entry =>
        entry.url.includes('/automation/v4/flows') &&
        (entry.verb === 'POST' || entry.verb === 'PUT') &&
        entry.status >= 200 && entry.status < 300
      );

      if (successAfterError.length > 0) {
        findings.push({
          priority: 'P1',
          category: 'ErrorHandling',
          description: 'Operations continued after error without addressing failure',
          evidence: `${successAfterError.length} successful mutations after ${error.status} error`
        });
        assertions[7].pass = false;
        assertions[7].failure_reason = 'Silent failure - error not reflected as task failure';
      }
    }

    // Check for retry attempts
    const retries = this._detectRetries(http_log);
    if (retries.length > 0) {
      findings.push({
        priority: 'P3',
        category: 'ErrorHandling',
        description: `${retries.length} retry attempts detected`,
        evidence: 'Good practice - errors triggered retries'
      });
    }

    return findings;
  }

  /**
   * 7. Check Enablement & Post-Checks (P2)
   * @private
   */
  _checkEnablement(http_log, intended_payload, assertions) {
    const findings = [];

    // Find GET response with final workflow state
    const gets = http_log.filter(entry =>
      entry.verb === 'GET' &&
      entry.url.includes('/automation/v4/flows') &&
      entry.status === 200
    );

    if (gets.length === 0) {
      return findings; // Can't validate without GET
    }

    const workflow = gets[gets.length - 1].response_body;

    // Check enabled state
    const isEnabled = workflow.enabled === true;
    const intendedEnabled = intended_payload?.enabled === true;

    if (isEnabled !== intendedEnabled) {
      findings.push({
        priority: 'P2',
        category: 'Enablement',
        description: 'Enabled state does not match intent',
        evidence: `Actual: ${isEnabled}, Intended: ${intendedEnabled}`
      });
      assertions[5].pass = false;
      assertions[5].failure_reason = `Enabled state mismatch (actual: ${isEnabled}, intended: ${intendedEnabled})`;
    } else {
      assertions[5].pass = true;
      assertions[5].evidence = `Enabled state correct: ${isEnabled}`;
    }

    // Check if manual enrollment required but workflow marked as live
    if (isEnabled && workflow.enrollmentSettings?.enrollmentType === 'MANUAL') {
      findings.push({
        priority: 'P3',
        category: 'Enablement',
        description: 'Workflow enabled but requires manual enrollment',
        evidence: 'enrollmentType: MANUAL - contacts must be manually enrolled'
      });
    }

    return findings;
  }

  /**
   * 8. Check Logging & Transparency (P3)
   * @private
   */
  _checkLogging(http_log) {
    const findings = [];

    // Check if responses are logged
    const entriesWithoutResponse = http_log.filter(entry =>
      !entry.response_body && entry.status >= 200 && entry.status < 300
    );

    if (entriesWithoutResponse.length > 0) {
      findings.push({
        priority: 'P3',
        category: 'Logging',
        description: `${entriesWithoutResponse.length} successful requests missing response bodies`,
        evidence: 'Cannot validate operations without response data'
      });
    }

    // Check for hallucinated IDs (IDs mentioned in summary but not in responses)
    // This would require access to task_description/summary which we'll check in scoring

    return findings;
  }

  /**
   * Helper: Validate graph connectivity
   * @private
   */
  _validateGraphConnectivity(workflow) {
    const findings = [];

    if (!workflow.actions || workflow.actions.length === 0) {
      findings.push({
        priority: 'P1',
        category: 'Graph',
        description: 'Workflow has no actions',
        evidence: 'actions array is empty or missing'
      });
      return findings;
    }

    const startActionId = workflow.startActionId;
    if (!startActionId) {
      findings.push({
        priority: 'P1',
        category: 'Graph',
        description: 'Workflow missing startActionId',
        evidence: 'No entry point defined'
      });
      return findings;
    }

    // Build graph of action IDs
    const actionIds = new Set(workflow.actions.map(a => a.id || a.stepId));

    // Check if start action exists
    if (!actionIds.has(startActionId)) {
      findings.push({
        priority: 'P1',
        category: 'Graph',
        description: 'startActionId references non-existent action',
        evidence: `startActionId: ${startActionId} not found in actions array`
      });
    }

    // Check for dangling nextActionId references
    for (const action of workflow.actions) {
      if (action.nextActionId && !actionIds.has(action.nextActionId)) {
        findings.push({
          priority: 'P1',
          category: 'Graph',
          description: 'Action references non-existent nextActionId',
          evidence: `Action ${action.id || action.stepId} -> nextActionId ${action.nextActionId} not found`
        });
      }

      // Check branches
      if (action.branches) {
        for (const branch of action.branches) {
          if (branch.actions) {
            for (const branchAction of branch.actions) {
              if (branchAction.nextActionId && !actionIds.has(branchAction.nextActionId)) {
                findings.push({
                  priority: 'P1',
                  category: 'Graph',
                  description: 'Branch action references non-existent nextActionId',
                  evidence: `Branch action ${branchAction.id} -> ${branchAction.nextActionId} not found`
                });
              }
            }
          }
        }
      }
    }

    return findings;
  }

  /**
   * Helper: Validate enrollment criteria
   * @private
   */
  _validateEnrollmentCriteria(workflow, intended_payload) {
    const findings = [];

    if (!intended_payload || !intended_payload.enrollmentCriteria) {
      return findings; // Nothing to validate
    }

    if (!workflow.enrollmentCriteria) {
      findings.push({
        priority: 'P1',
        category: 'Graph',
        description: 'Enrollment criteria missing in workflow',
        evidence: 'intended payload had enrollmentCriteria, but workflow does not'
      });
      return findings;
    }

    // Deep comparison would go here - simplified for now
    const intendedStr = JSON.stringify(intended_payload.enrollmentCriteria);
    const actualStr = JSON.stringify(workflow.enrollmentCriteria);

    if (intendedStr !== actualStr) {
      findings.push({
        priority: 'P1',
        category: 'Graph',
        description: 'Enrollment criteria does not match intent',
        evidence: `Intended: ${intendedStr.substring(0, 100)}... vs Actual: ${actualStr.substring(0, 100)}...`
      });
    }

    return findings;
  }

  /**
   * Helper: Validate actions match intent
   * @private
   */
  _validateActionsMatchIntent(workflow, intended_payload) {
    const findings = [];

    if (!intended_payload || !intended_payload.actions) {
      return findings; // Nothing to validate
    }

    const intendedCount = intended_payload.actions.length;
    const actualCount = workflow.actions?.length || 0;

    if (intendedCount !== actualCount) {
      findings.push({
        priority: 'P2',
        category: 'Graph',
        description: 'Action count mismatch',
        evidence: `Intended: ${intendedCount} actions, Actual: ${actualCount} actions`
      });
    }

    // Check action types match
    for (let i = 0; i < Math.min(intendedCount, actualCount); i++) {
      const intendedType = intended_payload.actions[i].actionTypeId || intended_payload.actions[i].type;
      const actualType = workflow.actions[i].actionTypeId || workflow.actions[i].type;

      if (intendedType !== actualType) {
        findings.push({
          priority: 'P2',
          category: 'Graph',
          description: `Action type mismatch at position ${i}`,
          evidence: `Intended: ${intendedType}, Actual: ${actualType}`
        });
      }
    }

    return findings;
  }

  /**
   * Helper: Score findings for a category
   * @private
   */
  _scoreFindings(findings, category) {
    const relevantFindings = findings.filter(f => f.category === category);

    if (relevantFindings.length === 0) {
      return 10; // Perfect score
    }

    const p1Count = relevantFindings.filter(f => f.priority === 'P1').length;
    const p2Count = relevantFindings.filter(f => f.priority === 'P2').length;
    const p3Count = relevantFindings.filter(f => f.priority === 'P3').length;

    // Deduct points based on priority
    let score = 10;
    score -= p1Count * 5; // P1 = -5 points each
    score -= p2Count * 2; // P2 = -2 points each
    score -= p3Count * 1; // P3 = -1 point each

    return Math.max(0, score); // Floor at 0
  }

  /**
   * Helper: Generate recommended fixes
   * @private
   */
  _generateRecommendedFixes(findings, assertions) {
    const fixes = [];

    // Group findings by category
    const p1Findings = findings.filter(f => f.priority === 'P1');

    for (const finding of p1Findings) {
      switch (finding.category) {
        case 'Endpoint/Scope':
          if (finding.description.includes('deprecated')) {
            fixes.push('Update code to use /automation/v4/flows instead of v1/v2 endpoints');
          }
          if (finding.description.includes('Non-contact workflows')) {
            fixes.push('Use HubSpot UI for deal/company/ticket workflows - API only supports contacts');
          }
          break;

        case 'Sequence':
          if (finding.description.includes('enabled before validation')) {
            fixes.push('Add GET validation request after mutation before enabling workflow');
          }
          if (finding.description.includes('idempotency')) {
            fixes.push('Check for existing workflows by name/externalKey before creating new ones');
          }
          break;

        case 'Graph':
          if (finding.description.includes('nextActionId')) {
            fixes.push(`Re-run PATCH with corrected nextActionId - ${finding.evidence}`);
          }
          if (finding.description.includes('no actions')) {
            fixes.push('Add at least one action to the workflow before enabling');
          }
          break;

        case 'Branching':
          if (finding.description.includes('LIST_BRANCH')) {
            fixes.push('Replace LIST_BRANCH with STATIC_BRANCH or use Playwright for complex branching');
          }
          if (finding.description.includes('splitOnProperty')) {
            fixes.push('Add splitOnProperty field to STATIC_BRANCH action');
          }
          break;

        case 'Data':
          if (finding.description.includes('validation')) {
            fixes.push('Add pre-flight validation: fetch lists, properties, templates before referencing in workflow');
          }
          if (finding.description.includes('Invalid/placeholder')) {
            fixes.push(`Replace invalid ID: ${finding.evidence}`);
          }
          break;

        case 'ErrorHandling':
          if (finding.description.includes('Silent failure')) {
            fixes.push('Implement error handling - throw exception on 4xx/5xx instead of continuing');
          }
          break;
      }
    }

    // Add assertion-based fixes
    const failedAssertions = assertions.filter(a => !a.pass);
    for (const assertion of failedAssertions) {
      if (assertion.name === 'created_or_updated' && !assertion.pass) {
        fixes.push('Verify API response - ensure 200/201 status and flowId in response body');
      }
      if (assertion.name === 'graph_is_connected' && !assertion.pass) {
        fixes.push('Fix graph connectivity - ensure all nextActionId references are valid');
      }
      if (assertion.name === 'ids_validated' && !assertion.pass) {
        fixes.push('Add ID validation: GET /lists/{id}, /properties/{name}, /templates/{id} before use');
      }
    }

    return fixes;
  }

  /**
   * Helper: Determine overall status
   * @private
   */
  _determineOverallStatus(assertions, findings) {
    const failedAssertions = assertions.filter(a => !a.pass);
    const p1Findings = findings.filter(f => f.priority === 'P1');

    if (failedAssertions.length > 0 || p1Findings.length > 0) {
      // Check if it's a partial success
      const createdOrUpdated = assertions.find(a => a.name === 'created_or_updated');
      if (createdOrUpdated && createdOrUpdated.pass) {
        return 'PARTIAL'; // Workflow exists but has issues
      }
      return 'FAIL';
    }

    return 'PASS';
  }

  /**
   * Helper: Generate executive summary
   * @private
   */
  _generateSummary(overall_status, scorecard, findings, task_description) {
    const avgScore = Object.values(scorecard).reduce((a, b) => a + b, 0) / Object.keys(scorecard).length;
    const p1Count = findings.filter(f => f.priority === 'P1').length;
    const p2Count = findings.filter(f => f.priority === 'P2').length;

    let summary = `Audit Status: ${overall_status}. `;
    summary += `Average score: ${avgScore.toFixed(1)}/10. `;

    if (p1Count > 0) {
      summary += `Found ${p1Count} P1 issues. `;
    }
    if (p2Count > 0) {
      summary += `Found ${p2Count} P2 issues. `;
    }

    if (overall_status === 'PASS') {
      summary += `Task "${task_description}" completed successfully with evidence.`;
    } else if (overall_status === 'PARTIAL') {
      summary += `Task "${task_description}" partially completed but has validation issues.`;
    } else {
      summary += `Task "${task_description}" failed validation.`;
    }

    return summary;
  }

  /**
   * Helper: Infer operation type from HTTP entry
   * @private
   */
  _inferOperationType(entry) {
    if (entry.verb === 'POST') return 'CREATE';
    if (entry.verb === 'PUT') return 'UPDATE';
    if (entry.verb === 'PATCH') {
      // Check if enabling
      if (entry.request_body && entry.request_body.enabled === true) {
        return 'ENABLE';
      }
      return 'UPDATE';
    }
    if (entry.verb === 'GET') return 'GET';
    if (entry.verb === 'DELETE') return 'DELETE';
    return 'UNKNOWN';
  }

  /**
   * Helper: Extract flowId from URL
   * @private
   */
  _extractFlowIdFromUrl(url) {
    const match = url.match(/\/automation\/v4\/flows\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Helper: Extract flowId from response body
   * @private
   */
  _extractFlowIdFromResponse(response_body) {
    if (!response_body) return null;
    return response_body.id || response_body.flowId || null;
  }

  /**
   * Helper: Detect retry attempts
   * @private
   */
  _detectRetries(http_log) {
    const retries = [];

    for (let i = 1; i < http_log.length; i++) {
      const prev = http_log[i - 1];
      const curr = http_log[i];

      // Same request after failure
      if (prev.verb === curr.verb &&
          prev.url === curr.url &&
          prev.status >= 400 &&
          curr.status < 400) {
        retries.push({
          originalIndex: i - 1,
          retryIndex: i,
          succeeded: curr.status < 300
        });
      }
    }

    return retries;
  }
}

module.exports = HubSpotWorkflowAuditor;
