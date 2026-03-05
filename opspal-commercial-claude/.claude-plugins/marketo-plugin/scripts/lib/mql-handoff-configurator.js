/**
 * MQL Handoff Configurator for Marketo
 *
 * Configures MQL qualification and sales handoff workflows:
 * - MQL trigger campaign creation
 * - Lead assignment configuration
 * - Sales alert setup
 * - SLA monitoring campaigns
 * - Recycle workflow configuration
 *
 * @module mql-handoff-configurator
 * @version 1.0.0
 */

'use strict';

// Lead lifecycle stages
const LIFECYCLE_STAGES = {
  ANONYMOUS: 'Anonymous',
  KNOWN: 'Known',
  ENGAGED: 'Engaged',
  MQL: 'Marketing Qualified Lead',
  SAL: 'Sales Accepted Lead',
  SQL: 'Sales Qualified Lead',
  OPPORTUNITY: 'Opportunity',
  CUSTOMER: 'Customer',
  RECYCLED: 'Recycled',
  DISQUALIFIED: 'Disqualified',
};

// Assignment methods
const ASSIGNMENT_METHODS = {
  ROUND_ROBIN: 'round_robin',
  TERRITORY: 'territory',
  ACCOUNT_BASED: 'account_based',
  NAMED_ACCOUNT: 'named_account',
  QUEUE: 'queue',
};

// SLA tiers
const SLA_TIERS = {
  HOT: { label: 'Hot Lead', firstContact: 1, followUp: 4, escalation: 8 }, // hours
  STANDARD: { label: 'Standard MQL', firstContact: 4, followUp: 24, escalation: 48 },
  RECYCLED: { label: 'Recycled Lead', firstContact: 24, followUp: 48, escalation: 72 },
};

// Default MQL criteria
const DEFAULT_MQL_CRITERIA = {
  scoreThresholds: {
    behavior: 50,
    demographic: 40,
    combined: null, // Use if single score
  },
  requiredFields: [
    'Email Address',
    'First Name',
    'Last Name',
    'Company',
  ],
  recommendedFields: [
    'Phone Number',
    'Job Title',
  ],
  exclusions: [
    { type: 'list', name: 'Competitors', reason: 'competitive intelligence' },
    { type: 'field', name: 'Unsubscribed', value: true, reason: 'opted out' },
    { type: 'field', name: 'Lead Status', value: 'Customer', reason: 'existing customer' },
    { type: 'field', name: 'Lead Status', value: 'Disqualified', reason: 'previously disqualified' },
  ],
  coolingOffDays: 30, // Days before recycled lead can re-MQL
};

/**
 * Create campaign configuration
 * @param {string} name - Campaign name
 * @param {string} type - Campaign type
 * @param {Object} smartList - Smart list config
 * @param {Array} flowSteps - Flow steps
 * @returns {Object} Campaign configuration
 */
function createCampaignConfig(name, type, smartList, flowSteps) {
  return {
    name,
    type,
    smartList,
    flowSteps,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create MQL trigger campaign configuration
 * @param {Object} criteria - MQL qualification criteria
 * @returns {Object} Campaign configuration
 */
function createMqlTrigger(criteria = DEFAULT_MQL_CRITERIA) {
  const { scoreThresholds, requiredFields, exclusions, coolingOffDays } = criteria;

  // Build trigger
  const triggers = [];
  if (scoreThresholds.behavior) {
    triggers.push({
      type: 'Score is Changed',
      attributes: {
        scoreName: 'Behavior Score',
        newScoreOperator: 'at least',
        newScoreValue: scoreThresholds.behavior,
      },
    });
  } else if (scoreThresholds.combined) {
    triggers.push({
      type: 'Score is Changed',
      attributes: {
        scoreName: 'Score',
        newScoreOperator: 'at least',
        newScoreValue: scoreThresholds.combined,
      },
    });
  }

  // Build filters
  const filters = [];

  // Score threshold filter (demographic)
  if (scoreThresholds.demographic) {
    filters.push({
      type: 'Demographic Score',
      operator: 'is at least',
      value: scoreThresholds.demographic,
    });
  }

  // Required fields
  for (const field of requiredFields) {
    filters.push({
      type: field,
      operator: 'is not empty',
    });
  }

  // Exclusions
  for (const exclusion of exclusions) {
    if (exclusion.type === 'list') {
      filters.push({
        type: 'NOT Member of Static List',
        value: exclusion.name,
      });
    } else if (exclusion.type === 'field') {
      filters.push({
        type: exclusion.name,
        operator: exclusion.value === true ? 'is not' : 'is not',
        value: exclusion.value,
      });
    }
  }

  // Cooling off for recycled leads
  filters.push({
    type: 'NOT MQL Date',
    operator: 'in past',
    value: coolingOffDays,
    unit: 'days',
  });

  // Build flow steps
  const flowSteps = [
    {
      type: 'Change Data Value',
      attributes: {
        field: 'Lead Status',
        newValue: 'MQL',
      },
    },
    {
      type: 'Change Data Value',
      attributes: {
        field: 'MQL Date',
        newValue: '{{system.date}}',
      },
    },
    {
      type: 'Change Data Value',
      attributes: {
        field: 'Lifecycle Stage',
        newValue: LIFECYCLE_STAGES.MQL,
      },
    },
    {
      type: 'Request Campaign',
      attributes: {
        campaign: 'Sync Lead to SFDC',
      },
    },
  ];

  return createCampaignConfig(
    'MQL Qualification Trigger',
    'trigger',
    { triggers, filters },
    flowSteps
  );
}

/**
 * Configure lead assignment rules
 * @param {string} method - Assignment method
 * @param {Object} config - Method-specific configuration
 * @returns {Object} Assignment configuration
 */
function configureLeadAssignment(method, config = {}) {
  const configurations = {
    [ASSIGNMENT_METHODS.ROUND_ROBIN]: () => ({
      method: 'round_robin',
      name: 'Round Robin Assignment',
      flowStep: {
        type: 'Assign Lead Owner',
        attributes: {
          assignmentRule: config.ruleName || 'Sales Round Robin',
        },
      },
      requirements: [
        'Create assignment rule in Admin > Sales > Lead Assignment Rules',
        'Add sales users to assignment rule',
        'Configure business hours (optional)',
      ],
    }),

    [ASSIGNMENT_METHODS.TERRITORY]: () => ({
      method: 'territory',
      name: 'Territory-Based Assignment',
      flowStep: {
        type: 'Choice',
        choices: (config.territories || []).map(territory => ({
          condition: {
            type: territory.field || 'State',
            operator: 'is any',
            values: territory.values,
          },
          action: {
            type: 'Change Owner',
            value: territory.owner,
          },
        })),
        default: {
          type: 'Change Owner',
          value: config.defaultOwner || 'New Lead Queue',
        },
      },
      requirements: [
        'Define territory mapping',
        'Create queues for each territory',
        'Configure default assignment',
      ],
    }),

    [ASSIGNMENT_METHODS.ACCOUNT_BASED]: () => ({
      method: 'account_based',
      name: 'Account-Based Assignment',
      flowStep: {
        type: 'Choice',
        choices: [
          {
            condition: {
              type: 'Account Owner',
              operator: 'is not empty',
            },
            action: {
              type: 'Change Owner',
              value: '{{lead.Account Owner}}',
            },
          },
        ],
        default: {
          type: 'Assign Lead Owner',
          attributes: {
            assignmentRule: config.defaultRule || 'New Business Queue',
          },
        },
      },
      requirements: [
        'SFDC Account matching configured',
        'Account Owner field synced',
        'Default queue for unmatched leads',
      ],
    }),

    [ASSIGNMENT_METHODS.NAMED_ACCOUNT]: () => ({
      method: 'named_account',
      name: 'Named Account Assignment',
      flowStep: {
        type: 'Choice',
        choices: [
          {
            condition: {
              type: 'Member of Static List',
              value: config.targetAccountList || 'Target Accounts',
            },
            action: {
              type: 'Change Owner',
              value: '{{lead.Named Account Owner}}',
            },
          },
        ],
        default: {
          type: 'Assign Lead Owner',
          attributes: {
            assignmentRule: config.defaultRule || 'Standard Assignment',
          },
        },
      },
      requirements: [
        'Target account list maintained',
        'Named Account Owner field populated',
        'ABM integration configured',
      ],
    }),

    [ASSIGNMENT_METHODS.QUEUE]: () => ({
      method: 'queue',
      name: 'Queue Assignment',
      flowStep: {
        type: 'Change Owner',
        attributes: {
          newOwner: config.queueName || 'New Lead Queue',
        },
      },
      requirements: [
        'SFDC Queue created',
        'Queue members assigned',
        'Queue routing rules configured in SFDC',
      ],
    }),
  };

  const configFn = configurations[method];
  if (!configFn) {
    return {
      method: 'unknown',
      error: `Unknown assignment method: ${method}`,
      availableMethods: Object.keys(ASSIGNMENT_METHODS),
    };
  }

  return configFn();
}

/**
 * Create sales alert configuration
 * @param {Object} config - Alert configuration
 * @returns {Object} Alert campaign configuration
 */
function createSalesAlert(config = {}) {
  const {
    alertType = 'standard',
    includeInterestingMoments = true,
    ccManager = false,
    highValueThreshold = null,
  } = config;

  const flowSteps = [
    {
      type: 'Send Alert',
      attributes: {
        sendTo: '{{lead.Lead Owner Email Address}}',
        template: 'MQL Alert Template',
        subject: `🔥 New MQL: {{lead.First Name}} {{lead.Last Name}} at {{lead.Company}}`,
      },
    },
  ];

  // Add interesting moment
  if (includeInterestingMoments) {
    flowSteps.push({
      type: 'Interesting Moment',
      attributes: {
        type: 'Milestone',
        description: 'MQL alert sent to {{lead.Lead Owner}}',
      },
    });
  }

  // High value lead handling
  if (highValueThreshold) {
    return createCampaignConfig(
      'Sales Alert - New MQL',
      'trigger',
      {
        triggers: [{ type: 'Campaign is Requested', source: 'Assign Lead Owner' }],
        filters: [],
      },
      [
        {
          type: 'Choice',
          condition: {
            type: 'Score',
            operator: 'is at least',
            value: highValueThreshold,
          },
          actions: [
            ...flowSteps,
            ccManager ? {
              type: 'Send Alert',
              attributes: {
                sendTo: config.managerEmail || '{{lead.Lead Owner Manager Email}}',
                subject: `🎯 HIGH-VALUE MQL: {{lead.Company}} - {{lead.Job Title}}`,
              },
            } : null,
          ].filter(Boolean),
          default: flowSteps,
        },
      ]
    );
  }

  return createCampaignConfig(
    'Sales Alert - New MQL',
    'trigger',
    {
      triggers: [{ type: 'Campaign is Requested', source: 'Assign Lead Owner' }],
      filters: [],
    },
    flowSteps
  );
}

/**
 * Create SLA monitor campaign configuration
 * @param {Object} config - SLA configuration
 * @returns {Array} Array of SLA campaign configurations
 */
function createSlaMonitor(config = {}) {
  const {
    tier = 'STANDARD',
    escalationEmail = null,
    managerEmail = null,
  } = config;

  const slaConfig = SLA_TIERS[tier] || SLA_TIERS.STANDARD;
  const campaigns = [];

  // Warning campaign
  campaigns.push(createCampaignConfig(
    `SLA Warning - ${slaConfig.firstContact} Hour`,
    'batch',
    {
      triggers: [],
      filters: [
        { type: 'Lead Status', operator: 'is', value: 'MQL' },
        { type: 'MQL Date', operator: 'in past', value: slaConfig.firstContact, unit: 'hours' },
        { type: 'NOT SFDC Lead Status', operator: 'is', value: 'Working' },
        { type: 'NOT SFDC Lead Status', operator: 'is', value: 'Contacted' },
        { type: 'SLA Status', operator: 'is not', value: 'Warning' },
      ],
    },
    [
      {
        type: 'Change Data Value',
        attributes: {
          field: 'SLA Status',
          newValue: 'Warning',
        },
      },
      {
        type: 'Send Alert',
        attributes: {
          sendTo: '{{lead.Lead Owner Email Address}}',
          subject: `⚠️ SLA Warning: Follow up required for {{lead.First Name}} {{lead.Last Name}}`,
        },
      },
      {
        type: 'Interesting Moment',
        attributes: {
          type: 'Web',
          description: `${slaConfig.firstContact}-hour SLA warning sent`,
        },
      },
    ]
  ));

  // Escalation campaign
  campaigns.push(createCampaignConfig(
    `SLA Escalation - ${slaConfig.escalation} Hour`,
    'batch',
    {
      triggers: [],
      filters: [
        { type: 'Lead Status', operator: 'is', value: 'MQL' },
        { type: 'MQL Date', operator: 'before', value: slaConfig.escalation, unit: 'hours ago' },
        { type: 'NOT SFDC Lead Status', operator: 'is', value: 'Working' },
        { type: 'NOT SFDC Lead Status', operator: 'is', value: 'Contacted' },
        { type: 'SLA Status', operator: 'is', value: 'Warning' },
      ],
    },
    [
      {
        type: 'Change Data Value',
        attributes: {
          field: 'SLA Status',
          newValue: 'Escalated',
        },
      },
      {
        type: 'Send Alert',
        attributes: {
          sendTo: managerEmail || '{{lead.Lead Owner Manager Email}}',
          subject: `🚨 SLA BREACH: {{lead.First Name}} {{lead.Last Name}} needs immediate attention`,
        },
      },
      escalationEmail ? {
        type: 'Send Alert',
        attributes: {
          sendTo: escalationEmail,
          subject: `SLA Breach Report: {{lead.Lead Owner}} - {{lead.Company}}`,
        },
      } : null,
      {
        type: 'Interesting Moment',
        attributes: {
          type: 'Milestone',
          description: `${slaConfig.escalation}-hour SLA escalation - manager notified`,
        },
      },
    ].filter(Boolean)
  ));

  return campaigns;
}

/**
 * Create recycle campaign configuration
 * @param {Object} config - Recycle configuration
 * @returns {Object} Recycle campaign configuration
 */
function createRecycleCampaign(config = {}) {
  const {
    coolingOffDays = 30,
    resetBehaviorScore = true,
    nurtureProgramName = 'Lead Nurture',
    nurtureStream = 'Re-engagement Stream',
  } = config;

  const flowSteps = [
    {
      type: 'Change Data Value',
      attributes: {
        field: 'Lead Status',
        newValue: 'Recycling',
      },
    },
    {
      type: 'Change Data Value',
      attributes: {
        field: 'Recycle Reason',
        newValue: '{{trigger.New Value}}',
      },
    },
    {
      type: 'Change Data Value',
      attributes: {
        field: 'Recycle Date',
        newValue: '{{system.date}}',
      },
    },
  ];

  if (resetBehaviorScore) {
    flowSteps.push({
      type: 'Change Score',
      attributes: {
        scoreName: 'Behavior Score',
        newValue: 0,
      },
    });
  }

  flowSteps.push(
    {
      type: 'Change Data Value',
      attributes: {
        field: 'Lead Status',
        newValue: 'Nurture',
      },
    },
    {
      type: 'Change Data Value',
      attributes: {
        field: 'Lifecycle Stage',
        newValue: LIFECYCLE_STAGES.KNOWN,
      },
    },
    {
      type: 'Wait',
      attributes: {
        duration: coolingOffDays,
        unit: 'days',
      },
    },
    {
      type: 'Add to Engagement Program',
      attributes: {
        program: nurtureProgramName,
        stream: nurtureStream,
      },
    },
    {
      type: 'Interesting Moment',
      attributes: {
        type: 'Milestone',
        description: 'Recycled from MQL - returned to nurture',
      },
    }
  );

  return createCampaignConfig(
    'MQL Recycle - Sales Rejected',
    'trigger',
    {
      triggers: [
        {
          type: 'Data Value Changes',
          attributes: {
            field: 'SFDC Lead Status',
            newValue: ['Recycled', 'Rejected', 'Disqualified'],
          },
        },
      ],
      filters: [
        { type: 'Lead Status', operator: 'is any', values: ['MQL', 'SAL'] },
      ],
    },
    flowSteps
  );
}

/**
 * Validate handoff workflow configuration
 * @param {Object} config - Complete workflow configuration
 * @returns {Object} Validation results
 */
function validateHandoffWorkflow(config) {
  const issues = [];
  const recommendations = [];

  // Check MQL criteria
  if (!config.mqlTrigger) {
    issues.push({
      type: 'missing_mql_trigger',
      severity: 'error',
      message: 'MQL trigger campaign not configured',
    });
  }

  // Check assignment
  if (!config.assignment) {
    issues.push({
      type: 'missing_assignment',
      severity: 'error',
      message: 'Lead assignment not configured',
    });
  }

  // Check alerts
  if (!config.salesAlert) {
    recommendations.push({
      type: 'missing_alert',
      message: 'Sales alert not configured - sales may not be notified of new MQLs',
    });
  }

  // Check SLA
  if (!config.slaMonitor || config.slaMonitor.length === 0) {
    recommendations.push({
      type: 'missing_sla',
      message: 'SLA monitoring not configured - unable to track follow-up times',
    });
  }

  // Check recycle
  if (!config.recycleCampaign) {
    recommendations.push({
      type: 'missing_recycle',
      message: 'Recycle workflow not configured - rejected leads may not return to nurture',
    });
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    recommendations,
    summary: {
      mqlTrigger: !!config.mqlTrigger,
      assignment: !!config.assignment,
      salesAlert: !!config.salesAlert,
      slaMonitor: config.slaMonitor?.length > 0,
      recycle: !!config.recycleCampaign,
    },
  };
}

/**
 * Generate complete MQL handoff workflow
 * @param {Object} options - Configuration options
 * @returns {Object} Complete workflow configuration
 */
function generateMqlHandoffWorkflow(options = {}) {
  const {
    mqlCriteria = DEFAULT_MQL_CRITERIA,
    assignmentMethod = ASSIGNMENT_METHODS.ROUND_ROBIN,
    assignmentConfig = {},
    alertConfig = {},
    slaTier = 'STANDARD',
    slaConfig = {},
    recycleConfig = {},
  } = options;

  const workflow = {
    mqlTrigger: createMqlTrigger(mqlCriteria),
    assignment: configureLeadAssignment(assignmentMethod, assignmentConfig),
    salesAlert: createSalesAlert(alertConfig),
    slaMonitor: createSlaMonitor({ tier: slaTier, ...slaConfig }),
    recycleCampaign: createRecycleCampaign(recycleConfig),
  };

  const validation = validateHandoffWorkflow(workflow);

  return {
    workflow,
    validation,
    programStructure: {
      name: 'MQL Handoff Operations',
      folders: [
        'Qualification',
        'Salesforce Sync',
        'Notifications',
        'SLA Monitoring',
        'Recycle',
      ],
    },
    implementation: {
      order: [
        '1. Create operational program',
        '2. Configure MQL trigger campaign',
        '3. Set up SFDC sync campaign',
        '4. Configure lead assignment',
        '5. Create sales alert campaign',
        '6. Set up SLA monitoring campaigns',
        '7. Create recycle campaign',
        '8. Test with sample leads',
        '9. Activate all campaigns',
      ],
      prerequisites: [
        'Scoring model configured',
        'SFDC sync enabled',
        'Lead assignment rules created',
        'Alert email templates created',
        'SLA tracking fields created',
      ],
    },
  };
}

module.exports = {
  LIFECYCLE_STAGES,
  ASSIGNMENT_METHODS,
  SLA_TIERS,
  DEFAULT_MQL_CRITERIA,
  createCampaignConfig,
  createMqlTrigger,
  configureLeadAssignment,
  createSalesAlert,
  createSlaMonitor,
  createRecycleCampaign,
  validateHandoffWorkflow,
  generateMqlHandoffWorkflow,
};
