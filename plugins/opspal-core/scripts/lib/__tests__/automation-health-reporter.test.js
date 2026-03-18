const {
  parseWindowMs,
  summarize,
  toMarkdown
} = require('../automation-health-reporter');

describe('automation-health-reporter', () => {
  it('parses supported window labels', () => {
    expect(parseWindowMs('15m')).toBe(15 * 60 * 1000);
    expect(parseWindowMs('2h')).toBe(2 * 60 * 60 * 1000);
    expect(parseWindowMs('1d')).toBe(24 * 60 * 60 * 1000);
  });

  it('summarizes platform events with health status', () => {
    const summary = summarize([
      { platform: 'marketo', status: 'success', severity: 'info', category: 'policy' },
      { platform: 'marketo', status: 'failure', severity: 'error', category: 'incident' },
      { platform: 'hubspot', status: 'success', severity: 'info', category: 'auth' }
    ]);

    const marketo = summary.find(row => row.platform === 'marketo');
    const hubspot = summary.find(row => row.platform === 'hubspot');

    expect(marketo.health).toBe('degraded');
    expect(marketo.total).toBe(2);
    expect(hubspot.health).toBe('healthy');
    expect(hubspot.successRate).toBe(100);
  });

  it('renders markdown output', () => {
    const markdown = toMarkdown([
      {
        platform: 'marketo',
        health: 'warning',
        successRate: 97.5,
        total: 10,
        failure: 0,
        blocked: 0,
        retrying: 1,
        manualRequired: 1
      }
    ], '1h');

    expect(markdown).toContain('# Automation Health (1h)');
    expect(markdown).toContain('| marketo | warning | 97.5% | 10 |');
  });
});
