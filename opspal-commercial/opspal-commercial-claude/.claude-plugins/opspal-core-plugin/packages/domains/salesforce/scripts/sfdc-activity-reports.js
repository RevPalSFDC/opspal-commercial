const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function createAnalyticsReports(orgAlias, configPath) {
    try {
        // Read configuration
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // Validate configuration
        if (!config.reports || config.reports.length === 0) {
            throw new Error('No reports defined in configuration');
        }

        const results = [];

        for (const reportConfig of config.reports) {
            const reportName = reportConfig.name;
            const reportDescription = reportConfig.description;
            const folderName = reportConfig.folderName;

            // Construct report metadata dynamically
            const reportMetadata = {
                reportExtendedMetadata: reportConfig.reportExtendedMetadata,
                reportBuckets: reportConfig.reportBuckets || {},
                reportFilters: reportConfig.reportFilters || []
            };

            // Create report using sf CLI with JSON metadata
            const reportCommand = `sf analytics report create \
                --org ${orgAlias} \
                --name "${reportName}" \
                --description "${reportDescription}" \
                --folder-id "${folderName}" \
                --metadata '${JSON.stringify(reportMetadata)}'`;

            try {
                const { stdout, stderr } = await executeCommand(reportCommand);
                
                results.push({
                    name: reportName,
                    status: 'SUCCESS',
                    reportId: extractReportId(stdout),
                    details: stdout
                });
            } catch (reportError) {
                results.push({
                    name: reportName,
                    status: 'FAILED',
                    error: reportError.message,
                    stderr: reportError.stderr
                });
            }
        }

        return results;
    } catch (error) {
        console.error('Report Generation Error:', error);
        throw error;
    }
}

function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject({ message: error.message, stderr });
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

function extractReportId(stdout) {
    // Implement logic to extract Report ID from CLI output
    const match = stdout.match(/Report ID: (\w+)/);
    return match ? match[1] : null;
}

// Main execution
const orgAlias = process.argv[2];
const configPath = process.argv[3];

if (!orgAlias || !configPath) {
    console.error('Usage: node sfdc-activity-reports.js <org-alias> <config-path>');
    process.exit(1);
}

createAnalyticsReports(orgAlias, configPath)
    .then(results => {
        console.log('Report Creation Results:', JSON.stringify(results, null, 2));
        process.exit(0);
    })
    .catch(error => {
        console.error('Fatal Error:', error);
        process.exit(1);
    });