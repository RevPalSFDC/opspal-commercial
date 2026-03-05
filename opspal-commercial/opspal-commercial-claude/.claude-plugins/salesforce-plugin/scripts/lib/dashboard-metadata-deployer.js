/**
 * Dashboard Metadata Deployer
 *
 * PURPOSE: Deploy Salesforce dashboards using Metadata API (NOT Analytics REST API)
 *
 * WHY METADATA API:
 * - Analytics REST API does not support dashboard creation
 * - Metadata API is the only programmatic way to deploy dashboards with components
 * - Requires XML generation and file-based deployment
 *
 * SUPPORTED LAYOUT: Column-based (leftSection, middleSection, rightSection)
 * - Well-documented and proven to work
 * - Covers 90%+ of dashboard use cases
 * - Future: Grid layout (dashboardGridLayout) can be added as enhancement
 *
 * WORKFLOW:
 * 1. Accept JSON template with dashboard configuration
 * 2. Generate XML in Salesforce Metadata API format
 * 3. Write to temporary directory structure
 * 4. Deploy using `sf project deploy start`
 * 5. Clean up temporary files
 *
 * DEPENDENCIES:
 * - Salesforce CLI (`sf` command)
 * - Valid Salesforce org authentication
 * - Reports must exist before creating dashboard components
 *
 * @module dashboard-metadata-deployer
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

function resolveOrgAlias(inputOrg) {
    return inputOrg || process.env.SFDC_INSTANCE || process.env.SF_TARGET_ORG || process.env.ORG;
}

class DashboardMetadataDeployer {
    constructor(org) {
        const resolvedOrg = resolveOrgAlias(org);
        if (!resolvedOrg) {
            throw new Error('No org alias provided. Set SFDC_INSTANCE, SF_TARGET_ORG, or ORG.');
        }
        this.org = resolvedOrg;
        this.tempDir = path.join(__dirname, '.temp');
    }

    /**
     * Deploy dashboard from JSON template
     *
     * @param {Object} template - Dashboard template configuration
     * @param {string} template.title - Dashboard title
     * @param {string} template.developerName - Dashboard API name
     * @param {string} template.description - Dashboard description
     * @param {string} [template.dashboardType='SpecifiedUser'] - LoggedInUser or SpecifiedUser
     * @param {string} [template.runningUser] - User email for SpecifiedUser type
     * @param {Object} template.components - Dashboard components by section
     * @param {Array} [template.components.left] - Left section components
     * @param {Array} [template.components.middle] - Middle section components
     * @param {Array} [template.components.right] - Right section components
     * @param {string} [template.folder] - Dashboard folder name
     * @returns {Promise<Object>} Deployment result
     */
    async deploy(template) {
        console.log('\n🚀 Deploying dashboard via Metadata API...');
        console.log(`   Dashboard: ${template.title}`);
        console.log(`   Org: ${this.org}\n`);

        const startTime = Date.now();

        try {
            // Clean up any existing temp files from previous runs
            await this.cleanup();

            // Validate template
            this.validateTemplate(template);

            // Generate XML
            const xml = this.generateXML(template);

            // Write to temp directory
            const folderName = template.folderName || 'unfiled$public';
            await this.writeTempFiles(template.developerName, folderName, xml);

            // Deploy folder first (if not using default public folder)
            if (folderName !== 'unfiled$public') {
                console.log(`\n📁 Creating dashboard folder: ${folderName}`);
                try {
                    await this.deployFolder(folderName);
                    console.log('  ✅ Folder deployed successfully');
                } catch (folderError) {
                    // Folder might already exist, which is fine - check for common folder existence errors
                    const errorMsg = folderError.message || '';
                    if (errorMsg.includes('duplicate value found') ||
                        errorMsg.includes('SourceConflictError') ||
                        errorMsg.includes('conflicts detected')) {
                        console.log('  ℹ️  Folder already exists, continuing...');
                    } else {
                        console.warn(`  ⚠️  Folder deployment issue: ${folderError.message}`);
                        console.warn('  Continuing with dashboard deployment...');
                    }
                }
            }

            // Deploy dashboard via Metadata API
            const deployResult = await this.deployMetadata(template.developerName, folderName);

            // Clean up
            await this.cleanup();

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

            return {
                success: true,
                elapsed: `${elapsed}s`,
                dashboard: {
                    name: template.title,
                    developerName: template.developerName,
                    folder: template.folder || 'Unfiled Public Dashboards',
                    components: this.getComponentCount(template)
                },
                deployment: deployResult
            };

        } catch (error) {
            console.error('\n❌ Dashboard deployment failed');
            console.error('   Error:', error.message);

            // Don't cleanup on error so we can inspect the files
            console.log(`\n🔍 Debug: Temp files preserved at ${this.tempDir}`);

            throw new Error(`Dashboard deployment failed: ${error.message}`);
        }
    }

    /**
     * Validate dashboard template
     */
    validateTemplate(template) {
        if (!template.title) {
            throw new Error('Dashboard title is required');
        }
        if (!template.developerName) {
            throw new Error('Dashboard developerName is required');
        }
        if (template.dashboardType === 'SpecifiedUser' && !template.runningUser) {
            throw new Error('runningUser is required for SpecifiedUser dashboard type');
        }
        if (!template.components || typeof template.components !== 'object') {
            throw new Error('Dashboard components are required');
        }

        // Validate at least one component exists
        const componentCount = this.getComponentCount(template);
        if (componentCount === 0) {
            throw new Error('Dashboard must have at least one component');
        }
    }

    /**
     * Get total component count
     */
    getComponentCount(template) {
        const left = template.components.left?.length || 0;
        const middle = template.components.middle?.length || 0;
        const right = template.components.right?.length || 0;
        return left + middle + right;
    }

    /**
     * Generate Metadata API XML for dashboard
     */
    generateXML(template) {
        const {
            title,
            description,
            dashboardType = 'SpecifiedUser',
            runningUser,
            backgroundStartColor = '#FFFFFF',
            backgroundEndColor = '#FFFFFF',
            backgroundFadeDirection = 'Diagonal',
            textColor = '#000000',
            titleColor = '#000000',
            titleSize = 12
        } = template;

        const components = template.components || {};

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Dashboard xmlns="http://soap.sforce.com/2006/04/metadata">
    <backgroundEndColor>${this.escapeXml(backgroundEndColor)}</backgroundEndColor>
    <backgroundFadeDirection>${this.escapeXml(backgroundFadeDirection)}</backgroundFadeDirection>
    <backgroundStartColor>${this.escapeXml(backgroundStartColor)}</backgroundStartColor>
    ${description ? `<description>${this.escapeXml(description)}</description>` : ''}
    <dashboardType>${this.escapeXml(dashboardType)}</dashboardType>
    <isGridLayout>false</isGridLayout>
    ${this.generateSection('leftSection', components.left)}
    ${this.generateSection('middleSection', components.middle)}
    ${this.generateSection('rightSection', components.right)}
    ${runningUser ? `<runningUser>${this.escapeXml(runningUser)}</runningUser>` : ''}
    <textColor>${this.escapeXml(textColor)}</textColor>
    <title>${this.escapeXml(title)}</title>
    <titleColor>${this.escapeXml(titleColor)}</titleColor>
    <titleSize>${titleSize}</titleSize>
</Dashboard>`;

        return xml;
    }

    /**
     * Generate XML for a dashboard section
     */
    generateSection(sectionName, components) {
        if (!components || components.length === 0) {
            return `    <${sectionName}>
        <columnSize>Medium</columnSize>
    </${sectionName}>`;
        }

        const componentXml = components.map(comp => this.generateComponent(comp)).join('\n');

        return `    <${sectionName}>
        <columnSize>Medium</columnSize>
${componentXml}
    </${sectionName}>`;
    }

    /**
     * Generate XML for a single dashboard component
     */
    generateComponent(component) {
        const {
            title,
            report,
            componentType = 'Table',
            autoselectColumnsFromReport = true,
            displayUnits = 'Auto',
            drillEnabled = false,
            drillToDetailEnabled = false,
            enableHover = false,
            expandOthers = false,
            footer,
            header,
            indicatorBreakpoint1,
            indicatorBreakpoint2,
            indicatorHighColor,
            indicatorLowColor,
            indicatorMiddleColor,
            legendPosition = 'Bottom',
            maxValuesDisplayed,
            metricLabel,
            page,
            pageHeightInPixels,
            reportFilterColumn,
            reportFilterOperator,
            reportFilterValue,
            showPercentage,
            showPicturesOnCharts,
            showRange,
            showTotal,
            showValues,
            sortBy,
            useReportChart,
            chartAxisRange = 'Auto',
            gaugeMax,
            gaugeMin
        } = component;

        // Build component XML dynamically based on properties
        let xml = '        <components>\n';

        // Determine if this is a chart component
        const chartTypes = ['Bar', 'BarGrouped', 'BarStacked', 'Column', 'ColumnGrouped', 'ColumnStacked',
                           'Line', 'LineGrouped', 'Pie', 'Donut', 'Funnel', 'Scatter'];
        const isChart = chartTypes.includes(componentType);

        // Required properties
        if (autoselectColumnsFromReport !== undefined) {
            xml += `            <autoselectColumnsFromReport>${autoselectColumnsFromReport}</autoselectColumnsFromReport>\n`;
        }

        // Chart-specific properties (only for actual chart types)
        if (isChart && chartAxisRange) {
            xml += `            <chartAxisRange>${this.escapeXml(chartAxisRange)}</chartAxisRange>\n`;
        }

        xml += `            <componentType>${this.escapeXml(componentType)}</componentType>\n`;

        // Display properties
        if (displayUnits) {
            xml += `            <displayUnits>${this.escapeXml(displayUnits)}</displayUnits>\n`;
        }
        xml += `            <drillEnabled>${drillEnabled}</drillEnabled>\n`;

        if (drillToDetailEnabled !== undefined) {
            xml += `            <drillToDetailEnabled>${drillToDetailEnabled}</drillToDetailEnabled>\n`;
        }

        if (enableHover !== undefined) {
            xml += `            <enableHover>${enableHover}</enableHover>\n`;
        }

        if (expandOthers !== undefined) {
            xml += `            <expandOthers>${expandOthers}</expandOthers>\n`;
        }

        // Footer and header
        if (footer) {
            xml += `            <footer>${this.escapeXml(footer)}</footer>\n`;
        }
        if (header) {
            xml += `            <header>${this.escapeXml(header)}</header>\n`;
        }

        // Gauge properties
        if (gaugeMax !== undefined) {
            xml += `            <gaugeMax>${gaugeMax}</gaugeMax>\n`;
        }
        if (gaugeMin !== undefined) {
            xml += `            <gaugeMin>${gaugeMin}</gaugeMin>\n`;
        }

        // Indicator colors (REQUIRED for Table, Metric, and Gauge components)
        // Salesforce requires these even for Table components
        const requiresIndicators = ['Table', 'Metric', 'Gauge'].includes(componentType);

        if (requiresIndicators || indicatorBreakpoint1 || indicatorBreakpoint2 || indicatorHighColor || indicatorLowColor || indicatorMiddleColor) {
            // Use provided values or defaults
            xml += `            <indicatorHighColor>${this.escapeXml(indicatorHighColor || '#00C853')}</indicatorHighColor>\n`;
            xml += `            <indicatorLowColor>${this.escapeXml(indicatorLowColor || '#D50000')}</indicatorLowColor>\n`;
            xml += `            <indicatorMiddleColor>${this.escapeXml(indicatorMiddleColor || '#FFD600')}</indicatorMiddleColor>\n`;

            // Breakpoints are optional
            if (indicatorBreakpoint1) {
                xml += `            <indicatorBreakpoint1>${indicatorBreakpoint1}</indicatorBreakpoint1>\n`;
            }
            if (indicatorBreakpoint2) {
                xml += `            <indicatorBreakpoint2>${indicatorBreakpoint2}</indicatorBreakpoint2>\n`;
            }
        }

        // Legend (only for chart components)
        if (isChart && legendPosition) {
            xml += `            <legendPosition>${this.escapeXml(legendPosition)}</legendPosition>\n`;
        }

        // Max values
        if (maxValuesDisplayed) {
            xml += `            <maxValuesDisplayed>${maxValuesDisplayed}</maxValuesDisplayed>\n`;
        }

        // Metric label
        if (metricLabel) {
            xml += `            <metricLabel>${this.escapeXml(metricLabel)}</metricLabel>\n`;
        }

        // Page properties
        if (page) {
            xml += `            <page>${page}</page>\n`;
        }
        if (pageHeightInPixels) {
            xml += `            <pageHeightInPixels>${pageHeightInPixels}</pageHeightInPixels>\n`;
        }

        // Report reference (REQUIRED)
        if (!report) {
            throw new Error(`Component "${title}" is missing required "report" property`);
        }
        xml += `            <report>${this.escapeXml(report)}</report>\n`;

        // Report filters
        if (reportFilterColumn) {
            xml += `            <reportFilterColumn>${this.escapeXml(reportFilterColumn)}</reportFilterColumn>\n`;
        }
        if (reportFilterOperator) {
            xml += `            <reportFilterOperator>${this.escapeXml(reportFilterOperator)}</reportFilterOperator>\n`;
        }
        if (reportFilterValue) {
            xml += `            <reportFilterValue>${this.escapeXml(reportFilterValue)}</reportFilterValue>\n`;
        }

        // Display flags
        const isGauge = componentType === 'Gauge' || componentType === 'Metric';

        // Chart-specific display flags
        if (isChart && showPercentage !== undefined) {
            xml += `            <showPercentage>${showPercentage}</showPercentage>\n`;
        }
        if (isChart && showPicturesOnCharts !== undefined) {
            xml += `            <showPicturesOnCharts>${showPicturesOnCharts}</showPicturesOnCharts>\n`;
        }
        if (isChart && showRange !== undefined) {
            xml += `            <showRange>${showRange}</showRange>\n`;
        }
        // showTotal only for charts and gauges (NOT tables)
        if ((isChart || isGauge) && showTotal !== undefined) {
            xml += `            <showTotal>${showTotal}</showTotal>\n`;
        }
        if (isChart && showValues !== undefined) {
            xml += `            <showValues>${showValues}</showValues>\n`;
        }

        // Sort
        if (sortBy) {
            xml += `            <sortBy>${this.escapeXml(sortBy)}</sortBy>\n`;
        }

        // Title (optional but recommended)
        if (title) {
            xml += `            <title>${this.escapeXml(title)}</title>\n`;
        }

        // Use report chart
        if (useReportChart !== undefined) {
            xml += `            <useReportChart>${useReportChart}</useReportChart>\n`;
        }

        xml += '        </components>';

        return xml;
    }

    /**
     * Write dashboard XML to temporary directory with Salesforce project structure
     */
    async writeTempFiles(developerName, folderName, xml) {
        // Create Salesforce project structure required for `sf project deploy`
        // .temp/
        //   ├── sfdx-project.json
        //   └── force-app/
        //       └── main/
        //           └── default/
        //               └── dashboards/
        //                   └── {FolderName}/
        //                       └── {DeveloperName}.dashboard-meta.xml

        await fs.mkdir(this.tempDir, { recursive: true });

        // Create Salesforce project config (sfdx-project.json)
        const projectConfig = {
            packageDirectories: [
                {
                    path: 'force-app',
                    default: true
                }
            ],
            namespace: '',
            sfdcLoginUrl: 'https://login.salesforce.com',
            sourceApiVersion: '64.0'
        };

        const projectConfigPath = path.join(this.tempDir, 'sfdx-project.json');
        await fs.writeFile(projectConfigPath, JSON.stringify(projectConfig, null, 2), 'utf8');

        // Create dashboard XML in proper directory structure with folder
        // Dashboards MUST be in a folder subdirectory
        const dashboardFolderDir = path.join(this.tempDir, 'force-app', 'main', 'default', 'dashboards', folderName);
        await fs.mkdir(dashboardFolderDir, { recursive: true });

        const xmlPath = path.join(dashboardFolderDir, `${developerName}.dashboard-meta.xml`);
        await fs.writeFile(xmlPath, xml, 'utf8');

        console.log(`✅ Generated Salesforce project structure:`);
        console.log(`   project config: ${projectConfigPath}`);
        console.log(`   Dashboard XML: ${xmlPath}`);
        console.log(`   Folder: ${folderName}`);
    }

    /**
     * Deploy dashboard via Metadata API
     */
    async deployMetadata(developerName, folderName) {
        console.log('\n📦 Deploying via Metadata API...');

        try {
            // Deploy only the dashboard file, not the folder metadata (which may already exist)
            // Deploy the specific dashboard file path instead of entire dashboards directory
            const sourceDir = `force-app/main/default/dashboards/${folderName}/${developerName}.dashboard-meta.xml`;
            const command = `sf project deploy start --source-dir "${sourceDir}" --target-org ${this.org} --json`;

            console.log(`   Command: ${command}`);
            console.log(`   Working directory: ${this.tempDir}`);

            const output = execSync(command, {
                encoding: 'utf8',
                cwd: this.tempDir  // Run from temp project directory
            });

            const result = JSON.parse(output);

            if (result.status === 0) {
                console.log('✅ Deployment successful');

                const dashboardId = result.result?.deployedSource?.[0]?.id;

                return {
                    status: 'SUCCESS',
                    id: result.result?.id,
                    dashboardId: dashboardId,
                    deployedComponents: result.result?.deployedSource?.length || 0
                };
            } else {
                throw new Error(`Deployment failed: ${JSON.stringify(result)}`);
            }

        } catch (error) {
            // Extract meaningful error from SF CLI output
            console.error('❌ Deployment failed');

            // Try to parse JSON error from stdout or stderr
            const output = error.stdout || error.stderr || error.message;

            try {
                const errorResult = JSON.parse(output);

                if (errorResult.result && errorResult.result.details && errorResult.result.details.componentFailures) {
                    const failures = errorResult.result.details.componentFailures;
                    console.error('\n📋 Component Failures:');
                    failures.forEach(f => {
                        console.error(`   ${f.fileName}: ${f.problem}`);
                        console.error(`      Line ${f.lineNumber}, Column ${f.columnNumber}`);
                    });

                    const firstFailure = failures[0];
                    throw new Error(`${firstFailure.problem} (${firstFailure.fileName}:${firstFailure.lineNumber})`);
                }

                if (errorResult.message) {
                    throw new Error(errorResult.message);
                }
            } catch (parseError) {
                // If not JSON, use original error
            }

            console.error('   Raw error:', error.message);
            if (error.stdout) console.error('   Stdout:', error.stdout.substring(0, 500));
            if (error.stderr) console.error('   Stderr:', error.stderr.substring(0, 500));

            throw error;
        }
    }

    /**
     * Deploy dashboard folder metadata
     */
    async deployFolder(folderName) {
        // Generate folder XML
        // IMPORTANT: In source format, folder metadata goes in dashboards/ directory
        // File structure:
        //   dashboards/
        //   ├── FolderName-meta.xml       <- Folder metadata
        //   └── FolderName/                <- Folder directory containing dashboards
        //       └── Dashboard.dashboard-meta.xml
        const folderXml = `<?xml version="1.0" encoding="UTF-8"?>
<DashboardFolder xmlns="http://soap.sforce.com/2006/04/metadata">
    <accessType>Public</accessType>
    <name>${this.escapeXml(folderName)}</name>
    <publicFolderAccess>ReadWrite</publicFolderAccess>
</DashboardFolder>`;

        // Write folder metadata to dashboards directory (same level as folder directory)
        const dashboardsDir = path.join(this.tempDir, 'force-app', 'main', 'default', 'dashboards');
        await fs.mkdir(dashboardsDir, { recursive: true });

        // Folder metadata file: FolderName-meta.xml (NOT FolderName.dashboardFolder-meta.xml)
        const folderPath = path.join(dashboardsDir, `${folderName}-meta.xml`);
        await fs.writeFile(folderPath, folderXml, 'utf8');

        console.log(`  📝 Generated folder metadata: ${folderPath}`);

        // Deploy folder using source-dir (deploy just the folder metadata file)
        const command = `sf project deploy start --source-dir "force-app/main/default/dashboards/${folderName}-meta.xml" --target-org ${this.org} --json`;

        try {
            const output = execSync(command, {
                encoding: 'utf8',
                cwd: this.tempDir
            });

            const result = JSON.parse(output);

            if (result.status !== 0) {
                throw new Error(`Folder deployment failed: ${JSON.stringify(result)}`);
            }

            return result;
        } catch (error) {
            // Parse error to provide better message
            const output = error.stdout || error.stderr || error.message;

            try {
                const errorResult = JSON.parse(output);
                if (errorResult.message) {
                    throw new Error(errorResult.message);
                }
            } catch (parseError) {
                // Use original error if can't parse
            }

            throw error;
        }
    }

    /**
     * Clean up temporary files
     */
    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
            console.log('🧹 Cleaned up temporary files');
        } catch (error) {
            console.warn('⚠️  Cleanup warning:', error.message);
        }
    }

    /**
     * Escape XML special characters
     */
    escapeXml(unsafe) {
        if (unsafe === null || unsafe === undefined) {
            return '';
        }
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

// CLI execution
if (require.main === module) {
    const templatePath = process.argv[2];
    const org = resolveOrgAlias();

    if (!templatePath) {
        console.error('Usage: node dashboard-metadata-deployer.js <template.json>');
        console.error('Example: SFDC_INSTANCE=my-sandbox node dashboard-metadata-deployer.js templates/dashboards/example.json');
        process.exit(1);
    }

    if (!org) {
        console.error('❌ No org alias provided. Set SFDC_INSTANCE, SF_TARGET_ORG, or ORG.');
        process.exit(1);
    }

    (async () => {
        try {
            const template = JSON.parse(await fs.readFile(templatePath, 'utf8'));
            const deployer = new DashboardMetadataDeployer(org);
            const result = await deployer.deploy(template);

            console.log('\n✅ Deployment Result:\n');
            console.log(JSON.stringify(result, null, 2));

        } catch (error) {
            console.error('\n❌ Deployment failed:', error.message);
            if (error.stack) console.error(error.stack);
            process.exit(1);
        }
    })();
}

module.exports = DashboardMetadataDeployer;
