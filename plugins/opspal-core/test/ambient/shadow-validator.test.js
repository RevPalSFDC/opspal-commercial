'use strict';

const { compareShadowToManual } = require('../../scripts/lib/ambient/shadow-validator');

describe('shadow validator', () => {
  test('computes overlap between shadow payloads and a manual reflection', () => {
    const result = compareShadowToManual({
      shadowEntries: [{
        payload: {
          issues_identified: [
            { taxonomy: 'workflow-gap', title: 'workflow gap: planner', description: 'Abnormally long task execution detected.' }
          ]
        }
      }],
      manualReflection: {
        issues_identified: [
          { taxonomy: 'workflow-gap', title: 'workflow gap: planner', description: 'Abnormally long task execution detected.' }
        ]
      }
    });

    expect(result.overlap_count).toBe(1);
    expect(result.overlap_rate_percent).toBe(100);
  });
});
