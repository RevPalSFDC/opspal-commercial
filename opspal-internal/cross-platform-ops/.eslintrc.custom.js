/**
 * Custom ESLint rules to enforce HubSpot bulk operations
 */

module.exports = {
    rules: {
        'no-restricted-imports': ['error', {
            patterns: [
                {
                    group: ['**/hubspot-connector', '**/hubspot-connector.js'],
                    message: 'Use lib/hubspot-bulk instead of direct hubspot-connector'
                }
            ]
        }],
        'no-restricted-properties': ['error',
            {
                object: 'hubspot',
                property: 'createRecords',
                message: 'Use HubSpot bulk imports instead of batch create (100 record limit)'
            },
            {
                object: 'hubspot',
                property: 'updateRecords',
                message: 'Use HubSpot bulk imports instead of batch update (100 record limit)'
            }
        ],
        'no-restricted-syntax': [
            'error',
            {
                selector: 'CallExpression[callee.property.name=/^(create|update|delete)Records$/]',
                message: 'Use HubSpot bulk operations from lib/hubspot-bulk for large datasets'
            },
            {
                selector: 'CallExpression[callee.property.name="makeRequest"][arguments.0.value=/\\/batch\\/(create|update|archive)/]',
                message: 'Use CRM Imports API via lib/hubspot-bulk instead of batch endpoints'
            },
            {
                selector: 'ForOfStatement > CallExpression[callee.property.name=/^(create|update|delete)$/]',
                message: 'Do not call HubSpot API in loops. Use bulk operations instead.'
            },
            {
                selector: 'ForStatement CallExpression[callee.property.name=/hubspot|crm/i]',
                message: 'Do not call HubSpot API in loops. Use bulk operations instead.'
            },
            {
                selector: 'CallExpression[callee.property.name="forEach"] CallExpression[callee.property.name=/hubspot|crm/i]',
                message: 'Do not call HubSpot API in forEach. Use bulk operations instead.'
            },
            {
                selector: 'CallExpression[callee.property.name="map"] CallExpression[callee.property.name=/hubspot|crm/i]',
                message: 'Do not call HubSpot API in map. Use bulk operations instead.'
            }
        ]
    },

    overrides: [
        {
            // Allow existing hubspot-connector.js but warn about bulk operations
            files: ['**/hubspot-connector.js'],
            rules: {
                'no-console': ['warn', {
                    allow: ['warn', 'error']
                }]
            }
        },
        {
            // Exempt the bulk toolkit itself
            files: ['lib/hubspot-bulk/**/*.js'],
            rules: {
                'no-restricted-imports': 'off',
                'no-restricted-properties': 'off',
                'no-restricted-syntax': 'off'
            }
        },
        {
            // Exempt test files
            files: ['**/*.test.js', '**/*.spec.js'],
            rules: {
                'no-restricted-imports': 'off',
                'no-restricted-properties': 'off',
                'no-restricted-syntax': 'off'
            }
        }
    ]
};

/**
 * To enable these rules in your project:
 *
 * 1. Add to .eslintrc.js:
 *    extends: [
 *      './eslintrc.custom.js'
 *    ]
 *
 * 2. Or run with:
 *    eslint --config .eslintrc.custom.js src/
 *
 * 3. Add to package.json scripts:
 *    "lint:bulk": "eslint --config .eslintrc.custom.js src/ scripts/"
 */