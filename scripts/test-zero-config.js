#!/usr/bin/env node

/**
 * Test Zero-Config No-Mocks Enforcement
 * Verifies the policy works without any user setup
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🧪 Testing Zero-Configuration No-Mocks Enforcement');
console.log('==================================================\n');

// Test 1: Verify auto-activation
console.log('Test 1: Auto-activation without environment variable');

const test1Code = `
// Don't set NO_MOCKS - it should auto-activate
delete process.env.NO_MOCKS;

const project = require('${process.cwd()}/index.js');
console.log('NO_MOCKS auto-set to:', process.env.NO_MOCKS);
console.log('Policy enabled:', project.noMocksEnabled);

if (process.env.NO_MOCKS === '1' && project.noMocksEnabled) {
    console.log('✅ Auto-activation successful');
    process.exit(0);
} else {
    console.log('❌ Auto-activation failed');
    process.exit(1);
}
`;

const test1File = path.join(os.tmpdir(), 'test-auto-activation.js');
fs.writeFileSync(test1File, test1Code);

const test1 = spawn('node', [test1File], {
    env: { ...process.env, NO_MOCKS: undefined }  // Explicitly unset
});

test1.stdout.on('data', (data) => process.stdout.write(data));
test1.stderr.on('data', (data) => process.stderr.write(data));

test1.on('close', (code) => {
    fs.unlinkSync(test1File);

    if (code === 0) {
        console.log('✅ Test 1 PASSED\n');

        // Test 2: Verify blocking works
        console.log('Test 2: Mock library blocking with zero config');

        const test2Code = `
// No environment setup - should still block
delete process.env.NO_MOCKS;
require('${process.cwd()}/index.js');

// Try to load a mock library
require('faker');
console.log('❌ Mock library was NOT blocked');
process.exit(1);
`;

        const test2File = path.join(os.tmpdir(), 'test-blocking.js');
        fs.writeFileSync(test2File, test2Code);

        const test2 = spawn('node', [test2File], {
            env: { ...process.env, NO_MOCKS: undefined }
        });

        let errorOutput = '';
        test2.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        test2.on('close', (code2) => {
            fs.unlinkSync(test2File);

            if (code2 === 1 && errorOutput.includes('MOCK POLICY VIOLATION')) {
                console.log('✅ Mock library was blocked automatically');
                console.log('✅ Test 2 PASSED\n');

                console.log('=================================================');
                console.log('🎉 SUCCESS: Zero-Configuration Enforcement Works!');
                console.log('=================================================');
                console.log('');
                console.log('The no-mocks policy is now automatically enforced:');
                console.log('  • No environment variables required');
                console.log('  • No user configuration needed');
                console.log('  • Works on any system that clones the repo');
                console.log('  • Cannot be accidentally disabled');
                console.log('');
                console.log('To explicitly disable (not recommended):');
                console.log('  export NO_MOCKS=0');
                process.exit(0);
            } else {
                console.log('❌ Test 2 FAILED - Mock was not blocked');
                process.exit(1);
            }
        });
    } else {
        console.log('❌ Test 1 FAILED');
        process.exit(1);
    }
});