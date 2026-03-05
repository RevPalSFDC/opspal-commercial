/**
 * List-Workflow Pairing Validator
 *
 * Validates associations between HubSpot lists and workflows to ensure
 * proper enrollment and prevent orphaned list/workflow configurations.
 *
 * Related reflections: 44f17e3e
 * ROI: $3,000/yr
 *
 * @module list-workflow-pairing-validator
 */

const fs = require('fs');
const path = require('path');

// Enrollment trigger types that use lists
const LIST_ENROLLMENT_TRIGGERS = [
  'LIST_MEMBERSHIP',
  'CONTACT_LIST_MEMBERSHIP',
  'COMPANY_LIST_MEMBERSHIP'
];

// Workflow action types that modify lists
const LIST_MODIFYING_ACTIONS = [
  'ADD_TO_LIST',
  'REMOVE_FROM_LIST',
  'ADD_TO_STATIC_LIST',
  'REMOVE_FROM_STATIC_LIST'
];

/**
 * Parse workflow definition to extract list references
 * @param {Object} workflow - Workflow definition
 * @returns {Object} Extracted list references
 */
function extractListReferences(workflow) {
  const result = {
    workflowId: workflow.id,
    workflowName: workflow.name,
    enrollmentLists: [],
    actionLists: [],
    suppressionLists: [],
    allListIds: new Set()
  };

  // Check enrollment triggers
  if (workflow.enrollmentCriteria?.triggers) {
    for (const trigger of workflow.enrollmentCriteria.triggers) {
      if (LIST_ENROLLMENT_TRIGGERS.includes(trigger.type)) {
        const listId = trigger.listId || trigger.sourceListId;
        if (listId) {
          result.enrollmentLists.push({
            listId,
            triggerType: trigger.type
          });
          result.allListIds.add(listId);
        }
      }
    }
  }

  // Check actions
  if (workflow.actions) {
    for (const action of workflow.actions) {
      if (LIST_MODIFYING_ACTIONS.includes(action.type)) {
        const listId = action.listId || action.targetListId;
        if (listId) {
          result.actionLists.push({
            listId,
            actionType: action.type
          });
          result.allListIds.add(listId);
        }
      }
    }
  }

  // Check suppression lists
  if (workflow.suppressionListIds) {
    for (const listId of workflow.suppressionListIds) {
      result.suppressionLists.push({ listId });
      result.allListIds.add(listId);
    }
  }

  result.allListIds = [...result.allListIds];
  return result;
}

/**
 * Validate list exists and is active
 * @param {string} listId - List ID to validate
 * @param {Object[]} availableLists - Available lists in the portal
 * @returns {Object} Validation result
 */
function validateListExists(listId, availableLists) {
  const result = {
    listId,
    exists: false,
    isActive: false,
    listName: null,
    listType: null,
    error: null
  };

  const list = availableLists.find(l =>
    l.listId === listId ||
    l.id === listId ||
    String(l.listId) === String(listId)
  );

  if (list) {
    result.exists = true;
    result.listName = list.name;
    result.listType = list.listType || list.type;
    result.isActive = !list.deleted && !list.archived;

    if (list.deleted) {
      result.error = 'List has been deleted';
    } else if (list.archived) {
      result.error = 'List is archived';
    }
  } else {
    result.error = `List ${listId} not found`;
  }

  return result;
}

/**
 * Validate workflow-list pairings
 * @param {Object} workflow - Workflow definition
 * @param {Object[]} availableLists - Available lists in the portal
 * @returns {Object} Validation result
 */
function validateWorkflowListPairings(workflow, availableLists) {
  const result = {
    workflowId: workflow.id,
    workflowName: workflow.name,
    valid: true,
    issues: [],
    warnings: [],
    listValidations: []
  };

  // Extract list references
  const refs = extractListReferences(workflow);

  // Validate each list
  for (const listId of refs.allListIds) {
    const listValidation = validateListExists(listId, availableLists);
    result.listValidations.push(listValidation);

    if (!listValidation.exists) {
      result.valid = false;
      result.issues.push({
        type: 'list_not_found',
        listId,
        message: `Referenced list ${listId} does not exist`,
        recommendation: 'Remove reference or create the list'
      });
    } else if (!listValidation.isActive) {
      result.valid = false;
      result.issues.push({
        type: 'list_inactive',
        listId,
        listName: listValidation.listName,
        message: `Referenced list "${listValidation.listName}" is ${listValidation.error}`,
        recommendation: 'Restore the list or update the workflow'
      });
    }
  }

  // Check for enrollment list type mismatches
  for (const enrollment of refs.enrollmentLists) {
    const listValidation = result.listValidations.find(v => v.listId === enrollment.listId);
    if (listValidation?.exists && listValidation.listType === 'STATIC') {
      result.warnings.push({
        type: 'static_list_enrollment',
        listId: enrollment.listId,
        listName: listValidation.listName,
        message: 'Using static list for enrollment - contacts added after workflow activation won\'t be enrolled',
        recommendation: 'Consider using an active list or smart list for automatic enrollment'
      });
    }
  }

  // Check for circular list operations
  const enrollmentListIds = refs.enrollmentLists.map(e => e.listId);
  for (const action of refs.actionLists) {
    if (action.actionType === 'ADD_TO_LIST' && enrollmentListIds.includes(action.listId)) {
      result.warnings.push({
        type: 'circular_list_operation',
        listId: action.listId,
        message: 'Workflow adds contacts to the same list used for enrollment - may cause re-enrollment loops',
        recommendation: 'Configure re-enrollment settings or use a different list'
      });
    }
  }

  return result;
}

/**
 * Find orphaned lists (not used by any workflow)
 * @param {Object[]} lists - All lists in portal
 * @param {Object[]} workflows - All workflows in portal
 * @returns {Object} Orphan detection result
 */
function findOrphanedLists(lists, workflows) {
  const result = {
    orphanedLists: [],
    usedListIds: new Set(),
    totalLists: lists.length,
    totalWorkflows: workflows.length
  };

  // Collect all list IDs used in workflows
  for (const workflow of workflows) {
    const refs = extractListReferences(workflow);
    for (const listId of refs.allListIds) {
      result.usedListIds.add(String(listId));
    }
  }

  // Find lists not used by any workflow
  for (const list of lists) {
    const listId = String(list.listId || list.id);
    if (!result.usedListIds.has(listId)) {
      result.orphanedLists.push({
        listId,
        listName: list.name,
        listType: list.listType || list.type,
        memberCount: list.size || list.memberCount || 0,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt
      });
    }
  }

  result.usedListIds = [...result.usedListIds];
  return result;
}

/**
 * Find orphaned workflows (enrollment list deleted)
 * @param {Object[]} workflows - All workflows in portal
 * @param {Object[]} lists - All lists in portal
 * @returns {Object} Orphan detection result
 */
function findOrphanedWorkflows(workflows, lists) {
  const result = {
    orphanedWorkflows: [],
    healthyWorkflows: [],
    totalWorkflows: workflows.length
  };

  const listIds = new Set(lists.map(l => String(l.listId || l.id)));

  for (const workflow of workflows) {
    const refs = extractListReferences(workflow);
    const missingLists = [];

    for (const listId of refs.allListIds) {
      if (!listIds.has(String(listId))) {
        missingLists.push(listId);
      }
    }

    if (missingLists.length > 0) {
      result.orphanedWorkflows.push({
        workflowId: workflow.id,
        workflowName: workflow.name,
        missingListIds: missingLists,
        status: workflow.enabled ? 'ACTIVE' : 'INACTIVE',
        recommendation: workflow.enabled
          ? 'Workflow is active but references deleted lists - may cause enrollment failures'
          : 'Deactivate and update workflow before reactivating'
      });
    } else {
      result.healthyWorkflows.push({
        workflowId: workflow.id,
        workflowName: workflow.name
      });
    }
  }

  return result;
}

/**
 * Generate pairing report
 * @param {Object[]} workflows - All workflows
 * @param {Object[]} lists - All lists
 * @returns {Object} Comprehensive report
 */
function generatePairingReport(workflows, lists) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalWorkflows: workflows.length,
      totalLists: lists.length,
      orphanedWorkflows: 0,
      orphanedLists: 0,
      healthyPairings: 0,
      issues: 0,
      warnings: 0
    },
    workflowValidations: [],
    orphanedLists: [],
    orphanedWorkflows: [],
    recommendations: []
  };

  // Validate each workflow
  for (const workflow of workflows) {
    const validation = validateWorkflowListPairings(workflow, lists);
    report.workflowValidations.push(validation);

    report.summary.issues += validation.issues.length;
    report.summary.warnings += validation.warnings.length;

    if (validation.valid && validation.listValidations.length > 0) {
      report.summary.healthyPairings++;
    }
  }

  // Find orphans
  const orphanedListsResult = findOrphanedLists(lists, workflows);
  report.orphanedLists = orphanedListsResult.orphanedLists;
  report.summary.orphanedLists = orphanedListsResult.orphanedLists.length;

  const orphanedWorkflowsResult = findOrphanedWorkflows(workflows, lists);
  report.orphanedWorkflows = orphanedWorkflowsResult.orphanedWorkflows;
  report.summary.orphanedWorkflows = orphanedWorkflowsResult.orphanedWorkflows.length;

  // Generate recommendations
  if (report.summary.orphanedWorkflows > 0) {
    report.recommendations.push({
      priority: 'high',
      message: `${report.summary.orphanedWorkflows} workflow(s) reference deleted lists`,
      action: 'Review and update workflows to reference existing lists'
    });
  }

  if (report.summary.orphanedLists > 10) {
    report.recommendations.push({
      priority: 'medium',
      message: `${report.summary.orphanedLists} list(s) are not used by any workflow`,
      action: 'Consider archiving or deleting unused lists'
    });
  }

  if (report.summary.warnings > 0) {
    report.recommendations.push({
      priority: 'low',
      message: `${report.summary.warnings} configuration warning(s) detected`,
      action: 'Review warnings for potential optimization opportunities'
    });
  }

  return report;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'validate-workflow':
      if (!args[1] || !args[2]) {
        console.error('Usage: list-workflow-pairing-validator.js validate-workflow <workflow-json> <lists-json>');
        process.exit(1);
      }
      const workflow = JSON.parse(fs.readFileSync(args[1], 'utf8'));
      const listsForWorkflow = JSON.parse(fs.readFileSync(args[2], 'utf8'));
      const validation = validateWorkflowListPairings(workflow, listsForWorkflow);
      console.log(JSON.stringify(validation, null, 2));
      process.exit(validation.valid ? 0 : 1);
      break;

    case 'find-orphans':
      if (!args[1] || !args[2]) {
        console.error('Usage: list-workflow-pairing-validator.js find-orphans <workflows-json> <lists-json>');
        process.exit(1);
      }
      const workflows = JSON.parse(fs.readFileSync(args[1], 'utf8'));
      const lists = JSON.parse(fs.readFileSync(args[2], 'utf8'));
      const orphanedLists = findOrphanedLists(lists, workflows);
      const orphanedWorkflows = findOrphanedWorkflows(workflows, lists);
      console.log(JSON.stringify({ orphanedLists, orphanedWorkflows }, null, 2));
      break;

    case 'report':
      if (!args[1] || !args[2]) {
        console.error('Usage: list-workflow-pairing-validator.js report <workflows-json> <lists-json>');
        process.exit(1);
      }
      const allWorkflows = JSON.parse(fs.readFileSync(args[1], 'utf8'));
      const allLists = JSON.parse(fs.readFileSync(args[2], 'utf8'));
      const report = generatePairingReport(allWorkflows, allLists);
      console.log(JSON.stringify(report, null, 2));
      break;

    default:
      console.log(`List-Workflow Pairing Validator

Usage:
  list-workflow-pairing-validator.js validate-workflow <workflow> <lists>  Validate single workflow
  list-workflow-pairing-validator.js find-orphans <workflows> <lists>      Find orphaned lists/workflows
  list-workflow-pairing-validator.js report <workflows> <lists>            Generate full report

Validates:
  - Referenced lists exist and are active
  - Static list enrollment warnings
  - Circular list operations (enrollment + add to same list)
  - Orphaned lists (not used by any workflow)
  - Orphaned workflows (enrollment list deleted)

Input Format:
  All inputs should be JSON files with arrays of objects.

  Workflow object should have:
  - id, name, enrollmentCriteria, actions, suppressionListIds

  List object should have:
  - listId (or id), name, listType, deleted, archived

Examples:
  # Validate a workflow
  node list-workflow-pairing-validator.js validate-workflow workflow.json lists.json

  # Generate full report
  node list-workflow-pairing-validator.js report workflows.json lists.json

  # Find orphans
  node list-workflow-pairing-validator.js find-orphans workflows.json lists.json
`);
  }
}

module.exports = {
  LIST_ENROLLMENT_TRIGGERS,
  LIST_MODIFYING_ACTIONS,
  extractListReferences,
  validateListExists,
  validateWorkflowListPairings,
  findOrphanedLists,
  findOrphanedWorkflows,
  generatePairingReport
};
