#!/usr/bin/env node
/**
 * Intake Document Analyzer
 *
 * Analyzes uploaded documents (PDF, Word, text, markdown) and extracts
 * project context to pre-fill the intake form.
 *
 * Usage:
 *   node intake-document-analyzer.js <document-path> [--output <json-path>]
 *   node intake-document-analyzer.js ./project-brief.pdf --output ./intake-data.json
 *   node intake-document-analyzer.js ./sow.docx --open-form
 *
 * Supported formats: .pdf, .doc, .docx, .txt, .md, .json
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class IntakeDocumentAnalyzer {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      outputDir: options.outputDir || process.cwd(),
      ...options
    };

    this.extractionPrompt = this.buildExtractionPrompt();
  }

  /**
   * Build the extraction prompt for Claude
   */
  buildExtractionPrompt() {
    return `You are analyzing a project document to extract structured information for a project intake form.

Extract the following information from the document. Return ONLY valid JSON (no markdown code blocks, no explanation).

Required JSON structure:
{
  "projectIdentity": {
    "projectName": "string - the project name/title",
    "projectType": "string - one of: salesforce-implementation, salesforce-optimization, hubspot-implementation, hubspot-optimization, cpq-configuration, data-migration, integration-project, process-automation, cross-platform-integration, custom",
    "priority": "string - one of: low, medium, high, critical",
    "projectOwner": {
      "name": "string - project owner/sponsor name",
      "email": "string - email if found",
      "phone": "string - phone if found",
      "department": "string - department if found"
    }
  },
  "goalsObjectives": {
    "businessObjective": "string - main business goal/objective",
    "successMetrics": [
      { "metric": "string", "target": "string", "measurement": "string" }
    ],
    "userImpact": "string - expected impact on users"
  },
  "scope": {
    "inScope": [
      { "feature": "string - feature name", "description": "string - description" }
    ],
    "outOfScope": ["string - items explicitly out of scope"],
    "assumptions": [
      { "assumption": "string", "validated": false }
    ],
    "constraints": [
      { "type": "string - timeline/technical/resource/budget", "constraint": "string" }
    ]
  },
  "dataSources": {
    "primarySources": [
      { "name": "string", "type": "string - salesforce/hubspot/spreadsheet/csv/database/api", "direction": "string - One-Way/Two-Way", "estimatedRecords": "string" }
    ],
    "integrations": [
      { "system": "string", "type": "string", "direction": "string" }
    ],
    "existingAutomations": [
      { "name": "string", "impact": "string" }
    ]
  },
  "timelineBudget": {
    "targetStartDate": "string - YYYY-MM-DD format if found",
    "targetEndDate": "string - YYYY-MM-DD format if found",
    "milestones": [
      { "name": "string", "date": "string - YYYY-MM-DD", "status": "planned" }
    ],
    "hardDeadline": false,
    "deadlineReason": "string - if hard deadline",
    "budgetRange": "string - one of: <$5k, $5k-$15k, $15k-$50k, $50k-$100k, >$100k",
    "budgetFlexibility": "string - one of: fixed, some-flexibility, flexible"
  },
  "dependenciesRisks": {
    "dependencies": [
      { "name": "string", "type": "string - internal/external/technical", "status": "string - confirmed/pending/unknown", "blocksIfDelayed": false, "description": "string" }
    ],
    "risks": [
      { "name": "string", "impact": "string - low/medium/high", "probability": "string - low/medium/high", "mitigation": "string" }
    ]
  },
  "technicalRequirements": {
    "platforms": ["string - salesforce/hubspot/custom"],
    "salesforceOrg": {
      "orgAlias": "string - if known",
      "orgType": "string - production/sandbox/scratch",
      "edition": "string - if known",
      "hasCPQ": false,
      "hasExperienceCloud": false
    },
    "complexity": "string - simple/moderate/complex/very-complex",
    "complexityFactors": ["string - factors contributing to complexity"]
  },
  "approvalSignoff": {
    "approvers": [
      { "name": "string", "type": "string - business/technical", "approved": false }
    ],
    "communicationPlan": {
      "primaryChannel": "string - email/slack/teams/other",
      "updateFrequency": "string - daily/weekly/biweekly/monthly",
      "notificationLevel": "string - all-updates/milestones-only/critical-only"
    },
    "additionalNotes": "string - any other relevant notes"
  },
  "extractionConfidence": {
    "overall": "string - high/medium/low",
    "missingFields": ["string - fields that couldn't be extracted"],
    "inferredFields": ["string - fields that were inferred rather than explicitly stated"]
  }
}

Rules:
1. Only include fields where you found relevant information
2. Use null for fields with no data (don't make up information)
3. For dates, convert to YYYY-MM-DD format
4. For project type, map to the closest matching option
5. Be conservative - if unsure, mark confidence as low
6. List fields that need clarification in missingFields

Document content:
`;
  }

  /**
   * Analyze a document and extract intake data
   */
  async analyze(documentPath) {
    if (!fs.existsSync(documentPath)) {
      throw new Error(`Document not found: ${documentPath}`);
    }

    const ext = path.extname(documentPath).toLowerCase();

    // Extract text content based on file type
    let textContent;
    try {
      textContent = await this.extractText(documentPath, ext);
    } catch (error) {
      throw new Error(`Failed to extract text from document: ${error.message}`);
    }

    if (!textContent || textContent.trim().length < 50) {
      throw new Error('Document appears to be empty or too short to analyze');
    }

    if (this.options.verbose) {
      console.log(`Extracted ${textContent.length} characters from document`);
    }

    // If it's already JSON, try to parse and map it
    if (ext === '.json') {
      return this.mapExistingJson(textContent, documentPath);
    }

    // Use Claude to analyze the document
    const intakeData = await this.analyzeWithClaude(textContent, documentPath);

    return intakeData;
  }

  /**
   * Extract text from various document formats
   */
  async extractText(documentPath, ext) {
    switch (ext) {
      case '.txt':
      case '.md':
        return fs.readFileSync(documentPath, 'utf-8');

      case '.json':
        return fs.readFileSync(documentPath, 'utf-8');

      case '.pdf':
        return this.extractPdfText(documentPath);

      case '.doc':
      case '.docx':
        return this.extractWordText(documentPath);

      case '.csv':
        return this.extractCsvText(documentPath);

      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  /**
   * Extract text from PDF using pdftotext or similar
   */
  extractPdfText(pdfPath) {
    try {
      // Try pdftotext first (poppler-utils)
      const text = execSync(`pdftotext "${pdfPath}" -`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      });
      return text;
    } catch (e) {
      try {
        // Try pdf2txt.py (pdfminer)
        const text = execSync(`pdf2txt.py "${pdfPath}"`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        });
        return text;
      } catch (e2) {
        throw new Error('PDF extraction requires pdftotext (poppler-utils) or pdfminer. Install with: sudo apt-get install poppler-utils');
      }
    }
  }

  /**
   * Extract text from Word documents
   */
  extractWordText(docPath) {
    try {
      // Try pandoc first
      const text = execSync(`pandoc "${docPath}" -t plain`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      });
      return text;
    } catch (e) {
      try {
        // Try antiword for .doc files
        if (docPath.endsWith('.doc')) {
          const text = execSync(`antiword "${docPath}"`, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
          });
          return text;
        }
        // Try docx2txt for .docx
        const text = execSync(`docx2txt "${docPath}" -`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        });
        return text;
      } catch (e2) {
        throw new Error('Word extraction requires pandoc or antiword/docx2txt. Install with: sudo apt-get install pandoc');
      }
    }
  }

  /**
   * Extract text from CSV
   */
  extractCsvText(csvPath) {
    const content = fs.readFileSync(csvPath, 'utf-8');
    // Convert CSV to readable format
    const lines = content.split('\n');
    if (lines.length > 0) {
      const headers = lines[0].split(',');
      let text = `CSV Document with columns: ${headers.join(', ')}\n\n`;
      text += `Total rows: ${lines.length - 1}\n\n`;
      // Include first few rows as sample
      text += 'Sample data:\n';
      for (let i = 1; i < Math.min(10, lines.length); i++) {
        text += lines[i] + '\n';
      }
      return text;
    }
    return content;
  }

  /**
   * Map existing JSON to intake format
   */
  mapExistingJson(jsonContent, documentPath) {
    try {
      const data = JSON.parse(jsonContent);

      // Check if it's already in intake format
      if (data.projectIdentity || data.goalsObjectives || data.scope) {
        console.log('Document appears to be in intake format already');
        return {
          ...data,
          metadata: {
            ...data.metadata,
            sourceDocument: path.basename(documentPath),
            analyzedAt: new Date().toISOString()
          }
        };
      }

      // Otherwise, try to map common field names
      return this.analyzeWithClaude(JSON.stringify(data, null, 2), documentPath);
    } catch (e) {
      throw new Error(`Invalid JSON file: ${e.message}`);
    }
  }

  /**
   * Use Claude to analyze document content
   */
  async analyzeWithClaude(textContent, documentPath) {
    // Truncate if too long (Claude context limits)
    const maxChars = 100000;
    if (textContent.length > maxChars) {
      console.log(`Document truncated from ${textContent.length} to ${maxChars} characters`);
      textContent = textContent.substring(0, maxChars) + '\n\n[Document truncated...]';
    }

    const fullPrompt = this.extractionPrompt + textContent;

    // Write prompt to temp file for Claude to process
    const tempPromptPath = `/tmp/intake-analysis-prompt-${Date.now()}.txt`;
    const tempResponsePath = `/tmp/intake-analysis-response-${Date.now()}.json`;

    fs.writeFileSync(tempPromptPath, fullPrompt);

    try {
      // Use Claude CLI to process
      console.log('Analyzing document with Claude...');

      const response = execSync(
        `cat "${tempPromptPath}" | claude --print --dangerously-skip-permissions 2>/dev/null || cat "${tempPromptPath}" | claude -p 2>/dev/null`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120000 // 2 minute timeout
        }
      );

      // Parse the JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Claude did not return valid JSON');
      }

      const intakeData = JSON.parse(jsonMatch[0]);

      // Add metadata
      intakeData.metadata = {
        formVersion: '1.0.0',
        sourceDocument: path.basename(documentPath),
        analyzedAt: new Date().toISOString(),
        extractionMethod: 'claude-analysis'
      };

      // Cleanup
      fs.unlinkSync(tempPromptPath);

      return intakeData;

    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(tempPromptPath)) fs.unlinkSync(tempPromptPath);

      if (error.message.includes('not return valid JSON')) {
        throw error;
      }
      throw new Error(`Claude analysis failed: ${error.message}`);
    }
  }

  /**
   * Save extracted data to file
   */
  saveToFile(data, outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Intake data saved to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Generate pre-filled form HTML
   */
  async generatePrefilledForm(data, outputPath) {
    const IntakeFormGenerator = require('./intake-form-generator');
    const generator = new IntakeFormGenerator();

    // Generate the form HTML
    let html = generator.generate();

    // Inject the pre-fill data
    const prefilledScript = `
    <script>
    // Pre-fill data from document analysis
    const prefillData = ${JSON.stringify(data, null, 2)};

    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(() => {
        populateForm(prefillData);
        showToast('Form pre-filled from document analysis', 'success');
      }, 500);
    });
    </script>
    `;

    // Insert before closing body tag
    html = html.replace('</body>', prefilledScript + '</body>');

    fs.writeFileSync(outputPath, html);
    console.log(`Pre-filled form saved to: ${outputPath}`);
    return outputPath;
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Intake Document Analyzer
========================

Analyzes project documents and extracts structured intake data.

Usage:
  node intake-document-analyzer.js <document-path> [options]

Options:
  --output <path>    Save extracted JSON to specified path
  --open-form        Generate and open pre-filled HTML form
  --verbose          Show detailed extraction progress
  --help             Show this help message

Supported formats:
  .pdf    PDF documents (requires pdftotext or pdfminer)
  .doc    Word 97-2003 (requires pandoc or antiword)
  .docx   Word 2007+ (requires pandoc or docx2txt)
  .txt    Plain text files
  .md     Markdown files
  .json   JSON files (will attempt to map to intake format)
  .csv    CSV files

Examples:
  # Analyze and output JSON
  node intake-document-analyzer.js ./project-brief.pdf --output ./intake-data.json

  # Analyze and open pre-filled form
  node intake-document-analyzer.js ./sow.docx --open-form

  # Analyze with verbose output
  node intake-document-analyzer.js ./requirements.md --verbose

Dependencies:
  PDF: sudo apt-get install poppler-utils
  Word: sudo apt-get install pandoc
`);
    process.exit(0);
  }

  const documentPath = args[0];
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex > -1 ? args[outputIndex + 1] : null;
  const openForm = args.includes('--open-form');
  const verbose = args.includes('--verbose');

  const analyzer = new IntakeDocumentAnalyzer({ verbose });

  try {
    console.log(`Analyzing: ${documentPath}`);
    const data = await analyzer.analyze(documentPath);

    // Report extraction confidence
    if (data.extractionConfidence) {
      console.log(`\nExtraction confidence: ${data.extractionConfidence.overall}`);
      if (data.extractionConfidence.missingFields?.length > 0) {
        console.log(`Missing fields: ${data.extractionConfidence.missingFields.join(', ')}`);
      }
      if (data.extractionConfidence.inferredFields?.length > 0) {
        console.log(`Inferred fields: ${data.extractionConfidence.inferredFields.join(', ')}`);
      }
    }

    if (outputPath) {
      analyzer.saveToFile(data, outputPath);
    }

    if (openForm) {
      const formPath = outputPath ?
        outputPath.replace('.json', '-form.html') :
        `/tmp/intake-prefilled-${Date.now()}.html`;

      await analyzer.generatePrefilledForm(data, formPath);

      // Try to open in browser
      try {
        execSync(`xdg-open "${formPath}" 2>/dev/null || open "${formPath}" 2>/dev/null`);
      } catch (e) {
        console.log(`Open the form manually: ${formPath}`);
      }
    }

    if (!outputPath && !openForm) {
      // Print JSON to stdout
      console.log('\nExtracted intake data:');
      console.log(JSON.stringify(data, null, 2));
    }

    console.log('\n✅ Document analysis complete');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
module.exports = IntakeDocumentAnalyzer;

// Run CLI if executed directly
if (require.main === module) {
  main();
}
