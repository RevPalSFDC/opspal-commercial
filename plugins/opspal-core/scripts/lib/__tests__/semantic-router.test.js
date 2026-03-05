const { SemanticRouter } = require('../semantic-router');

describe('SemanticRouter platform intent tuning', () => {
    let router;

    beforeEach(() => {
        router = Object.create(SemanticRouter.prototype);
    });

    test('detectPlatformIntent detects explicit single platform', () => {
        expect(router.detectPlatformIntent('build a lead scoring model in marketo')).toEqual(['marketo']);
        expect(router.detectPlatformIntent('audit workflows in hubspot')).toEqual(['hubspot']);
        expect(router.detectPlatformIntent('run revops assessment in salesforce')).toEqual(['salesforce']);
    });

    test('detectPlatformIntent detects multi-platform requests', () => {
        const platforms = router.detectPlatformIntent('sync salesforce and hubspot records');
        expect(platforms).toContain('salesforce');
        expect(platforms).toContain('hubspot');
    });

    test('applyPlatformIntent boosts explicit platform match', () => {
        const intent = router.detectPlatformIntent('build a lead scoring model in marketo');
        const base = 0.35;
        const boosted = router.applyPlatformIntent(base, 'opspal-marketo:marketo-lead-scoring-architect', intent);
        expect(boosted).toBeGreaterThan(base);
    });

    test('applyPlatformIntent penalizes conflicting explicit platform', () => {
        const intent = router.detectPlatformIntent('build a lead scoring model in marketo');
        const base = 0.35;
        const penalized = router.applyPlatformIntent(base, 'opspal-hubspot:hubspot-lead-scoring-specialist', intent);
        expect(penalized).toBeLessThan(base);
    });

    test('applyPlatformIntent keeps neutral plugins unchanged', () => {
        const intent = router.detectPlatformIntent('build a lead scoring model in marketo');
        const base = 0.35;
        const unchanged = router.applyPlatformIntent(base, 'opspal-core:revops-reporting-assistant', intent);
        expect(unchanged).toBe(base);
    });
});
