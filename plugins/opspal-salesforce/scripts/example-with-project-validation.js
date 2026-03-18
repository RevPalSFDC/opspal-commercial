#!/usr/bin/env node

/**
 * Example Script with Project Structure Validation
 * Shows how to add project requirements to any script
 */

// STEP 1: Add project structure validation at the very beginning
const { requireProjectStructure, createFileName, ensureProjectDirectory } = require('./lib/require-project-structure');

// This will exit if not in a project directory
requireProjectStructure();

// STEP 2: Now we're guaranteed to be in a project directory
const fs = require('fs');
const path = require('path');

console.log('✅ Project structure validated - proceeding with operation');

// STEP 3: Use proper file naming conventions
const scriptName = createFileName('analyze', 'contacts', 'script');
const dataFile = createFileName('processed', 'contacts', 'data');
const reportFile = createFileName('ANALYSIS', 'CONTACTS', 'report');

console.log(`
Example file names following conventions:
  Script: ${scriptName}
  Data:   ${dataFile}
  Report: ${reportFile}
`);

// STEP 4: Ensure directories exist before writing files
ensureProjectDirectory('data/output');
ensureProjectDirectory('reports/analysis');

// STEP 5: Example of creating a properly organized file
const sampleData = {
    timestamp: new Date().toISOString(),
    message: 'This file was created with proper organization',
    location: 'data/output directory as required'
};

const outputPath = path.join('data', 'output', dataFile);
fs.writeFileSync(outputPath, JSON.stringify(sampleData, null, 2));
console.log(`✅ Created sample file: ${outputPath}`);

// STEP 6: Create a report in the proper location
const reportContent = `# Analysis Report

Generated: ${new Date().toISOString()}

## Summary
This report was created following organization standards.

## File Locations
- Scripts: scripts/
- Data: data/
- Reports: reports/

All files follow naming conventions and are properly organized.
`;

const reportPath = path.join('reports', 'analysis', reportFile);
fs.writeFileSync(reportPath, reportContent);
console.log(`✅ Created report: ${reportPath}`);

console.log(`
This script demonstrates:
1. Requiring project structure before execution
2. Using proper file naming conventions
3. Creating files in designated directories
4. Following organization standards

To use this pattern in your scripts, add:
  const { requireProjectStructure } = require('./lib/require-project-structure');
  requireProjectStructure();

At the beginning of your script.
`);