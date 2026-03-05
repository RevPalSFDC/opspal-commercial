#!/usr/bin/env node

/**
 * Metadata Propagation Waiter
 *
 * Handles the delay between successful metadata deployment and actual
 * visibility in Salesforce queries. Uses exponential backoff polling.
 *
 * Typical propagation times:
 * - Reports: 5-10 seconds (up to 30 seconds)
 * - Custom Objects: 10-20 seconds
 * - Permissions: 5-15 seconds
 * - Flows: 10-30 seconds
 *
 * @see docs/SALESFORCE_METADATA_PROPAGATION.md
 */

const { execSync } = require('child_process');

class MetadataPropagationWaiter {
  constructor(options = {}) {
    this.orgAlias = options.orgAlias || 'default';
    this.maxWaitSeconds = options.maxWaitSeconds || 30;
    this.initialDelayMs = options.initialDelayMs || 2000;
    this.maxDelayMs = options.maxDelayMs || 8000;
    this.verbose = options.verbose !== false;
  }

  /**
   * Wait for a report to be visible via SOQL query
   */
  async waitForReport(reportName, options = {}) {
    const { developerName, folderName } = options;

    let query;
    if (developerName) {
      query = `SELECT Id, Name, DeveloperName, FolderName FROM Report WHERE DeveloperName = '${developerName}'`;
    } else if (folderName) {
      query = `SELECT Id, Name, DeveloperName, FolderName FROM Report WHERE Name = '${reportName}' AND FolderName = '${folderName}'`;
    } else {
      query = `SELECT Id, Name, DeveloperName, FolderName FROM Report WHERE Name = '${reportName}'`;
    }

    return this.waitForQuery(query, {
      metadataType: 'Report',
      identifier: developerName || reportName
    });
  }

  /**
   * Wait for a custom object to be visible
   */
  async waitForCustomObject(objectApiName) {
    const query = `SELECT Id, QualifiedApiName, Label FROM EntityDefinition WHERE QualifiedApiName = '${objectApiName}'`;

    return this.waitForQuery(query, {
      metadataType: 'CustomObject',
      identifier: objectApiName
    });
  }

  /**
   * Wait for a flow to be visible
   */
  async waitForFlow(flowApiName) {
    const query = `SELECT Id, ApiName, Label, Status FROM FlowDefinitionView WHERE ApiName = '${flowApiName}'`;

    return this.waitForQuery(query, {
      metadataType: 'Flow',
      identifier: flowApiName,
      useToolingApi: true
    });
  }

  /**
   * Generic wait for SOQL query to return results
   */
  async waitForQuery(query, options = {}) {
    const { metadataType = 'Metadata', identifier = 'unknown', useToolingApi = false } = options;

    if (this.verbose) {
      console.log(`\n⏳ Waiting for ${metadataType} "${identifier}" to be visible...`);
    }

    const startTime = Date.now();
    let attempt = 0;
    let delay = this.initialDelayMs;

    while ((Date.now() - startTime) / 1000 < this.maxWaitSeconds) {
      attempt++;

      // Wait before attempting
      if (attempt > 1) {
        if (this.verbose) {
          console.log(`   Attempt ${attempt}: waiting ${delay}ms...`);
        }
        await this.sleep(delay);
      }

      try {
        const toolingFlag = useToolingApi ? '--use-tooling-api' : '';
        const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} ${toolingFlag} --json`;

        const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

        if (result.status === 0 && result.result && result.result.records && result.result.records.length > 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          if (this.verbose) {
            console.log(`   ✅ ${metadataType} found after ${elapsed}s (${attempt} attempts)`);
          }

          return {
            found: true,
            elapsed: parseFloat(elapsed),
            attempts: attempt,
            records: result.result.records
          };
        }

      } catch (error) {
        // Query might fail while metadata is propagating - continue waiting
        if (this.verbose && error.message && !error.message.includes('0 records')) {
          console.log(`   Query error: ${error.message}`);
        }
      }

      // Exponential backoff
      delay = Math.min(delay * 1.5, this.maxDelayMs);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (this.verbose) {
      console.log(`   ⏰ Timeout after ${elapsed}s (${attempt} attempts)`);
    }

    return {
      found: false,
      elapsed: parseFloat(elapsed),
      attempts: attempt,
      timeout: true
    };
  }

  /**
   * Wait for deployment job to complete
   */
  async waitForDeployment(jobId) {
    if (this.verbose) {
      console.log(`\n⏳ Waiting for deployment ${jobId} to complete...`);
    }

    const startTime = Date.now();
    let attempt = 0;
    let delay = 1000; // Start with 1 second for deployment polling

    while ((Date.now() - startTime) / 1000 < this.maxWaitSeconds) {
      attempt++;

      if (attempt > 1) {
        await this.sleep(delay);
      }

      try {
        const cmd = `sf project deploy report --job-id ${jobId} --json`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

        if (result.status === 0 && result.result) {
          const status = result.result.status;
          const done = result.result.done;

          if (this.verbose && attempt % 5 === 0) {
            console.log(`   Status: ${status} (${attempt} attempts)`);
          }

          if (done) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const success = status === 'Succeeded';

            if (this.verbose) {
              if (success) {
                console.log(`   ✅ Deployment succeeded after ${elapsed}s`);
              } else {
                console.log(`   ❌ Deployment failed after ${elapsed}s`);
              }
            }

            return {
              complete: true,
              success,
              status,
              elapsed: parseFloat(elapsed),
              attempts: attempt,
              result: result.result
            };
          }
        }

      } catch (error) {
        if (this.verbose) {
          console.log(`   Error checking deployment: ${error.message}`);
        }
      }

      // Slower backoff for deployment
      delay = Math.min(delay * 1.2, 5000);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (this.verbose) {
      console.log(`   ⏰ Deployment timeout after ${elapsed}s`);
    }

    return {
      complete: false,
      timeout: true,
      elapsed: parseFloat(elapsed),
      attempts: attempt
    };
  }

  /**
   * Helper: Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===========================================================================
  // NEW: Field Availability Checks (v1.1.0)
  // Addresses reflection: Fields not immediately available after deployment
  // ===========================================================================

  /**
   * Wait for a custom field to be accessible via API
   *
   * This checks BOTH metadata existence AND query accessibility.
   * A field can exist in metadata but not be immediately queryable.
   *
   * @param {string} objectApiName - Object API name (e.g., "Account")
   * @param {string} fieldApiName - Field API name (e.g., "Custom_Field__c")
   * @returns {Promise<Object>} Result with field details
   */
  async waitForField(objectApiName, fieldApiName) {
    if (this.verbose) {
      console.log(`\n⏳ Waiting for field ${objectApiName}.${fieldApiName} to be accessible...`);
    }

    const startTime = Date.now();
    let attempt = 0;
    let delay = this.initialDelayMs;
    let metadataFound = false;
    let queryAccessible = false;

    while ((Date.now() - startTime) / 1000 < this.maxWaitSeconds) {
      attempt++;

      if (attempt > 1) {
        if (this.verbose) {
          console.log(`   Attempt ${attempt}: waiting ${delay}ms...`);
        }
        await this.sleep(delay);
      }

      try {
        // Step 1: Check if field exists in metadata
        if (!metadataFound) {
          const metadataQuery = `SELECT Id, QualifiedApiName, Label, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectApiName}' AND QualifiedApiName = '${fieldApiName}'`;
          const metadataCmd = `sf data query --query "${metadataQuery}" --target-org ${this.orgAlias} --use-tooling-api --json`;
          const metadataResult = JSON.parse(execSync(metadataCmd, { encoding: 'utf-8' }));

          if (metadataResult.status === 0 && metadataResult.result?.records?.length > 0) {
            metadataFound = true;
            if (this.verbose) {
              console.log(`   ✓ Field metadata found`);
            }
          }
        }

        // Step 2: Check if field is queryable (try to query it)
        if (metadataFound && !queryAccessible) {
          const accessQuery = `SELECT Id, ${fieldApiName} FROM ${objectApiName} LIMIT 1`;
          try {
            const accessCmd = `sf data query --query "${accessQuery}" --target-org ${this.orgAlias} --json`;
            const accessResult = JSON.parse(execSync(accessCmd, { encoding: 'utf-8' }));

            if (accessResult.status === 0) {
              queryAccessible = true;
              if (this.verbose) {
                console.log(`   ✓ Field is queryable`);
              }
            }
          } catch (queryError) {
            // Field exists in metadata but not yet queryable - keep waiting
            if (this.verbose) {
              console.log(`   Field exists but not yet queryable...`);
            }
          }
        }

        // Both checks passed
        if (metadataFound && queryAccessible) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          if (this.verbose) {
            console.log(`   ✅ Field fully accessible after ${elapsed}s (${attempt} attempts)`);
          }

          return {
            found: true,
            accessible: true,
            elapsed: parseFloat(elapsed),
            attempts: attempt,
            field: {
              object: objectApiName,
              field: fieldApiName
            }
          };
        }

      } catch (error) {
        if (this.verbose && error.message && !error.message.includes('0 records')) {
          console.log(`   Error: ${error.message.substring(0, 80)}`);
        }
      }

      delay = Math.min(delay * 1.5, this.maxDelayMs);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (this.verbose) {
      console.log(`   ⏰ Timeout after ${elapsed}s`);
      console.log(`   Metadata found: ${metadataFound}, Queryable: ${queryAccessible}`);
    }

    return {
      found: metadataFound,
      accessible: queryAccessible,
      timeout: true,
      elapsed: parseFloat(elapsed),
      attempts: attempt
    };
  }

  /**
   * Wait for multiple fields to be accessible
   *
   * @param {string} objectApiName - Object API name
   * @param {Array<string>} fieldApiNames - Array of field API names
   * @returns {Promise<Object>} Result with all field statuses
   */
  async waitForFields(objectApiName, fieldApiNames) {
    if (this.verbose) {
      console.log(`\n⏳ Waiting for ${fieldApiNames.length} fields on ${objectApiName}...`);
    }

    const results = {
      allFound: true,
      allAccessible: true,
      fields: {}
    };

    for (const fieldName of fieldApiNames) {
      const result = await this.waitForField(objectApiName, fieldName);
      results.fields[fieldName] = result;

      if (!result.found) results.allFound = false;
      if (!result.accessible) results.allAccessible = false;
    }

    return results;
  }

  /**
   * Validate field accessibility for Bulk API operations
   *
   * Bulk API has stricter requirements - field must be fully propagated.
   *
   * @param {string} objectApiName - Object API name
   * @param {Array<string>} fieldApiNames - Fields to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateBulkApiAccess(objectApiName, fieldApiNames) {
    if (this.verbose) {
      console.log(`\n⏳ Validating Bulk API access for ${objectApiName}...`);
    }

    const results = {
      valid: true,
      object: objectApiName,
      fields: {},
      recommendations: []
    };

    // First, ensure all fields exist
    for (const fieldName of fieldApiNames) {
      const fieldResult = await this.waitForField(objectApiName, fieldName);
      results.fields[fieldName] = {
        accessible: fieldResult.accessible,
        elapsed: fieldResult.elapsed
      };

      if (!fieldResult.accessible) {
        results.valid = false;
        results.recommendations.push(
          `Wait for field ${fieldName} to propagate before running Bulk API operations`
        );
      }
    }

    // Additional Bulk API validation - try a test query with all fields
    if (results.valid && fieldApiNames.length > 0) {
      try {
        const testQuery = `SELECT Id, ${fieldApiNames.join(', ')} FROM ${objectApiName} LIMIT 1`;
        const testCmd = `sf data query --query "${testQuery}" --target-org ${this.orgAlias} --json`;
        JSON.parse(execSync(testCmd, { encoding: 'utf-8' }));

        if (this.verbose) {
          console.log(`   ✅ All fields queryable together`);
        }
      } catch (error) {
        results.valid = false;
        results.recommendations.push(
          'Fields exist individually but failed combined query - wait longer for full propagation'
        );
      }
    }

    return results;
  }

  /**
   * Wait with custom validation function
   */
  async waitForCondition(checkFn, description = 'condition') {
    if (this.verbose) {
      console.log(`\n⏳ Waiting for ${description}...`);
    }

    const startTime = Date.now();
    let attempt = 0;
    let delay = this.initialDelayMs;

    while ((Date.now() - startTime) / 1000 < this.maxWaitSeconds) {
      attempt++;

      if (attempt > 1) {
        await this.sleep(delay);
      }

      try {
        const result = await checkFn();

        if (result) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          if (this.verbose) {
            console.log(`   ✅ Condition met after ${elapsed}s (${attempt} attempts)`);
          }

          return {
            success: true,
            elapsed: parseFloat(elapsed),
            attempts: attempt,
            result
          };
        }

      } catch (error) {
        if (this.verbose) {
          console.log(`   Check error: ${error.message}`);
        }
      }

      delay = Math.min(delay * 1.5, this.maxDelayMs);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (this.verbose) {
      console.log(`   ⏰ Timeout after ${elapsed}s (${attempt} attempts)`);
    }

    return {
      success: false,
      timeout: true,
      elapsed: parseFloat(elapsed),
      attempts: attempt
    };
  }
}

module.exports = MetadataPropagationWaiter;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node metadata-propagation-waiter.js <type> <identifier> [org-alias]');
    console.log('\nTypes:');
    console.log('  report <developer-name> [org]     Wait for report to be visible');
    console.log('  object <api-name> [org]           Wait for custom object');
    console.log('  flow <api-name> [org]             Wait for flow');
    console.log('  field <object.field> [org]        Wait for field to be accessible');
    console.log('  deployment <job-id>               Wait for deployment to complete');
    console.log('\nExamples:');
    console.log('  node metadata-propagation-waiter.js report Renewal_CheckIn_Tasks peregrine-main');
    console.log('  node metadata-propagation-waiter.js object Custom_Object__c');
    console.log('  node metadata-propagation-waiter.js flow Account_Handler peregrine-main');
    console.log('  node metadata-propagation-waiter.js field Account.Custom_Field__c myorg');
    console.log('  node metadata-propagation-waiter.js deployment 0AfPg000001XqYjKAK');
    process.exit(0);
  }

  const type = args[0];
  const identifier = args[1];
  const orgAlias = args[2] || 'default';

  const waiter = new MetadataPropagationWaiter({ orgAlias, verbose: true });

  (async () => {
    let result;

    switch (type) {
      case 'report':
        result = await waiter.waitForReport(identifier, { developerName: identifier });
        break;

      case 'object':
        result = await waiter.waitForCustomObject(identifier);
        break;

      case 'flow':
        result = await waiter.waitForFlow(identifier);
        break;

      case 'field':
        // Format: Object.Field
        const [objectName, fieldName] = identifier.split('.');
        if (!fieldName) {
          console.error('Field identifier must be in format: Object.Field');
          process.exit(1);
        }
        result = await waiter.waitForField(objectName, fieldName);
        break;

      case 'deployment':
        result = await waiter.waitForDeployment(identifier);
        break;

      default:
        console.error(`Unknown type: ${type}`);
        process.exit(1);
    }

    if (result.found || result.success || result.complete || result.accessible) {
      console.log('\n✅ Success!');
      if (result.records) {
        console.log('\nResults:');
        console.log(JSON.stringify(result.records, null, 2));
      }
      process.exit(0);
    } else {
      console.log('\n❌ Timeout - metadata not visible within time limit');
      process.exit(1);
    }
  })();
}
