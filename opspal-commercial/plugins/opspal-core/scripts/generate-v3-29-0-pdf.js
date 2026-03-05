#!/usr/bin/env node

/**
 * Generate PDF from automation audit reports
 * Uses the branded PDF pipeline (cover-toc profile)
 */

const path = require('path');
const fs = require('fs');
const PDFGenerator = require('./lib/pdf-generator');

// Output directory - use environment variable or accept from command line args
const outputDir = process.env.OUTPUT_DIR || process.argv[2] ||
  path.join(process.env.WORKSPACE_DIR || process.cwd(), 'instances', 'salesforce', 'gamma-corp', 'automation-audit-v3.29.0-validation-2025-10-22');

// Document list with titles
const documents = [
  { path: 'EXECUTIVE_SUMMARY_V2.md', title: 'Executive Summary' },
  { path: 'QUICK_REFERENCE_V2.md', title: 'Quick Reference' },
  { path: 'Master_Inventory_Summary.md', title: 'Master Automation Inventory' },
  { path: 'V3.29.0_ENHANCEMENTS_SUMMARY.md', title: 'v3.29.0 Enhancements' },
  { path: 'FIELD_WRITE_MAP_COLLISIONS.md', title: 'Field Collision Analysis' },
  { path: 'SCHEDULED_AUTOMATION_CALENDAR.md', title: 'Scheduled Automation Calendar' },
  { path: 'namespace-analysis-summary.md', title: 'Namespace Analysis' },
  { path: 'business-process-classification.md', title: 'Business Process Classification' },
  { path: 'validation-rules-audit.md', title: 'Validation Rules Audit' },
  { path: 'cascade-mapping-report.md', title: 'Automation Cascade Mapping' },
  { path: 'dependency-graph-erd.md', title: 'Dependency Graph & ERD' },
  { path: 'migration-recommendations.md', title: 'Migration Recommendations' },
  { path: 'risk-based-implementation-plan.md', title: 'Risk-Based Implementation Plan' }
];

const resolvedDocuments = documents.map((doc, index) => ({
  path: path.join(outputDir, doc.path),
  title: doc.title,
  order: index
}));

const pdfPath = path.join(outputDir, 'automation-audit-complete-gamma-corp-v3.29.0-2025-10-22.pdf');

const metadata = {
  title: 'Automation Audit Complete',
  subtitle: `Version 3.29.0 • ${documents.length} sections`,
  org: 'gamma-corp',
  date: '2025-10-22',
  version: '3.29.0'
};

async function main() {
  console.log('📄 Generating consolidated PDF report...');

  const generator = new PDFGenerator({
    verbose: true
  });

  try {
    const missing = resolvedDocuments.filter(doc => !fs.existsSync(doc.path));
    if (missing.length > 0) {
      console.warn('⚠️ Some documents are missing and will be skipped:');
      missing.forEach(doc => console.warn(`   - ${doc.title}: ${doc.path}`));
    }

    const availableDocuments = resolvedDocuments.filter(doc => fs.existsSync(doc.path));
    if (availableDocuments.length === 0) {
      throw new Error('No documents found to collate.');
    }

    await generator.collate(availableDocuments, pdfPath, {
      profile: 'cover-toc',
      metadata,
      renderMermaid: true,
      bookmarks: false
    });

    const stats = fs.statSync(pdfPath);
    console.log(`✅ PDF generated successfully!`);
    console.log(`   Location: ${pdfPath}`);
    console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error('❌ PDF generation failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
