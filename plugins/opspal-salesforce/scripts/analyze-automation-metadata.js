#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const csvWriter = require('csv-writer').createObjectCsvWriter;

class AutomationAnalyzer {
    constructor(retrievedMetadataDir) {
        this.metadataDir = retrievedMetadataDir;
        this.parser = new xml2js.Parser({ explicitArray: false, trim: true });
        this.results = {
            apex_triggers: {},
            flows: {},
            workflow_rules: {},
            validation_rules: {},
            assignment_rules: {},
            auto_response_rules: {},
            escalation_rules: {},
            matching_rules: {},
            duplicate_rules: {}
        };
    }

    async analyzeMetadata() {
        await Promise.all([
            this.analyzeApexTriggers(),
            this.analyzeFlows(),
            this.analyzeWorkflowRules(),
            this.analyzeValidationRules(),
            this.analyzeAssignmentRules(),
            this.analyzeAutoResponseRules(),
            this.analyzeEscalationRules(),
            this.analyzeMatchingRules(),
            this.analyzeDuplicateRules()
        ]);

        return this.results;
    }

    async parseXmlFile(filePath) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, (err, data) => {
                if (err) reject(err);
                this.parser.parseString(data, (err, result) => {
                    if (err) reject(err);
                    resolve(result);
                });
            });
        });
    }

    async processFilesInDirectory(dirPath, processFile) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            if (fs.statSync(fullPath).isFile() && path.extname(file) === '.xml') {
                await processFile(fullPath, file);
            }
        }
    }

    async analyzeApexTriggers() {
        const triggersDir = path.join(this.metadataDir, 'triggers');
        if (!fs.existsSync(triggersDir)) return;

        await this.processFilesInDirectory(triggersDir, async (filePath, fileName) => {
            const triggerData = await this.parseXmlFile(filePath);
            const objectName = triggerData.ApexTrigger.targetObject;
            
            if (!this.results.apex_triggers[objectName]) {
                this.results.apex_triggers[objectName] = [];
            }
            this.results.apex_triggers[objectName].push(fileName);
        });
    }

    async analyzeFlows() {
        const flowsDir = path.join(this.metadataDir, 'flows');
        if (!fs.existsSync(flowsDir)) return;

        await this.processFilesInDirectory(flowsDir, async (filePath, fileName) => {
            const flowData = await this.parseXmlFile(filePath);
            const flowType = flowData.Flow.processType || 'Unknown';
            const objectName = flowData.Flow.processMetadataValues?.processMetadataValue?.value || 'Global';
            
            if (!this.results.flows[objectName]) {
                this.results.flows[objectName] = {};
            }
            if (!this.results.flows[objectName][flowType]) {
                this.results.flows[objectName][flowType] = [];
            }
            this.results.flows[objectName][flowType].push(fileName);
        });
    }

    // Similar methods for other metadata types...
    async analyzeWorkflowRules() {
        const workflowDir = path.join(this.metadataDir, 'workflows');
        if (!fs.existsSync(workflowDir)) return;

        await this.processFilesInDirectory(workflowDir, async (filePath, fileName) => {
            const workflowData = await this.parseXmlFile(filePath);
            const objectName = path.basename(path.dirname(filePath));
            
            if (!this.results.workflow_rules[objectName]) {
                this.results.workflow_rules[objectName] = [];
            }
            this.results.workflow_rules[objectName].push(fileName);
        });
    }

    async analyzeValidationRules() {
        const validationRulesDir = path.join(this.metadataDir, 'objects');
        if (!fs.existsSync(validationRulesDir)) return;

        await this.processFilesInDirectory(validationRulesDir, async (filePath, fileName) => {
            const objectData = await this.parseXmlFile(filePath);
            const objectName = path.basename(path.dirname(filePath));
            const validationRules = objectData.CustomObject?.validationRules || [];
            
            if (validationRules.length > 0) {
                if (!this.results.validation_rules[objectName]) {
                    this.results.validation_rules[objectName] = [];
                }
                this.results.validation_rules[objectName].push(...validationRules.map(r => r.fullName));
            }
        });
    }

    // Stub methods for other rule types (similar pattern)
    async analyzeAssignmentRules() {}
    async analyzeAutoResponseRules() {}
    async analyzeEscalationRules() {}
    async analyzeMatchingRules() {}
    async analyzeDuplicateRules() {}

    async generateReports(analysisResults) {
        const reportsDir = path.join(__dirname, '..', 'reports', 'automation-analysis');
        fs.mkdirSync(reportsDir, { recursive: true });

        // JSON Report
        const jsonReportPath = path.join(reportsDir, 'automation-analysis.json');
        fs.writeFileSync(jsonReportPath, JSON.stringify(analysisResults, null, 2));

        // CSV Reports for each metadata type
        const csvReportGenerators = {
            apex_triggers: this.generateCsvReport(analysisResults.apex_triggers, 'apex-triggers', ['Object', 'Triggers']),
            flows: this.generateCsvReport(analysisResults.flows, 'flows', ['Object', 'Flow Type', 'Flows']),
            workflow_rules: this.generateCsvReport(analysisResults.workflow_rules, 'workflow-rules', ['Object', 'Rules']),
            validation_rules: this.generateCsvReport(analysisResults.validation_rules, 'validation-rules', ['Object', 'Rules'])
        };

        for (const [type, generator] of Object.entries(csvReportGenerators)) {
            await generator;
        }

        console.log(`✅ Analysis reports generated in: ${reportsDir}`);
    }

    async generateCsvReport(data, filename, headers) {
        const reportsDir = path.join(__dirname, '..', 'reports', 'automation-analysis');
        const csvFilePath = path.join(reportsDir, `${filename}.csv`);

        const csvData = Object.entries(data).flatMap(([obj, value]) => {
            if (headers.length === 2) {
                return [{ Object: obj, [headers[1]]: value }];
            }
            return Object.entries(value).map(([flowType, flows]) => ({
                Object: obj,
                'Flow Type': flowType,
                Flows: flows
            }));
        });

        const writer = csvWriter({
            path: csvFilePath,
            header: headers.map(h => ({ id: h, title: h }))
        });

        await writer.writeRecords(csvData);
        console.log(`✅ ${filename} CSV report generated`);
    }
}

async function main() {
    const retrievedMetadataDir = path.join(__dirname, '..', 'retrieved-metadata');
    
    try {
        const analyzer = new AutomationAnalyzer(retrievedMetadataDir);
        const analysisResults = await analyzer.analyzeMetadata();
        await analyzer.generateReports(analysisResults);
        
        // Log summary
        Object.entries(analysisResults).forEach(([type, data]) => {
            const count = Object.keys(data).reduce((sum, key) => 
                sum + (Array.isArray(data[key]) ? data[key].length : 
                    Object.values(data[key]).reduce((typeSum, arr) => typeSum + arr.length, 0)
                ), 0);
            console.log(`📊 ${type.replace(/_/g, ' ').toUpperCase()}: ${count} items`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Automation metadata analysis failed:', error);
        process.exit(1);
    }
}

main();