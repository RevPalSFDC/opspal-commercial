/**
 * Deployment State Tracker Tests
 */

const { DeploymentStateTracker } = require('../deployment-state-tracker.js');
const fs = require('fs');
const path = require('path');

describe('DeploymentStateTracker', () => {
    let tracker;
    const testStateDir = '.test-deployment-state';

    beforeEach(() => {
        tracker = new DeploymentStateTracker({
            verbose: false,
            stateDir: testStateDir
        });
    });

    afterEach(() => {
        // Clean up test state directory
        if (fs.existsSync(testStateDir)) {
            const files = fs.readdirSync(testStateDir);
            for (const file of files) {
                fs.unlinkSync(path.join(testStateDir, file));
            }
            fs.rmdirSync(testStateDir);
        }
    });

    describe('State Comparison', () => {
        test('should detect added components', () => {
            const before = {
                id: 'state-1',
                components: {
                    FlowDefinition: {
                        records: [
                            { DeveloperName: 'Flow_A', ActiveVersion: { VersionNumber: 1 } }
                        ]
                    }
                }
            };

            const after = {
                id: 'state-2',
                components: {
                    FlowDefinition: {
                        records: [
                            { DeveloperName: 'Flow_A', ActiveVersion: { VersionNumber: 1 } },
                            { DeveloperName: 'Flow_B', ActiveVersion: { VersionNumber: 1 } }
                        ]
                    }
                }
            };

            const diff = tracker.compareStates(before, after);

            expect(diff.summary.added).toBe(1);
            expect(diff.changes.FlowDefinition.added[0].key).toBe('Flow_B');
        });

        test('should detect removed components', () => {
            const before = {
                id: 'state-1',
                components: {
                    FlowDefinition: {
                        records: [
                            { DeveloperName: 'Flow_A' },
                            { DeveloperName: 'Flow_B' }
                        ]
                    }
                }
            };

            const after = {
                id: 'state-2',
                components: {
                    FlowDefinition: {
                        records: [
                            { DeveloperName: 'Flow_A' }
                        ]
                    }
                }
            };

            const diff = tracker.compareStates(before, after);

            expect(diff.summary.removed).toBe(1);
            expect(diff.changes.FlowDefinition.removed[0].key).toBe('Flow_B');
        });

        test('should detect modified components', () => {
            const before = {
                id: 'state-1',
                components: {
                    FlowDefinition: {
                        records: [
                            { DeveloperName: 'Flow_A', ActiveVersion: { VersionNumber: 1 } }
                        ]
                    }
                }
            };

            const after = {
                id: 'state-2',
                components: {
                    FlowDefinition: {
                        records: [
                            { DeveloperName: 'Flow_A', ActiveVersion: { VersionNumber: 2 } }
                        ]
                    }
                }
            };

            const diff = tracker.compareStates(before, after);

            expect(diff.summary.modified).toBe(1);
            expect(diff.changes.FlowDefinition.modified[0].key).toBe('Flow_A');
        });

        test('should detect unchanged components', () => {
            const before = {
                id: 'state-1',
                components: {
                    FlowDefinition: {
                        records: [
                            { DeveloperName: 'Flow_A', ActiveVersion: { VersionNumber: 1 } }
                        ]
                    }
                }
            };

            const after = {
                id: 'state-2',
                components: {
                    FlowDefinition: {
                        records: [
                            { DeveloperName: 'Flow_A', ActiveVersion: { VersionNumber: 1 } }
                        ]
                    }
                }
            };

            const diff = tracker.compareStates(before, after);

            expect(diff.summary.unchanged).toBe(1);
            expect(diff.changes.FlowDefinition.unchanged[0].key).toBe('Flow_A');
        });

        test('should handle multiple component types', () => {
            const before = {
                id: 'state-1',
                components: {
                    FlowDefinition: { records: [{ DeveloperName: 'Flow_A' }] },
                    ApexClass: { records: [{ Name: 'MyClass' }] }
                }
            };

            const after = {
                id: 'state-2',
                components: {
                    FlowDefinition: { records: [{ DeveloperName: 'Flow_A' }, { DeveloperName: 'Flow_B' }] },
                    ApexClass: { records: [] }
                }
            };

            const diff = tracker.compareStates(before, after);

            expect(diff.changes.FlowDefinition.added.length).toBe(1);
            expect(diff.changes.ApexClass.removed.length).toBe(1);
        });

        test('should handle missing component types', () => {
            const before = {
                id: 'state-1',
                components: {
                    FlowDefinition: { records: [{ DeveloperName: 'Flow_A' }] }
                }
            };

            const after = {
                id: 'state-2',
                components: {
                    ApexClass: { records: [{ Name: 'MyClass' }] }
                }
            };

            const diff = tracker.compareStates(before, after);

            expect(diff.changes.FlowDefinition.removed.length).toBe(1);
            expect(diff.changes.ApexClass.added.length).toBe(1);
        });

        test('should return error for missing states', () => {
            const diff = tracker.compareStates(null, null);

            expect(diff.error).toBeDefined();
        });
    });

    describe('Deployment Recording', () => {
        test('should record deployment', () => {
            const record = tracker.recordDeployment({
                source: './force-app',
                status: 'success',
                components: ['Flow_A', 'Flow_B']
            });

            expect(record.id).toBeDefined();
            expect(record.timestamp).toBeDefined();
            expect(record.status).toBe('success');
            expect(record.source).toBe('./force-app');
        });

        test('should track deployment history', () => {
            tracker.recordDeployment({ source: 'deploy-1', status: 'success' });
            tracker.recordDeployment({ source: 'deploy-2', status: 'failed' });
            tracker.recordDeployment({ source: 'deploy-3', status: 'success' });

            const history = tracker.getHistory();

            expect(history.length).toBe(3);
            expect(history[2].source).toBe('deploy-3');
        });

        test('should limit history results', () => {
            for (let i = 0; i < 20; i++) {
                tracker.recordDeployment({ source: `deploy-${i}`, status: 'success' });
            }

            const history = tracker.getHistory(5);

            expect(history.length).toBe(5);
        });

        test('should persist history', () => {
            tracker.recordDeployment({ source: 'deploy-1', status: 'success' });

            // Create new tracker instance
            const newTracker = new DeploymentStateTracker({
                stateDir: testStateDir
            });

            const history = newTracker.getHistory();

            expect(history.length).toBe(1);
        });
    });

    describe('Deployment Verification', () => {
        test('should verify expected additions', async () => {
            tracker.previousState = {
                id: 'state-1',
                components: {
                    FlowDefinition: { records: [] }
                }
            };

            tracker.currentState = {
                id: 'state-2',
                components: {
                    FlowDefinition: {
                        records: [{ DeveloperName: 'New_Flow' }]
                    }
                }
            };

            const result = await tracker.verifyDeployment({
                added: [{ type: 'FlowDefinition', name: 'New_Flow' }]
            });

            expect(result.verified).toBe(true);
            expect(result.checks[0].passed).toBe(true);
        });

        test('should fail verification for missing additions', async () => {
            tracker.previousState = {
                id: 'state-1',
                components: {
                    FlowDefinition: { records: [] }
                }
            };

            tracker.currentState = {
                id: 'state-2',
                components: {
                    FlowDefinition: { records: [] }
                }
            };

            const result = await tracker.verifyDeployment({
                added: [{ type: 'FlowDefinition', name: 'Expected_Flow' }]
            });

            expect(result.verified).toBe(false);
            expect(result.checks[0].passed).toBe(false);
        });

        test('should verify expected modifications', async () => {
            tracker.previousState = {
                id: 'state-1',
                components: {
                    FlowDefinition: {
                        records: [{ DeveloperName: 'My_Flow', ActiveVersion: { VersionNumber: 1 } }]
                    }
                }
            };

            tracker.currentState = {
                id: 'state-2',
                components: {
                    FlowDefinition: {
                        records: [{ DeveloperName: 'My_Flow', ActiveVersion: { VersionNumber: 2 } }]
                    }
                }
            };

            const result = await tracker.verifyDeployment({
                modified: [{ type: 'FlowDefinition', name: 'My_Flow' }]
            });

            expect(result.verified).toBe(true);
        });

        test('should detect unexpected removals', async () => {
            tracker.previousState = {
                id: 'state-1',
                components: {
                    ApexClass: {
                        records: [{ Name: 'ImportantClass' }]
                    }
                }
            };

            tracker.currentState = {
                id: 'state-2',
                components: {
                    ApexClass: { records: [] }
                }
            };

            const result = await tracker.verifyDeployment({});

            expect(result.verified).toBe(false);
            const removalCheck = result.checks.find(c => c.check === 'no_unexpected_removals');
            expect(removalCheck.passed).toBe(false);
        });

        test('should return error when missing states', async () => {
            tracker.previousState = null;
            tracker.currentState = null;

            const result = await tracker.verifyDeployment({});

            expect(result.verified).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('Flow Status', () => {
        test('should get flow status', async () => {
            tracker.currentState = {
                id: 'state-1',
                components: {
                    FlowDefinition: {
                        records: [
                            {
                                DeveloperName: 'Active_Flow',
                                ActiveVersion: { VersionNumber: 2 },
                                LatestVersion: { VersionNumber: 2 }
                            }
                        ]
                    }
                }
            };

            const status = await tracker.getFlowStatus('Active_Flow');

            expect(status.found).toBe(true);
            expect(status.isActivated).toBe(true);
            expect(status.activeVersion).toBe(2);
            expect(status.isDraft).toBe(false);
        });

        test('should detect draft flow', async () => {
            tracker.currentState = {
                id: 'state-1',
                components: {
                    FlowDefinition: {
                        records: [
                            {
                                DeveloperName: 'Draft_Flow',
                                ActiveVersion: { VersionNumber: 1 },
                                LatestVersion: { VersionNumber: 2 }
                            }
                        ]
                    }
                }
            };

            const status = await tracker.getFlowStatus('Draft_Flow');

            expect(status.isDraft).toBe(true);
        });

        test('should detect inactive flow', async () => {
            tracker.currentState = {
                id: 'state-1',
                components: {
                    FlowDefinition: {
                        records: [
                            {
                                DeveloperName: 'Inactive_Flow',
                                ActiveVersion: null,
                                LatestVersion: { VersionNumber: 1 }
                            }
                        ]
                    }
                }
            };

            const status = await tracker.getFlowStatus('Inactive_Flow');

            expect(status.isActivated).toBe(false);
        });

        test('should return not found for missing flow', async () => {
            tracker.currentState = {
                id: 'state-1',
                components: {
                    FlowDefinition: { records: [] }
                }
            };

            const status = await tracker.getFlowStatus('Missing_Flow');

            expect(status.found).toBe(false);
        });

        test('should throw error without captured state', async () => {
            tracker.currentState = null;

            await expect(tracker.getFlowStatus('Any_Flow')).rejects.toThrow('No state captured');
        });
    });

    describe('Report Generation', () => {
        test('should generate report for captured state', () => {
            tracker.currentState = {
                id: 'state-123',
                orgAlias: 'myorg',
                capturedAt: '2025-12-10T12:00:00Z',
                components: {
                    FlowDefinition: { records: [1, 2, 3], count: 3 },
                    ApexClass: { records: [1, 2], count: 2 }
                }
            };

            const report = tracker.generateReport();

            expect(report).toContain('Deployment State Report');
            expect(report).toContain('state-123');
            expect(report).toContain('myorg');
            expect(report).toContain('FlowDefinition');
            expect(report).toContain('3 records');
        });

        test('should include changes in report', () => {
            tracker.previousState = {
                id: 'state-1',
                components: {
                    FlowDefinition: { records: [] }
                }
            };

            tracker.currentState = {
                id: 'state-2',
                orgAlias: 'myorg',
                capturedAt: '2025-12-10T12:00:00Z',
                components: {
                    FlowDefinition: { records: [{ DeveloperName: 'New_Flow' }], count: 1 }
                }
            };

            const report = tracker.generateReport();

            expect(report).toContain('Changes Since Last Capture');
            expect(report).toContain('Added');
        });

        test('should handle no state captured', () => {
            tracker.currentState = null;

            const report = tracker.generateReport();

            expect(report).toContain('No state captured');
        });
    });

    describe('Statistics', () => {
        test('should return statistics', () => {
            tracker.currentState = { id: 'current-1' };
            tracker.previousState = { id: 'previous-1' };
            tracker.recordDeployment({ source: 'test', status: 'success' });

            const stats = tracker.getStatistics();

            expect(stats.currentStateId).toBe('current-1');
            expect(stats.previousStateId).toBe('previous-1');
            expect(stats.deploymentCount).toBe(1);
        });
    });

    describe('State Management', () => {
        test('should clear all state', () => {
            tracker.currentState = { id: 'state-1' };
            tracker.previousState = { id: 'state-0' };
            tracker.recordDeployment({ source: 'test', status: 'success' });

            tracker.clearState();

            expect(tracker.currentState).toBeNull();
            expect(tracker.previousState).toBeNull();
            expect(tracker.deploymentHistory.length).toBe(0);
        });

        test('should generate unique state IDs', () => {
            const id1 = tracker._generateStateId();
            const id2 = tracker._generateStateId();

            expect(id1).not.toBe(id2);
            expect(id1).toMatch(/^state-/);
        });
    });

    describe('Record Change Detection', () => {
        test('should detect validation rule activation changes', () => {
            const changed = tracker._recordChanged(
                { ValidationName: 'Rule1', Active: false },
                { ValidationName: 'Rule1', Active: true },
                'ValidationRule'
            );

            expect(changed).toBe(true);
        });

        test('should detect apex class status changes', () => {
            const changed = tracker._recordChanged(
                { Name: 'MyClass', Status: 'Active', ApiVersion: '60.0' },
                { Name: 'MyClass', Status: 'Deleted', ApiVersion: '60.0' },
                'ApexClass'
            );

            expect(changed).toBe(true);
        });

        test('should not detect unchanged records', () => {
            const changed = tracker._recordChanged(
                { Name: 'MyClass', Status: 'Active' },
                { Name: 'MyClass', Status: 'Active' },
                'ApexClass'
            );

            expect(changed).toBe(false);
        });
    });

    describe('Nested Value Access', () => {
        test('should get nested value', () => {
            const obj = {
                ActiveVersion: {
                    VersionNumber: 5
                }
            };

            const value = tracker._getNestedValue(obj, 'ActiveVersion.VersionNumber');

            expect(value).toBe(5);
        });

        test('should return undefined for missing path', () => {
            const obj = { field: 'value' };

            const value = tracker._getNestedValue(obj, 'missing.path');

            expect(value).toBeUndefined();
        });

        test('should handle null in path', () => {
            const obj = { field: null };

            const value = tracker._getNestedValue(obj, 'field.nested');

            expect(value).toBeUndefined();
        });
    });

    describe('Record Changes Detail', () => {
        test('should list specific field changes', () => {
            const before = { Name: 'Test', Status: 'Active', ApiVersion: '60.0' };
            const after = { Name: 'Test', Status: 'Inactive', ApiVersion: '62.0' };

            const changes = tracker._getRecordChanges(before, after);

            expect(changes.length).toBe(2);
            expect(changes.some(c => c.field === 'Status' && c.before === 'Active' && c.after === 'Inactive')).toBe(true);
            expect(changes.some(c => c.field === 'ApiVersion')).toBe(true);
        });

        test('should ignore attributes field', () => {
            const before = { Name: 'Test', attributes: { type: 'ApexClass' } };
            const after = { Name: 'Test', attributes: { type: 'ApexClass', url: '/new' } };

            const changes = tracker._getRecordChanges(before, after);

            expect(changes.length).toBe(0);
        });
    });
});
