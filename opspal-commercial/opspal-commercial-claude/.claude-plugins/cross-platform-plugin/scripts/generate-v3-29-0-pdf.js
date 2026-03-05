#!/usr/bin/env node

/**
 * Generate PDF from automation audit reports
 * Simple collation without stylesheet bugs
 */

const path = require('path');
const fs = require('fs');
const { mdToPdf } = require('md-to-pdf');

const outputDir = '/home/chris/Desktop/RevPal/Agents/opspal-internal/SFDC/instances/neonone/automation-audit-v3.29.0-validation-2025-10-22';

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

console.log('📄 Generating consolidated PDF report...');

// Build combined markdown with cover page
let combinedMarkdown = `<div class="cover-page">
<h1>Automation Audit Complete</h1>
<div class="metadata">
<p><strong>Organization:</strong> NeonOne</p>
<p><strong>Date:</strong> October 22, 2025</p>
<p><strong>Version:</strong> 3.29.0</p>
<p><strong>Reports:</strong> ${documents.length} Sections</p>
</div>
</div>

---

## Table of Contents

`;

// Add TOC
documents.forEach((doc, index) => {
  combinedMarkdown += `${index + 1}. [${doc.title}](#section-${index + 1})  \n`;
});

combinedMarkdown += '\n<div style="page-break-before: always;"></div>\n\n';

// Add each document
let added = 0;
documents.forEach((doc, index) => {
  const filePath = path.join(outputDir, doc.path);
  if (fs.existsSync(filePath)) {
    console.log(`   ✓ Adding: ${doc.title}`);
    const content = fs.readFileSync(filePath, 'utf8');

    // Add section with page break
    combinedMarkdown += `\n<div id="section-${index + 1}" style="page-break-before: always;"></div>\n\n`;
    combinedMarkdown += `# ${index + 1}. ${doc.title}\n\n`;

    // Add content (strip original H1 if present to avoid duplication)
    const cleanContent = content.replace(/^#\s+[^\n]+\n\n/, '');
    combinedMarkdown += cleanContent;

    combinedMarkdown += '\n\n';
    added++;
  } else {
    console.log(`   ⚠ Skipping (not found): ${doc.title}`);
  }
});

console.log(`\n📝 Collated ${added} document(s)`);

// Generate PDF with external CSS (avoids the stylesheet bug)
const pdfPath = path.join(outputDir, 'automation-audit-complete-neonone-v3.29.0-2025-10-22.pdf');

console.log(`📄 Converting to PDF: ${path.basename(pdfPath)}\n`);

mdToPdf({ content: combinedMarkdown }, {
  dest: pdfPath,
  launch_options: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  },
  pdf_options: {
    format: 'A4',
    margin: '20mm',
    printBackground: true,
    preferCSSPageSize: false,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="font-size:9px; text-align:center; width:100%; padding:5px;">
      <span class="pageNumber"></span> / <span class="totalPages"></span>
    </div>`
  },
  stylesheet: 'https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.1.0/github-markdown.min.css',
  body_class: 'markdown-body'
}).then((pdf) => {
  if (pdf && pdf.filename) {
    const stats = fs.statSync(pdf.filename);
    console.log(`✅ PDF generated successfully!`);
    console.log(`   Location: ${pdf.filename}`);
    console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  }
  process.exit(0);
}).catch(error => {
  console.error(`❌ PDF generation failed:`, error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});
