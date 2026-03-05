const { buildPrompt, parseArgs } = require('../routing-routability-audit');

describe('routing-routability-audit', () => {
    it('parseArgs should use strict default thresholds', () => {
        const args = parseArgs([]);

        expect(args.maxNoMatch).toBe(0);
        expect(args.minTop3).toBe(100);
        expect(args.minTop1).toBe(95);
    });

    it('buildPrompt should include high-signal keywords and agent name phrase', () => {
        const prompt = buildPrompt('opspal-hubspot:hubspot-data', {
            triggerKeywords: ['data', 'hubspot', 'data operations', 'workflow'],
            description: 'Use PROACTIVELY for data operations. Handles contact/company property work.'
        });

        expect(prompt).toContain('data operations');
        expect(prompt).toContain('hubspot data');
        expect(prompt).toContain('Use PROACTIVELY for data operations');
    });

    it('parseArgs should parse numeric thresholds and json flag', () => {
        const args = parseArgs([
            '--json',
            '--max-no-match', '1',
            '--min-top3', '96.5',
            '--min-top1', '82',
            '--limit-failures', '12'
        ]);

        expect(args.json).toBe(true);
        expect(args.maxNoMatch).toBe(1);
        expect(args.minTop3).toBe(96.5);
        expect(args.minTop1).toBe(82);
        expect(args.limitFailures).toBe(12);
    });
});
