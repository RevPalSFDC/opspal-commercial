/**
 * Skill Tracker Tests
 *
 * Tests for ACE Framework skill tracking functionality
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Use require for the module
const { SkillTracker } = require('../skill-tracker.js');

describe('SkillTracker', () => {
    let tracker;
    let tempHistoryFile;

    beforeEach(() => {
        // Create temp file for history
        tempHistoryFile = path.join(os.tmpdir(), `skill-test-${Date.now()}.jsonl`);

        tracker = new SkillTracker({
            historyFile: tempHistoryFile,
            verbose: false
        });
    });

    afterEach(() => {
        // Cleanup temp file
        if (fs.existsSync(tempHistoryFile)) {
            fs.unlinkSync(tempHistoryFile);
        }
    });

    describe('Skill Registry Operations', () => {
        test('should load skill registry', () => {
            expect(tracker.skillRegistry).toBeDefined();
            expect(tracker.skillRegistry.skillCategories).toBeDefined();
        });

        test('should get skill by ID', () => {
            const skill = tracker.getSkillById('cpq-assessment');

            if (skill) {
                expect(skill.id).toBe('cpq-assessment');
                expect(skill.category).toBe('assessment');
                expect(skill.displayName).toBeDefined();
            }
        });

        test('should return null for unknown skill ID', () => {
            const skill = tracker.getSkillById('non-existent-skill');
            expect(skill).toBeNull();
        });

        test('should get skills by category', () => {
            const skills = tracker.getSkillsByCategory('assessment');
            expect(skills).toBeDefined();
            expect(typeof skills).toBe('object');
        });

        test('should get skills by agent', () => {
            const skills = tracker.getSkillsByAgent('sfdc-revops-auditor');
            expect(Array.isArray(skills)).toBe(true);
        });

        test('should get skills by keyword', () => {
            const skills = tracker.getSkillsByKeyword('deploy');
            expect(Array.isArray(skills)).toBe(true);
        });
    });

    describe('Skill Usage Tracking', () => {
        test('should track skill usage', () => {
            tracker.trackSkillUsage('cpq-assessment', { taskId: 'test-1' });

            expect(tracker.sessionSkills).toContain('cpq-assessment');
            expect(tracker.sessionFeedback['cpq-assessment']).toBeDefined();
            expect(tracker.sessionFeedback['cpq-assessment'].usageCount).toBe(1);
        });

        test('should increment usage count on multiple calls', () => {
            tracker.trackSkillUsage('cpq-assessment');
            tracker.trackSkillUsage('cpq-assessment');
            tracker.trackSkillUsage('cpq-assessment');

            expect(tracker.sessionFeedback['cpq-assessment'].usageCount).toBe(3);
        });

        test('should not duplicate skill in session array', () => {
            tracker.trackSkillUsage('cpq-assessment');
            tracker.trackSkillUsage('cpq-assessment');

            expect(tracker.sessionSkills.filter(s => s === 'cpq-assessment').length).toBe(1);
        });

        test('should track unknown skills with warning', () => {
            tracker.trackSkillUsage('unknown-skill');

            expect(tracker.sessionSkills).toContain('unknown-skill');
        });

        test('should support method chaining', () => {
            const result = tracker
                .trackSkillUsage('cpq-assessment')
                .trackSkillUsage('revops-audit');

            expect(result).toBe(tracker);
            expect(tracker.sessionSkills.length).toBe(2);
        });
    });

    describe('Outcome Recording', () => {
        test('should record successful outcome', () => {
            tracker.trackSkillUsage('cpq-assessment');
            tracker.recordSkillOutcome('cpq-assessment', true);

            expect(tracker.sessionFeedback['cpq-assessment'].success).toBe(true);
            expect(tracker.sessionFeedback['cpq-assessment'].error_type).toBeNull();
            expect(tracker.sessionFeedback['cpq-assessment'].inferred).toBe(false);
        });

        test('should record failed outcome with error type', () => {
            tracker.trackSkillUsage('cpq-assessment');
            tracker.recordSkillOutcome('cpq-assessment', false, 'api-failure', 'API timeout');

            expect(tracker.sessionFeedback['cpq-assessment'].success).toBe(false);
            expect(tracker.sessionFeedback['cpq-assessment'].error_type).toBe('api-failure');
            expect(tracker.sessionFeedback['cpq-assessment'].notes).toBe('API timeout');
        });

        test('should auto-track skill if outcome recorded before tracking', () => {
            tracker.recordSkillOutcome('cpq-assessment', true);

            expect(tracker.sessionSkills).toContain('cpq-assessment');
        });

        test('should write to history file on outcome', () => {
            tracker.recordSkillOutcome('cpq-assessment', true);

            expect(fs.existsSync(tempHistoryFile)).toBe(true);
            const content = fs.readFileSync(tempHistoryFile, 'utf8');
            expect(content).toContain('cpq-assessment');
        });
    });

    describe('Outcome Inference', () => {
        test('should infer outcomes from successful session', () => {
            tracker.trackSkillUsage('cpq-assessment');
            tracker.trackSkillUsage('revops-audit');
            tracker.inferOutcomesFromSession(true);

            expect(tracker.sessionFeedback['cpq-assessment'].success).toBe(true);
            expect(tracker.sessionFeedback['cpq-assessment'].inferred).toBe(true);
            expect(tracker.sessionFeedback['revops-audit'].success).toBe(true);
            expect(tracker.sessionFeedback['revops-audit'].inferred).toBe(true);
        });

        test('should infer outcomes from failed session', () => {
            tracker.trackSkillUsage('cpq-assessment');
            tracker.inferOutcomesFromSession(false);

            expect(tracker.sessionFeedback['cpq-assessment'].success).toBe(false);
            expect(tracker.sessionFeedback['cpq-assessment'].inferred).toBe(true);
        });

        test('should not override explicitly recorded outcomes', () => {
            tracker.trackSkillUsage('cpq-assessment');
            tracker.recordSkillOutcome('cpq-assessment', true);
            tracker.inferOutcomesFromSession(false);

            // Explicit outcome should remain
            expect(tracker.sessionFeedback['cpq-assessment'].success).toBe(true);
            expect(tracker.sessionFeedback['cpq-assessment'].inferred).toBe(false);
        });
    });

    describe('Confidence Calculation', () => {
        test('should return default confidence for unknown skill', () => {
            const confidence = tracker.getSkillConfidence('unknown-skill');

            expect(confidence.confidence).toBe(0.5);
            expect(confidence.level).toBe('medium');
            expect(confidence.totalExecutions).toBe(0);
        });

        test('should calculate confidence from history', () => {
            // Record some outcomes
            tracker.recordSkillOutcome('cpq-assessment', true);
            tracker.recordSkillOutcome('cpq-assessment', true);
            tracker.recordSkillOutcome('cpq-assessment', false);
            tracker.recordSkillOutcome('cpq-assessment', true);

            const confidence = tracker.getSkillConfidence('cpq-assessment');

            expect(confidence.totalExecutions).toBe(4);
            expect(confidence.successes).toBe(3);
            expect(confidence.failures).toBe(1);
            expect(confidence.successRate).toBeCloseTo(0.75, 2);
        });

        test('should determine confidence level correctly', () => {
            // Record many successes for high confidence
            for (let i = 0; i < 10; i++) {
                tracker.recordSkillOutcome('test-skill', true);
            }

            const confidence = tracker.getSkillConfidence('test-skill');
            expect(confidence.level).toBe('high');
        });

        test('should get all skill confidences', () => {
            tracker.recordSkillOutcome('skill-1', true);
            tracker.recordSkillOutcome('skill-2', false);

            const all = tracker.getAllSkillConfidences();

            expect(all['skill-1']).toBeDefined();
            expect(all['skill-2']).toBeDefined();
        });
    });

    describe('Reflection Export', () => {
        test('should export data for reflection', () => {
            tracker.trackSkillUsage('cpq-assessment');
            tracker.recordSkillOutcome('cpq-assessment', true);
            tracker.trackSkillUsage('revops-audit');
            tracker.recordSkillOutcome('revops-audit', false, 'api-failure');

            const exported = tracker.exportForReflection();

            expect(exported.skills_used).toEqual(['cpq-assessment', 'revops-audit']);
            expect(exported.skill_feedback['cpq-assessment'].success).toBe(true);
            expect(exported.skill_feedback['revops-audit'].success).toBe(false);
            expect(exported.skill_feedback['revops-audit'].error_type).toBe('api-failure');
            expect(exported.session_metadata).toBeDefined();
            expect(exported.session_metadata.totalSkillsUsed).toBe(2);
            expect(exported.session_metadata.successfulSkills).toBe(1);
            expect(exported.session_metadata.failedSkills).toBe(1);
        });

        test('should match reflection schema format', () => {
            tracker.trackSkillUsage('test-skill');
            tracker.recordSkillOutcome('test-skill', true, null, 'Test notes');

            const exported = tracker.exportForReflection();

            // Verify structure matches schema
            expect(Array.isArray(exported.skills_used)).toBe(true);
            expect(typeof exported.skill_feedback).toBe('object');

            const feedback = exported.skill_feedback['test-skill'];
            expect(typeof feedback.success).toBe('boolean');
            expect(feedback.inferred).toBe(false);
        });
    });

    describe('Session Management', () => {
        test('should reset session state', () => {
            tracker.trackSkillUsage('cpq-assessment');
            tracker.recordSkillOutcome('cpq-assessment', true);

            tracker.resetSession();

            expect(tracker.sessionSkills.length).toBe(0);
            expect(Object.keys(tracker.sessionFeedback).length).toBe(0);
        });

        test('should preserve history after reset', () => {
            tracker.recordSkillOutcome('cpq-assessment', true);
            tracker.resetSession();

            // New session, but history should still be there
            const confidence = tracker.getSkillConfidence('cpq-assessment');
            expect(confidence.totalExecutions).toBe(1);
        });
    });

    describe('Statistics', () => {
        test('should provide statistics summary', () => {
            tracker.recordSkillOutcome('skill-1', true);
            tracker.recordSkillOutcome('skill-2', true);
            tracker.recordSkillOutcome('skill-3', false);

            const stats = tracker.getStatistics();

            expect(stats.totalHistoryRecords).toBe(3);
            expect(stats.uniqueSkillsTracked).toBe(3);
            expect(stats.currentSession).toBeDefined();
        });

        test('should track current session in stats', () => {
            tracker.trackSkillUsage('test-skill');

            const stats = tracker.getStatistics();

            expect(stats.currentSession.skillsUsed).toBe(1);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty history file', () => {
            const confidence = tracker.getSkillConfidence('any-skill');
            expect(confidence.confidence).toBe(0.5);
        });

        test('should handle malformed history lines', () => {
            fs.writeFileSync(tempHistoryFile, 'invalid json\n{"skillId":"test","success":true}\n');

            const confidence = tracker.getSkillConfidence('test');
            expect(confidence.totalExecutions).toBe(1);
        });

        test('should handle concurrent tracking', () => {
            // Simulate rapid tracking
            for (let i = 0; i < 100; i++) {
                tracker.trackSkillUsage(`skill-${i % 10}`);
            }

            expect(tracker.sessionSkills.length).toBe(10);
        });
    });
});
