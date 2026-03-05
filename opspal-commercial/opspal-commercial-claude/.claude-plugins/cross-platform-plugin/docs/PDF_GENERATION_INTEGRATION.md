# PDF Generation Integration Guide

## Overview

This guide shows how to integrate the PDF Generator into existing report generation workflows.

## For Report Generators (like executive-reporter.js)

### Basic Integration

```javascript
// In your report generator file
const path = require('path');

// At the end of report generation
async generateExecutiveReport(options = {}) {
    // ... existing report generation code ...

    // Save markdown reports
    const reportPaths = {
        summary: path.join(this.outputDir, `executive-summary-${timestamp}.md`),
        detailed: path.join(this.outputDir, `executive-detailed-${timestamp}.md`),
        metrics: path.join(this.outputDir, `executive-metrics-${timestamp}.md`),
        recommendations: path.join(this.outputDir, `executive-recommendations-${timestamp}.md`)
    };

    for (const [type, content] of Object.entries(reports)) {
        fs.writeFileSync(reportPaths[type], content);
    }

    // Generate consolidated PDF if requested
    if (options.pdf) {
        await this.generatePDF(reportPaths, timestamp);
    }

    return reportPaths;
}

async generatePDF(reportPaths, timestamp) {
    // Import PDF Generator from cross-platform-plugin
    const PDFGenerator = require('../../cross-platform-plugin/scripts/lib/pdf-generator');

    const generator = new PDFGenerator({ verbose: true });

    // Prepare documents for collation
    const documents = [
        { path: reportPaths.summary, title: 'Executive Summary', order: 0 },
        { path: reportPaths.metrics, title: 'Key Metrics', order: 1 },
        { path: reportPaths.detailed, title: 'Detailed Analysis', order: 2 },
        { path: reportPaths.recommendations, title: 'Recommendations', order: 3 }
    ];

    // Generate PDF
    const pdfPath = path.join(this.outputDir, `executive-report-${timestamp}.pdf`);

    await generator.collate(documents, pdfPath, {
        toc: true,
        bookmarks: true,
        renderMermaid: true,
        coverPage: {
            template: 'executive-report'
        },
        metadata: {
            title: 'Executive Report',
            org: process.env.ORG_NAME || 'Organization',
            date: timestamp,
            version: '1.0'
        }
    });

    console.log(`\n✅ PDF report generated: ${pdfPath}`);
    return pdfPath;
}
```

## For Automation Audit Workflows

### Integration in automation-audit-v2-orchestrator.js

```javascript
// At end of audit workflow
async function finalizeAudit(outputDir, orgName, results) {
    // ... existing finalization code ...

    // Generate comprehensive PDF
    const PDFGenerator = require('../../../cross-platform-plugin/scripts/lib/pdf-generator');
    const generator = new PDFGenerator({ verbose: true });

    const documents = [
        { path: path.join(outputDir, 'AUTOMATION_SUMMARY.md'), title: 'Executive Summary' },
        { path: path.join(outputDir, 'CONFLICTS.md'), title: 'Conflict Analysis' },
        { path: path.join(outputDir, 'FIELD_COLLISION_ANALYSIS.md'), title: 'Field Collisions' },
        { path: path.join(outputDir, 'PRIORITIZED_REMEDIATION_PLAN.md'), title: 'Remediation Plan' }
    ];

    // Add diagram document if it exists
    const diagramDoc = path.join(outputDir, 'AUTOMATION_ARCHITECTURE.md');
    if (fs.existsSync(diagramDoc)) {
        documents.push({ path: diagramDoc, title: 'Architecture Diagrams' });
    }

    const pdfPath = path.join(outputDir, `automation-audit-complete-${orgName}-${timestamp}.pdf`);

    await generator.collate(documents, pdfPath, {
        toc: true,
        bookmarks: true,
        renderMermaid: true,
        coverPage: {
            template: 'salesforce-audit'
        },
        metadata: {
            title: `Automation Audit - ${orgName}`,
            org: orgName,
            date: new Date().toISOString().split('T')[0],
            version: results.version || '1.0'
        }
    });

    return pdfPath;
}
```

## For Single Document Reports

### Simple Integration

```javascript
const PDFGenerator = require('../../../cross-platform-plugin/scripts/lib/pdf-generator');

async function generateConflictReportPDF(markdownPath, orgName) {
    const generator = new PDFGenerator({ verbose: false });

    const pdfPath = markdownPath.replace('.md', '.pdf');

    await generator.convertMarkdown(markdownPath, pdfPath, {
        renderMermaid: true,
        metadata: {
            title: 'Conflict Analysis Report',
            org: orgName,
            date: new Date().toISOString().split('T')[0]
        }
    });

    return pdfPath;
}
```

## For HubSpot Assessments

### Integration Pattern

```javascript
// In hubspot-assessment-analyzer.js or similar
async finalizeAssessment(portalId, assessmentType, reports) {
    const PDFGenerator = require('../../../cross-platform-plugin/scripts/lib/pdf-generator');
    const generator = new PDFGenerator({ verbose: true });

    const documents = Object.entries(reports).map(([key, path], index) => ({
        path,
        title: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        order: index
    }));

    const pdfPath = `assessments/${portalId}/${assessmentType}-complete.pdf`;

    await generator.collate(documents, pdfPath, {
        toc: true,
        renderMermaid: true,
        coverPage: {
            template: 'hubspot-assessment'
        },
        metadata: {
            title: `${assessmentType} Assessment`,
            portal: `Portal ${portalId}`,
            assessmentType,
            date: new Date().toISOString().split('T')[0]
        }
    });

    return pdfPath;
}
```

## CLI Usage from Agents

### Invoking from Agent Code

```javascript
// In agent implementation
const { execSync } = require('child_process');

// Generate PDF using CLI
execSync(
    `node ../../cross-platform-plugin/scripts/lib/pdf-generator.js \\
     --collate "instances/acme/*.md" instances/acme/complete.pdf \\
     --toc --render-mermaid --verbose`,
    { stdio: 'inherit' }
);
```

## Error Handling Best Practices

```javascript
async function generatePDFSafely(documents, outputPath, options) {
    const PDFGenerator = require('../../../cross-platform-plugin/scripts/lib/pdf-generator');

    try {
        const generator = new PDFGenerator({ verbose: options.verbose });
        const pdfPath = await generator.collate(documents, outputPath, options);

        // Verify PDF was created and has reasonable size
        const stats = fs.statSync(pdfPath);
        if (stats.size === 0) {
            throw new Error('Generated PDF is empty');
        }

        if (stats.size > 50 * 1024 * 1024) {
            console.warn(`⚠️  PDF is very large: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
        }

        return pdfPath;

    } catch (error) {
        console.error('❌ PDF generation failed:', error.message);
        console.log('📝 Markdown reports are still available');

        // Don't throw - allow workflow to continue with markdown files
        return null;
    }
}
```

## Environment-Specific Configuration

```javascript
// config/pdf-generation.js
module.exports = {
    // Development: Disable PDF for speed
    development: {
        autogenerate: false,
        verbose: true
    },

    // Production: Always generate PDFs
    production: {
        autogenerate: true,
        verbose: false,
        coverPage: true
    },

    // CI/CD: Generate but don't upload
    ci: {
        autogenerate: true,
        verbose: true,
        upload: false
    }
};

// Usage
const config = require('./config/pdf-generation')[process.env.NODE_ENV || 'development'];

if (config.autogenerate) {
    await generatePDF(...);
}
```

## Testing PDF Generation

```javascript
// test/pdf-generation.test.js
const PDFGenerator = require('../scripts/lib/pdf-generator');
const fs = require('fs').promises;
const path = require('path');

describe('PDF Generation', () => {
    it('should generate single document PDF', async () => {
        const generator = new PDFGenerator();
        const inputPath = path.join(__dirname, 'fixtures/sample-report.md');
        const outputPath = path.join(__dirname, 'output/test.pdf');

        await generator.convertMarkdown(inputPath, outputPath, {
            renderMermaid: false
        });

        const stats = await fs.stat(outputPath);
        expect(stats.size).toBeGreaterThan(0);
    });

    it('should collate multiple documents', async () => {
        const generator = new PDFGenerator();
        const documents = [
            { path: 'fixtures/doc1.md', title: 'Document 1' },
            { path: 'fixtures/doc2.md', title: 'Document 2' }
        ];

        await generator.collate(documents, 'output/collated.pdf', {
            toc: true
        });

        const stats = await fs.stat('output/collated.pdf');
        expect(stats.size).toBeGreaterThan(0);
    });
});
```

## Performance Optimization

```javascript
// For large report sets, generate PDFs in parallel
async function generateMultiplePDFs(reports) {
    const PDFGenerator = require('../../../cross-platform-plugin/scripts/lib/pdf-generator');
    const generator = new PDFGenerator();

    // Generate PDFs in parallel (max 3 concurrent)
    const concurrency = 3;
    const batches = [];

    for (let i = 0; i < reports.length; i += concurrency) {
        const batch = reports.slice(i, i + concurrency);
        const promises = batch.map(report =>
            generator.convertMarkdown(report.input, report.output, report.options)
        );
        batches.push(Promise.all(promises));
    }

    await Promise.all(batches);
}
```

## Monitoring and Metrics

```javascript
// Track PDF generation metrics
const pdfMetrics = {
    totalGenerated: 0,
    totalFailed: 0,
    averageSize: 0,
    averageTime: 0
};

async function generatePDFWithMetrics(documents, outputPath, options) {
    const startTime = Date.now();

    try {
        const pdfPath = await generatePDF(documents, outputPath, options);
        const stats = fs.statSync(pdfPath);

        pdfMetrics.totalGenerated++;
        pdfMetrics.averageSize = (pdfMetrics.averageSize * (pdfMetrics.totalGenerated - 1) + stats.size) / pdfMetrics.totalGenerated;
        pdfMetrics.averageTime = (pdfMetrics.averageTime * (pdfMetrics.totalGenerated - 1) + (Date.now() - startTime)) / pdfMetrics.totalGenerated;

        return pdfPath;

    } catch (error) {
        pdfMetrics.totalFailed++;
        throw error;
    }
}
```

---

**For more examples, see:**
- `.claude-plugins/salesforce-plugin/scripts/lib/executive-reporter.js` (lines 54-56 - PDF stub)
- `.claude-plugins/cross-platform-plugin/scripts/lib/pdf-generator.js` (Complete implementation)
- `.claude-plugins/cross-platform-plugin/agents/pdf-generator.md` (Agent documentation)
