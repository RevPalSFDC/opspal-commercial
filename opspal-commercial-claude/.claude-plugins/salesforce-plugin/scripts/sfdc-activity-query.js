const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function generateActivityReports(orgAlias, configPath) {
    try {
        // Set max query limit
        process.env.SF_ORG_MAX_QUERY_LIMIT = '200000';

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const results = [];

        for (const reportConfig of config.reports) {
            const reportName = reportConfig.name;
            const reportDescription = reportConfig.description;

            // Log input configuration
            console.error('Processing Report Config:', JSON.stringify(reportConfig, null, 2));

            // Construct base SOQL query with extended configurations
            const baseQuery = constructSOQLQuery(reportConfig);
            
            // Log constructed query
            console.error('Constructed Query:', baseQuery);

            // Use sf CLI to execute the query with pagination
            const queryCommand = `sf data query -q "${baseQuery.replace(/\s+/g, ' ')}" -o ${orgAlias}`;

            try {
                const { stdout, stderr } = await executeCommand(queryCommand);
                
                console.error('Raw Query Stdout:', stdout);
                console.error('Query Stderr:', stderr);

                const processedData = processActivityData(stdout);

                results.push({
                    name: reportName,
                    description: reportDescription,
                    status: 'SUCCESS',
                    recordCount: processedData.length,
                    data: processedData
                });
            } catch (queryError) {
                console.error('Query Execution Error:', queryError);
                results.push({
                    name: reportName,
                    status: 'FAILED',
                    error: queryError.message,
                    stderr: queryError.stderr
                });
            }
        }

        return results;
    } catch (error) {
        console.error('Report Generation Error:', error);
        throw error;
    }
}

function constructSOQLQuery(reportConfig) {
    // Dynamic query generation based on report configuration
    const filters = reportConfig.reportFilters || [];
    const filterConditions = filters.map(filter => {
        // Handle last N days filter specifically
        if (filter.operator === 'lessThan' && filter.value.includes('LAST_N_DAYS')) {
            const days = filter.value.match(/LAST_N_DAYS:(\d+)/)[1];
            return `CreatedDate = LAST_N_DAYS:${days}`;
        }
        return `${filter.column} ${filter.operator} ${filter.value}`;
    }).join(' AND ');

    // Handle task type bucketing if specified
    const taskTypeBuckets = reportConfig.reportBuckets?.TASK_TYPE;
    let taskTypeFilter = '';
    if (taskTypeBuckets) {
        const bucketCriteria = taskTypeBuckets.ranges
            .map(range => `(Type IN ('${range.criteria.split(',').join("', '")}'))`)
            .join(' OR ');
        taskTypeFilter = taskTypeFilter ? `${taskTypeFilter} AND (${bucketCriteria})` : `(${bucketCriteria})`;
    }

    const baseQuery = `
        SELECT 
            Subject, 
            Status, 
            Type,
            Who.Name,
            CreatedDate
        FROM Task
        WHERE ${filterConditions} ${taskTypeFilter ? 'AND ' + taskTypeFilter : ''}
        ORDER BY CreatedDate DESC
        LIMIT 200000
    `;

    return baseQuery;
}

function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
            if (error) {
                reject({ message: error.message, stderr });
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

function processActivityData(stdout) {
    console.error('Processing Raw Data:', stdout.slice(0, 2000));

    // More robust data processing
    const lines = stdout.split('\n')
        .map(line => line.trim())
        .filter(line => 
            line !== '' && 
            !line.includes('-----') && 
            !line.includes('SUBJECT') &&
            line.split(',').length >= 5
        );

    console.error('Filtered Lines:', lines);

    return lines.map(line => {
        try {
            const parts = line.split(',').map(part => part.trim());
            return {
                Subject: parts[0] || 'Unknown Subject',
                Status: parts[1] || 'Unknown Status',
                Type: parts[2] || 'Unknown Type',
                AssignedUserName: parts[3] || 'Unassigned',
                CreatedDate: parts[4] || 'Unknown Date'
            };
        } catch (error) {
            console.error('Line Parsing Error:', { line, error });
            return null;
        }
    }).filter(entry => entry !== null);
}

function countRecords(data) {
    return data.length;
}

// Main execution
const orgAlias = process.argv[2];
const configPath = process.argv[3];

if (!orgAlias || !configPath) {
    console.error('Usage: node sfdc-activity-query.js <org-alias> <config-path>');
    process.exit(1);
}

generateActivityReports(orgAlias, configPath)
    .then(results => {
        console.log('Activity Report Results:', JSON.stringify(results, null, 2));
        process.exit(0);
    })
    .catch(error => {
        console.error('Fatal Error:', error);
        process.exit(1);
    });