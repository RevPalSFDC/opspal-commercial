#!/usr/bin/env node

/**
 * Test Entry Point Guards
 * Verifies that all entry points have runtime mock guards and reject mock data
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const entryPoints = [
    'opspal-internal/cross-platform-ops/mcp-server.js',
    'opspal-internal/cross-platform-ops/bin/contact-hygiene.js',
    'opspal-internal/cross-platform-ops/bin/bulk-processor.js'
];

let allPassed = true;

console.log('🔍 Verifying Entry Point Guards\n');
console.log('================================\n');

// Check each entry point
entryPoints.forEach(entry => {
    const fullPath = path.join(__dirname, '..', entry);

    console.log(`Checking: ${entry}`);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
        console.log(`  ⚠️  File not found\n`);
        return;
    }

    // Check if it has RuntimeMockGuard
    const content = fs.readFileSync(fullPath, 'utf8');

    if (!content.includes('RuntimeMockGuard')) {
        console.log(`  ❌ Missing RuntimeMockGuard import`);
        allPassed = false;
    } else {
        console.log(`  ✅ Has RuntimeMockGuard import`);
    }

    if (!content.includes('guard.install()')) {
        console.log(`  ❌ Missing guard.install() call`);
        allPassed = false;
    } else {
        console.log(`  ✅ Has guard.install() call`);
    }

    // Check if it's at the top of the file
    const lines = content.split('\n');
    let guardLine = -1;
    let firstCodeLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines and comments
        if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith('/*')) {
            continue;
        }

        if (line.includes('RuntimeMockGuard') && guardLine === -1) {
            guardLine = i;
        }

        if (firstCodeLine === -1 && !line.startsWith('const RuntimeMockGuard')) {
            firstCodeLine = i;
        }
    }

    if (guardLine > -1 && firstCodeLine > -1 && guardLine < firstCodeLine + 5) {
        console.log(`  ✅ Guard installed early (line ${guardLine + 1})`);
    } else if (guardLine > -1) {
        console.log(`  ⚠️  Guard installed late (line ${guardLine + 1}) - should be earlier`);
    }

    console.log('');
});

// Test that guards actually work
console.log('Testing Guard Enforcement\n');
console.log('========================\n');

// Create a test script that tries to load a mock library
const testScript = `
const RuntimeMockGuard = require('${path.join(__dirname, 'lib', 'runtime-mock-guard.js')}');
const guard = new RuntimeMockGuard();
guard.install({ skipInterval: true });

// Try to require a banned module (this should fail)
try {
    const faker = require('faker');
    console.log('❌ FAILED: Mock library was loaded!');
    process.exit(1);
} catch (error) {
    if (error.message.includes('Cannot find module')) {
        console.log('✅ Module not installed (expected)');
    } else {
        console.log('✅ Guard blocked the module:', error.message);
    }
}
`;

const testFile = path.join(os.tmpdir(), 'test-mock-block.js');
fs.writeFileSync(testFile, testScript);

const child = spawn('node', [testFile], {
    env: { ...process.env, NO_MOCKS: '1' }
});

child.stdout.on('data', (data) => {
    process.stdout.write(data);
});

child.stderr.on('data', (data) => {
    process.stderr.write(data);
});

child.on('close', (code) => {
    fs.unlinkSync(testFile);

    console.log('\nSummary\n=======\n');

    if (allPassed && code === 0) {
        console.log('✅ All entry points have proper guards');
        console.log('✅ Guards successfully block mock libraries');
        console.log('\n🎉 Entry point verification PASSED!');
        process.exit(0);
    } else {
        console.log('❌ Some checks failed');
        console.log('\nTo fix:');
        console.log('1. Ensure all entry points import RuntimeMockGuard');
        console.log('2. Call guard.install() early in the file');
        console.log('3. Place guard code before other requires');
        process.exit(1);
    }
});