#!/usr/bin/env node

/**
 * Runtime Mock Guard
 * Enforces NO_MOCKS=1 environment variable and prevents mock library usage
 */

const path = require('path');
const fs = require('fs');
const Module = require('module');

class RuntimeMockGuard {
    constructor() {
        this.bannedModules = [
            '@faker-js/faker',
            'faker',
            'chance',
            'casual',
            'msw',
            'nock',
            'sinon',
            'testdouble',
            'mimesis',
            'factory-boy',
            'responses',
            'pytest',
            'unittest.mock'
        ];

        this.bannedPaths = [
            '**/mock*/**',
            '**/fixture*/**',
            '**/sample*/**',
            '**/stub*/**',
            '**/__mocks__/**'
        ];

        this.allowedMockAgent = process.env.ALLOWED_MOCK_AGENT_NAME || 'mock-data-generator';
    }

    /**
     * Check if NO_MOCKS environment variable is set
     * Default: ENABLED unless explicitly disabled with NO_MOCKS=0
     */
    isNoMocksEnabled() {
        // Auto-enable by default for zero-config enforcement
        if (process.env.NO_MOCKS === undefined) {
            process.env.NO_MOCKS = '1';  // Auto-set for this process and children
            return true;
        }
        return process.env.NO_MOCKS !== '0';  // Only disabled if explicitly set to '0'
    }

    /**
     * Validate that no mock modules are loaded
     */
    validateLoadedModules() {
        if (!this.isNoMocksEnabled()) {
            return true;
        }

        const loadedModules = Object.keys(require.cache).join('|');

        for (const banned of this.bannedModules) {
            if (loadedModules.includes(banned)) {
                this.handleViolation(`Banned mocking library loaded: ${banned}`);
                return false;
            }
        }

        // Check for mock paths
        for (const modulePath of Object.keys(require.cache)) {
            if (this.isMockPath(modulePath)) {
                this.handleViolation(`Mock path loaded: ${modulePath}`);
                return false;
            }
        }

        return true;
    }

    /**
     * Check if a path matches mock patterns
     */
    isMockPath(filePath) {
        const normalized = path.normalize(filePath).toLowerCase();
        const patterns = [
            /\/mock[^\/]*\//,
            /\/fixture[^\/]*\//,
            /\/sample[^\/]*\//,
            /\/stub[^\/]*\//,
            /\/__mocks__\//,
            /_mock\./,
            /_fixture\./,
            /_sample\./,
            /_stub\./
        ];

        return patterns.some(pattern => pattern.test(normalized));
    }

    /**
     * Handle violations of the no-mocks policy
     */
    handleViolation(message) {
        const errorMsg = `DATA ACCESS FAILURE: ${message} under NO_MOCKS=1. No mock or fabricated data used.`;

        console.error('\n' + '='.repeat(80));
        console.error('❌ MOCK POLICY VIOLATION DETECTED');
        console.error('='.repeat(80));
        console.error(errorMsg);
        console.error('Stack trace:', new Error().stack);
        console.error('='.repeat(80) + '\n');

        // Exit with non-zero status
        process.exit(1);
    }

    /**
     * Install guard as early as possible in application lifecycle
     */
    install(options = {}) {
        const { skipInterval = false } = options;

        if (!this.isNoMocksEnabled()) {
            console.log('ℹ️  Runtime mock guard inactive (NO_MOCKS != 1)');
            return;
        }

        console.log('✅ Runtime mock guard active (NO_MOCKS=1)');

        // Check current state
        this.validateLoadedModules();

        // Monitor future requires
        const originalRequire = Module.prototype.require;
        const self = this;

        Module.prototype.require = function(id) {
            // Check if this is a banned module
            if (self.bannedModules.includes(id)) {
                self.handleViolation(`Attempted to require banned module: ${id}`);
            }

            // Check if the resolved path matches mock patterns
            try {
                const resolved = require.resolve(id);
                if (self.isMockPath(resolved)) {
                    self.handleViolation(`Attempted to require mock path: ${resolved}`);
                }
            } catch (e) {
                // Module not found, let original require handle it
            }

            return originalRequire.apply(this, arguments);
        };

        // Set up interval validation (skip in test mode)
        if (!skipInterval) {
            setInterval(() => {
                this.validateLoadedModules();
            }, 30000); // Check every 30 seconds
        }
    }

    /**
     * Check if current process is the allowed mock agent
     */
    isAllowedMockAgent() {
        const scriptName = path.basename(process.argv[1] || '');
        return scriptName === this.allowedMockAgent ||
               scriptName === `${this.allowedMockAgent}.js`;
    }

    /**
     * Quick check for CI/CD pipelines
     */
    static quickCheck() {
        const guard = new RuntimeMockGuard();

        if (!guard.isNoMocksEnabled()) {
            console.log('⚠️  Warning: NO_MOCKS is not set to 1');
            console.log('   Set NO_MOCKS=1 to enforce no-mock policy');
            return false;
        }

        return guard.validateLoadedModules();
    }
}

// Export for use in other modules
module.exports = RuntimeMockGuard;

// Auto-install if this is the main module
if (require.main === module) {
    const guard = new RuntimeMockGuard();
    guard.install();
}