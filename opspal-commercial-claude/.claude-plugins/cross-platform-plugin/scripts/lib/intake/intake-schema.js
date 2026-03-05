/**
 * Project Intake Schema
 *
 * Defines the JSON schema for project intake forms including:
 * - Project identity and ownership
 * - Goals and success metrics
 * - Scope definition with assumptions/constraints
 * - Data sources and integrations
 * - Timeline and budget
 * - Dependencies and risks
 * - Technical requirements
 * - Approval workflow
 *
 * @version 1.0.0
 */

const PROJECT_TYPES = [
  'salesforce-implementation',
  'hubspot-implementation',
  'cross-platform-integration',
  'data-migration',
  'automation-build',
  'reporting-analytics',
  'cpq-configuration',
  'custom-development',
  'process-optimization',
  'security-audit'
];

const PRIORITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const PLATFORMS = ['salesforce', 'hubspot', 'both', 'other'];
const RISK_LEVELS = ['high', 'medium', 'low'];
const DEPENDENCY_TYPES = ['internal', 'external', 'technical', 'resource'];
const DEPENDENCY_STATUS = ['confirmed', 'pending', 'at-risk'];
const BUDGET_RANGES = ['<$5k', '$5k-$15k', '$15k-$50k', '$50k-$100k', '>$100k', 'TBD'];
const BUDGET_FLEXIBILITY = ['fixed', 'some-flexibility', 'flexible'];
const COMPLEXITY_LEVELS = ['simple', 'moderate', 'complex', 'enterprise'];
const NOTIFICATION_LEVELS = ['all-updates', 'milestones-only', 'completion-only'];
const APPROVAL_TYPES = ['technical', 'business', 'budget', 'executive'];
const COMMUNICATION_CHANNELS = ['slack', 'email', 'asana', 'teams'];
const UPDATE_FREQUENCIES = ['daily', 'weekly', 'bi-weekly', 'milestone-only'];
const DATA_SOURCE_TYPES = ['salesforce', 'hubspot', 'csv', 'api', 'database', 'spreadsheet', 'other'];
const DATA_FLOW_TYPES = ['unidirectional', 'bidirectional'];
const SF_ORG_TYPES = ['production', 'sandbox', 'developer', 'scratch'];
const HUBSPOT_TIERS = ['starter', 'professional', 'enterprise'];

/**
 * Main intake schema definition
 */
const intakeSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Project Intake Form",
  "description": "Comprehensive project intake form for RevOps and platform implementation projects",
  "type": "object",
  "properties": {
    // === Section 1: Project Identity ===
    "projectIdentity": {
      "type": "object",
      "title": "Project Identity",
      "description": "Basic project information and ownership",
      "required": ["projectName", "projectType", "projectOwner"],
      "properties": {
        "projectName": {
          "type": "string",
          "title": "Project Name",
          "description": "Descriptive name for this project",
          "minLength": 3,
          "maxLength": 100
        },
        "projectCode": {
          "type": "string",
          "title": "Project Code",
          "description": "Optional internal project code/reference",
          "maxLength": 20
        },
        "projectType": {
          "type": "string",
          "title": "Project Type",
          "description": "Category of work being requested",
          "enum": PROJECT_TYPES
        },
        "projectOwner": {
          "type": "object",
          "title": "Project Owner",
          "description": "Primary point of contact and decision maker",
          "required": ["name", "email"],
          "properties": {
            "name": {
              "type": "string",
              "title": "Name",
              "minLength": 2
            },
            "email": {
              "type": "string",
              "title": "Email",
              "format": "email"
            },
            "role": {
              "type": "string",
              "title": "Role/Title"
            },
            "phone": {
              "type": "string",
              "title": "Phone"
            },
            "department": {
              "type": "string",
              "title": "Department"
            }
          }
        },
        "stakeholders": {
          "type": "array",
          "title": "Additional Stakeholders",
          "description": "Other people who need visibility or have input",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "email": { "type": "string", "format": "email" },
              "role": { "type": "string" },
              "notificationLevel": {
                "type": "string",
                "enum": NOTIFICATION_LEVELS,
                "default": "milestones-only"
              }
            }
          }
        },
        "requestDate": {
          "type": "string",
          "title": "Request Date",
          "format": "date"
        }
      }
    },

    // === Section 2: Goals & Objectives ===
    "goalsObjectives": {
      "type": "object",
      "title": "Goals & Objectives",
      "description": "Business objectives and success criteria",
      "required": ["businessObjective", "successMetrics"],
      "properties": {
        "businessObjective": {
          "type": "string",
          "title": "Primary Business Objective",
          "description": "What business problem does this project solve? Why is it needed?",
          "minLength": 20
        },
        "secondaryObjectives": {
          "type": "array",
          "title": "Secondary Objectives",
          "description": "Additional goals this project should achieve",
          "items": { "type": "string" }
        },
        "successMetrics": {
          "type": "array",
          "title": "Success Metrics (KPIs)",
          "description": "How will we measure if this project succeeded?",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["metric"],
            "properties": {
              "metric": {
                "type": "string",
                "title": "Metric Name"
              },
              "currentValue": {
                "type": "string",
                "title": "Current Value"
              },
              "targetValue": {
                "type": "string",
                "title": "Target Value"
              },
              "measurementMethod": {
                "type": "string",
                "title": "How Measured"
              }
            }
          }
        },
        "expectedOutcome": {
          "type": "string",
          "title": "Expected Outcome",
          "description": "Describe the ideal end state when this project is complete"
        },
        "businessImpact": {
          "type": "string",
          "title": "Business Impact",
          "description": "What happens if we don't do this project?"
        }
      }
    },

    // === Section 3: Scope Definition ===
    "scope": {
      "type": "object",
      "title": "Project Scope",
      "description": "What is and isn't included in this project",
      "required": ["inScope"],
      "properties": {
        "inScope": {
          "type": "array",
          "title": "In Scope",
          "description": "Features and deliverables included in this project",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["feature"],
            "properties": {
              "feature": {
                "type": "string",
                "title": "Feature/Deliverable"
              },
              "description": {
                "type": "string",
                "title": "Description"
              },
              "priority": {
                "type": "string",
                "enum": PRIORITY_LEVELS,
                "default": "medium"
              },
              "platform": {
                "type": "string",
                "enum": PLATFORMS
              },
              "acceptanceCriteria": {
                "type": "array",
                "title": "Acceptance Criteria",
                "items": { "type": "string" }
              }
            }
          }
        },
        "outOfScope": {
          "type": "array",
          "title": "Out of Scope",
          "description": "Explicitly excluded items (prevents scope creep)",
          "items": { "type": "string" }
        },
        "assumptions": {
          "type": "array",
          "title": "Assumptions",
          "description": "Things we're assuming to be true",
          "items": {
            "type": "object",
            "properties": {
              "assumption": { "type": "string" },
              "riskIfInvalid": {
                "type": "string",
                "enum": RISK_LEVELS,
                "default": "medium"
              },
              "validatedBy": { "type": "string" },
              "validatedDate": { "type": "string", "format": "date" }
            }
          }
        },
        "constraints": {
          "type": "array",
          "title": "Constraints",
          "description": "Limitations or restrictions on the project",
          "items": { "type": "string" }
        },
        "phasing": {
          "type": "array",
          "title": "Phasing (if applicable)",
          "description": "Break project into phases if needed",
          "items": {
            "type": "object",
            "properties": {
              "phaseName": { "type": "string" },
              "phaseDescription": { "type": "string" },
              "features": { "type": "array", "items": { "type": "string" } }
            }
          }
        }
      }
    },

    // === Section 4: Data Sources ===
    "dataSources": {
      "type": "object",
      "title": "Data Sources & Integrations",
      "description": "Where data comes from and where it goes",
      "properties": {
        "primaryDataSources": {
          "type": "array",
          "title": "Primary Data Sources",
          "items": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string",
                "title": "Source Name"
              },
              "type": {
                "type": "string",
                "enum": DATA_SOURCE_TYPES
              },
              "accessMethod": {
                "type": "string",
                "title": "Access Method",
                "description": "API, direct query, export, etc."
              },
              "estimatedVolume": {
                "type": "string",
                "title": "Estimated Volume",
                "description": "Number of records or data size"
              },
              "refreshFrequency": {
                "type": "string",
                "title": "Refresh Frequency",
                "description": "Real-time, daily, weekly, etc."
              },
              "accessConfirmed": {
                "type": "boolean",
                "title": "Access Confirmed",
                "default": false
              }
            }
          }
        },
        "integrations": {
          "type": "array",
          "title": "Required Integrations",
          "description": "Systems that need to connect",
          "items": {
            "type": "object",
            "properties": {
              "sourceSystem": { "type": "string" },
              "targetSystem": { "type": "string" },
              "dataFlow": {
                "type": "string",
                "enum": DATA_FLOW_TYPES
              },
              "frequency": { "type": "string" },
              "dataElements": {
                "type": "array",
                "title": "Data Elements",
                "items": { "type": "string" }
              }
            }
          }
        },
        "existingAutomations": {
          "type": "array",
          "title": "Existing Automations to Consider",
          "description": "Current workflows, flows, or processes that may be affected",
          "items": { "type": "string" }
        },
        "dataQualityNotes": {
          "type": "string",
          "title": "Data Quality Notes",
          "description": "Known issues with data quality, completeness, etc."
        }
      }
    },

    // === Section 5: Timeline & Budget ===
    "timelineBudget": {
      "type": "object",
      "title": "Timeline & Budget",
      "description": "When it needs to be done and resource constraints",
      "required": ["targetStartDate", "targetEndDate"],
      "properties": {
        "targetStartDate": {
          "type": "string",
          "format": "date",
          "title": "Target Start Date"
        },
        "targetEndDate": {
          "type": "string",
          "format": "date",
          "title": "Target End Date"
        },
        "hardDeadline": {
          "type": "boolean",
          "title": "Is this a hard deadline?",
          "description": "Must be completed by this date (no flexibility)",
          "default": false
        },
        "deadlineReason": {
          "type": "string",
          "title": "Deadline Reason",
          "description": "Why is this date fixed? (e.g., fiscal year end, product launch)"
        },
        "milestones": {
          "type": "array",
          "title": "Key Milestones",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "targetDate": { "type": "string", "format": "date" },
              "description": { "type": "string" },
              "deliverables": {
                "type": "array",
                "items": { "type": "string" }
              }
            }
          }
        },
        "budgetRange": {
          "type": "string",
          "title": "Budget Range",
          "enum": BUDGET_RANGES
        },
        "budgetFlexibility": {
          "type": "string",
          "title": "Budget Flexibility",
          "enum": BUDGET_FLEXIBILITY
        },
        "budgetNotes": {
          "type": "string",
          "title": "Budget Notes",
          "description": "Any context about budget constraints or approvals"
        }
      }
    },

    // === Section 6: Dependencies & Risks ===
    "dependenciesRisks": {
      "type": "object",
      "title": "Dependencies & Risks",
      "description": "What could block or derail the project",
      "properties": {
        "dependencies": {
          "type": "array",
          "title": "Dependencies",
          "description": "Things that must happen for project to succeed",
          "items": {
            "type": "object",
            "properties": {
              "dependency": {
                "type": "string",
                "title": "Dependency"
              },
              "type": {
                "type": "string",
                "enum": DEPENDENCY_TYPES
              },
              "owner": {
                "type": "string",
                "title": "Owner/Responsible Party"
              },
              "status": {
                "type": "string",
                "enum": DEPENDENCY_STATUS,
                "default": "pending"
              },
              "expectedDate": {
                "type": "string",
                "format": "date",
                "title": "Expected Resolution Date"
              },
              "blocksIfDelayed": {
                "type": "string",
                "title": "What it blocks if delayed"
              }
            }
          }
        },
        "risks": {
          "type": "array",
          "title": "Identified Risks",
          "items": {
            "type": "object",
            "properties": {
              "risk": { "type": "string" },
              "probability": {
                "type": "string",
                "enum": RISK_LEVELS
              },
              "impact": {
                "type": "string",
                "enum": RISK_LEVELS
              },
              "mitigation": { "type": "string" },
              "owner": { "type": "string" }
            }
          }
        },
        "blockers": {
          "type": "array",
          "title": "Known Blockers",
          "description": "Issues currently blocking progress",
          "items": { "type": "string" }
        }
      }
    },

    // === Section 7: Technical Requirements ===
    "technicalRequirements": {
      "type": "object",
      "title": "Technical Requirements",
      "description": "Platform and technical details",
      "properties": {
        "platforms": {
          "type": "array",
          "title": "Target Platforms",
          "items": {
            "type": "string",
            "enum": ['salesforce', 'hubspot', 'marketo', 'monday', 'custom', 'other']
          }
        },
        "salesforceOrg": {
          "type": "object",
          "title": "Salesforce Details",
          "description": "Required if Salesforce is a target platform",
          "properties": {
            "orgAlias": {
              "type": "string",
              "title": "Org Alias"
            },
            "orgType": {
              "type": "string",
              "enum": SF_ORG_TYPES
            },
            "instanceUrl": {
              "type": "string",
              "title": "Instance URL"
            },
            "hasApex": {
              "type": "boolean",
              "title": "Apex Development Allowed",
              "default": true
            },
            "hasCPQ": {
              "type": "boolean",
              "title": "CPQ Installed",
              "default": false
            },
            "hasExperience": {
              "type": "boolean",
              "title": "Experience Cloud Enabled",
              "default": false
            },
            "apiVersion": {
              "type": "string",
              "title": "API Version",
              "default": "62.0"
            }
          }
        },
        "hubspotPortal": {
          "type": "object",
          "title": "HubSpot Details",
          "description": "Required if HubSpot is a target platform",
          "properties": {
            "portalId": {
              "type": "string",
              "title": "Portal ID"
            },
            "tier": {
              "type": "string",
              "enum": HUBSPOT_TIERS
            },
            "hasOperationsHub": {
              "type": "boolean",
              "title": "Operations Hub Enabled",
              "default": false
            }
          }
        },
        "complexity": {
          "type": "string",
          "title": "Estimated Complexity",
          "enum": COMPLEXITY_LEVELS
        },
        "securityRequirements": {
          "type": "array",
          "title": "Security Requirements",
          "description": "Compliance, access control, data privacy needs",
          "items": { "type": "string" }
        },
        "performanceRequirements": {
          "type": "array",
          "title": "Performance Requirements",
          "description": "Speed, scalability, volume constraints",
          "items": { "type": "string" }
        },
        "existingTechStack": {
          "type": "array",
          "title": "Existing Tech Stack",
          "description": "Current tools/systems that must be considered",
          "items": { "type": "string" }
        }
      }
    },

    // === Section 8: Approval & Sign-off ===
    "approvalSignoff": {
      "type": "object",
      "title": "Approval & Sign-off",
      "description": "Who needs to approve and how to communicate",
      "properties": {
        "approvers": {
          "type": "array",
          "title": "Required Approvers",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "email": { "type": "string", "format": "email" },
              "approvalType": {
                "type": "string",
                "enum": APPROVAL_TYPES
              },
              "approved": {
                "type": "boolean",
                "default": false
              },
              "approvalDate": {
                "type": "string",
                "format": "date"
              },
              "notes": { "type": "string" }
            }
          }
        },
        "communicationPlan": {
          "type": "object",
          "title": "Communication Plan",
          "properties": {
            "preferredChannel": {
              "type": "string",
              "enum": COMMUNICATION_CHANNELS
            },
            "updateFrequency": {
              "type": "string",
              "enum": UPDATE_FREQUENCIES
            },
            "escalationPath": { "type": "string" },
            "meetingCadence": { "type": "string" }
          }
        },
        "additionalNotes": {
          "type": "string",
          "title": "Additional Notes",
          "description": "Anything else we should know?"
        }
      }
    },

    // === Metadata ===
    "metadata": {
      "type": "object",
      "title": "Form Metadata",
      "properties": {
        "formVersion": {
          "type": "string",
          "default": "1.0.0"
        },
        "submittedAt": {
          "type": "string",
          "format": "date-time"
        },
        "submittedBy": {
          "type": "string"
        },
        "linkedAsanaProject": {
          "type": "string",
          "description": "Asana project ID if linked"
        },
        "linkedSalesforceOrg": {
          "type": "string",
          "description": "SF org alias if linked"
        }
      }
    }
  },

  // === Conditional Logic ===
  "allOf": [
    {
      "if": {
        "properties": {
          "timelineBudget": {
            "properties": { "hardDeadline": { "const": true } }
          }
        }
      },
      "then": {
        "properties": {
          "timelineBudget": {
            "required": ["deadlineReason"]
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "technicalRequirements": {
            "properties": {
              "platforms": {
                "contains": { "const": "salesforce" }
              }
            }
          }
        }
      },
      "then": {
        "properties": {
          "technicalRequirements": {
            "properties": {
              "salesforceOrg": {
                "required": ["orgAlias", "orgType"]
              }
            }
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "technicalRequirements": {
            "properties": {
              "platforms": {
                "contains": { "const": "hubspot" }
              }
            }
          }
        }
      },
      "then": {
        "properties": {
          "technicalRequirements": {
            "properties": {
              "hubspotPortal": {
                "required": ["portalId", "tier"]
              }
            }
          }
        }
      }
    }
  ],

  // Required top-level sections
  "required": ["projectIdentity", "goalsObjectives", "scope", "timelineBudget"]
};

/**
 * Get schema section by name
 */
function getSection(sectionName) {
  return intakeSchema.properties[sectionName] || null;
}

/**
 * Get all required sections
 */
function getRequiredSections() {
  return intakeSchema.required || [];
}

/**
 * Get enum values for a field type
 */
function getEnumValues(enumName) {
  const enums = {
    PROJECT_TYPES,
    PRIORITY_LEVELS,
    PLATFORMS,
    RISK_LEVELS,
    DEPENDENCY_TYPES,
    DEPENDENCY_STATUS,
    BUDGET_RANGES,
    BUDGET_FLEXIBILITY,
    COMPLEXITY_LEVELS,
    NOTIFICATION_LEVELS,
    APPROVAL_TYPES,
    COMMUNICATION_CHANNELS,
    UPDATE_FREQUENCIES,
    DATA_SOURCE_TYPES,
    DATA_FLOW_TYPES,
    SF_ORG_TYPES,
    HUBSPOT_TIERS
  };
  return enums[enumName] || null;
}

/**
 * Validate data against schema (basic validation)
 * Full validation is in intake-validator.js
 */
function validateBasic(data) {
  const errors = [];

  // Check required sections
  for (const section of intakeSchema.required) {
    if (!data[section]) {
      errors.push({
        field: section,
        message: `Required section "${section}" is missing`
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  intakeSchema,
  getSection,
  getRequiredSections,
  getEnumValues,
  validateBasic,
  // Export enum constants for use in other modules
  enums: {
    PROJECT_TYPES,
    PRIORITY_LEVELS,
    PLATFORMS,
    RISK_LEVELS,
    DEPENDENCY_TYPES,
    DEPENDENCY_STATUS,
    BUDGET_RANGES,
    BUDGET_FLEXIBILITY,
    COMPLEXITY_LEVELS,
    NOTIFICATION_LEVELS,
    APPROVAL_TYPES,
    COMMUNICATION_CHANNELS,
    UPDATE_FREQUENCIES,
    DATA_SOURCE_TYPES,
    DATA_FLOW_TYPES,
    SF_ORG_TYPES,
    HUBSPOT_TIERS
  }
};
