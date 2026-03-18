const { FuzzyAccountMatcher } = require('../fuzzy-account-matcher');
const { classifyEnrichmentName, VERDICTS } = require('../enrichment-name-guard');

class StubMatcher extends FuzzyAccountMatcher {
  async exactMatch(names) {
    return names
      .filter(name => name === 'Acme Corp')
      .map(name => ({
        inputName: name,
        salesforceName: name,
        recordId: '001000000000001',
        ownerId: '005000000000001',
        additionalFields: {}
      }));
  }

  async likeMatch() {
    return [];
  }

  async keywordMatch() {
    return [];
  }
}

describe('enrichment-name-guard', () => {
  it('classifies challenge page artifacts deterministically', () => {
    expect(classifyEnrichmentName('robot challenge screen')).toEqual(
      expect.objectContaining({
        verdict: VERDICTS.challengePage
      })
    );
  });

  it('classifies site builder placeholders deterministically', () => {
    expect(classifyEnrichmentName('Squarespace')).toEqual(
      expect.objectContaining({
        verdict: VERDICTS.placeholderSite
      })
    );
  });
});

describe('FuzzyAccountMatcher', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('quarantines blocked enrichment names before querying Salesforce', async () => {
    const matcher = new StubMatcher('test-org');

    const result = await matcher.match([
      'Acme Corp',
      'robot challenge screen',
      'Squarespace'
    ]);

    expect(result.matched['Acme Corp']).toBeDefined();
    expect(result.quarantined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ inputName: 'robot challenge screen', verdict: VERDICTS.challengePage }),
        expect.objectContaining({ inputName: 'Squarespace', verdict: VERDICTS.placeholderSite })
      ])
    );
    expect(result.stats.quarantined).toBe(2);
    expect(result.unmatched).not.toContain('robot challenge screen');
  });
});
