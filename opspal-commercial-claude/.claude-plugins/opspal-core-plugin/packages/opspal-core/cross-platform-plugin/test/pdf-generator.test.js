/**
 * PDF Generator Tests
 *
 * Basic tests for PDF generation functionality
 * Run with: node test/pdf-generator.test.js
 */

const fs = require('fs').promises;
const path = require('path');
const PDFGenerator = require('../scripts/lib/pdf-generator');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const OUTPUT_DIR = path.join(__dirname, 'output');

async function setup() {
    // Create test directories
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Create sample markdown file
    const sampleMarkdown = `# Test Report

## Introduction

This is a test report for PDF generation.

## Data Analysis

Here are some key findings:

- Finding 1: Data quality is good
- Finding 2: Performance is acceptable
- Finding 3: No critical issues found

## Conclusion

The system is operating normally.
`;

    await fs.writeFile(
        path.join(FIXTURES_DIR, 'sample-report.md'),
        sampleMarkdown,
        'utf8'
    );

    console.log('✅ Test fixtures created');
}

async function testSingleDocumentPDF() {
    console.log('\n📝 Test: Single Document PDF Generation');

    const generator = new PDFGenerator({ verbose: false });
    const inputPath = path.join(FIXTURES_DIR, 'sample-report.md');
    const outputPath = path.join(OUTPUT_DIR, 'test-single.pdf');

    try {
        await generator.convertMarkdown(inputPath, outputPath, {
            renderMermaid: false
        });

        const stats = await fs.stat(outputPath);

        if (stats.size > 0) {
            console.log(`✅ PASS: PDF generated (${(stats.size / 1024).toFixed(2)} KB)`);
            return true;
        } else {
            console.log('❌ FAIL: PDF is empty');
            return false;
        }
    } catch (error) {
        console.log(`❌ FAIL: ${error.message}`);
        return false;
        // Test function: Return false to indicate test failure (not throwing is intentional)
    }
}

async function testMultiDocumentCollation() {
    console.log('\n📚 Test: Multi-Document Collation');

    // Create additional test documents
    await fs.writeFile(
        path.join(FIXTURES_DIR, 'doc1.md'),
        '# Document 1\n\nFirst document content.',
        'utf8'
    );

    await fs.writeFile(
        path.join(FIXTURES_DIR, 'doc2.md'),
        '# Document 2\n\nSecond document content.',
        'utf8'
    );

    const generator = new PDFGenerator({ verbose: false });

    const documents = [
        { path: path.join(FIXTURES_DIR, 'doc1.md'), title: 'Document 1' },
        { path: path.join(FIXTURES_DIR, 'doc2.md'), title: 'Document 2' }
    ];

    const outputPath = path.join(OUTPUT_DIR, 'test-collated.pdf');

    try {
        await generator.collate(documents, outputPath, {
            toc: true,
            renderMermaid: false
        });

        const stats = await fs.stat(outputPath);

        if (stats.size > 0) {
            console.log(`✅ PASS: Collated PDF generated (${(stats.size / 1024).toFixed(2)} KB)`);
            return true;
        } else {
            console.log('❌ FAIL: Collated PDF is empty');
            return false;
        }
    } catch (error) {
        console.log(`❌ FAIL: ${error.message}`);
        return false;
    }
}

async function testDocumentCollator() {
    console.log('\n📑 Test: Document Collator');

    const DocumentCollator = require('../scripts/lib/document-collator');
    const collator = new DocumentCollator({ verbose: false });

    const documents = [
        { path: path.join(FIXTURES_DIR, 'doc1.md'), title: 'Document 1' },
        { path: path.join(FIXTURES_DIR, 'doc2.md'), title: 'Document 2' }
    ];

    try {
        const collated = await collator.collate(documents, {
            toc: true,
            tocDepth: 3
        });

        if (collated.includes('## Table of Contents')) {
            console.log('✅ PASS: TOC generated correctly');
            return true;
        } else {
            console.log('❌ FAIL: TOC not found in collated markdown');
            return false;
        }
    } catch (error) {
        console.log(`❌ FAIL: ${error.message}`);
        return false;
    }
}

async function cleanup() {
    console.log('\n🧹 Cleaning up test files...');
    // Note: In a real test suite, you might want to keep output for inspection
    // For now, we'll leave the files for manual verification
    console.log('ℹ️  Output files preserved in test/output/ for manual verification');
}

async function runTests() {
    console.log('🚀 PDF Generator Test Suite\n');
    console.log('=' .repeat(50));

    await setup();

    const results = {
        passed: 0,
        failed: 0,
        total: 0
    };

    // Run tests
    const tests = [
        testSingleDocumentPDF,
        testDocumentCollator,
        testMultiDocumentCollation
    ];

    for (const test of tests) {
        results.total++;
        const passed = await test();
        if (passed) {
            results.passed++;
        } else {
            results.failed++;
        }
    }

    await cleanup();

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('\n📊 Test Summary:');
    console.log(`   Total: ${results.total}`);
    console.log(`   ✅ Passed: ${results.passed}`);
    console.log(`   ❌ Failed: ${results.failed}`);

    if (results.failed === 0) {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed');
        process.exit(1);
    }
}

// Run tests if called directly
if (require.main === module) {
    runTests().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { runTests };
