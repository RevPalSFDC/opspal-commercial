const {
  createCheckpointPlan,
  isDestructiveAction,
  requiresManualIntervention,
  verifyIdentity
} = require('../playwright-checkpoint-helper');

describe('playwright-checkpoint-helper', () => {
  it('flags destructive actions for explicit confirmation', () => {
    expect(isDestructiveAction({ label: 'Delete campaign' })).toBe(true);
    expect(isDestructiveAction({ label: 'Open dashboard' })).toBe(false);
  });

  it('builds checkpoint plan with verification requirements', () => {
    const plan = createCheckpointPlan([
      { type: 'click', label: 'Delete rule' },
      { type: 'fill', label: 'Name' }
    ]);

    expect(plan).toHaveLength(2);
    expect(plan[0].requiresExplicitConfirmation).toBe(true);
    expect(plan[1].requiresVerificationAfter).toBe(true);
  });

  it('detects manual intervention markers in UI context', () => {
    expect(requiresManualIntervention({ snapshotText: 'Please complete CAPTCHA to continue' })).toBe(true);
    expect(requiresManualIntervention({ snapshotText: 'Dashboard Home' })).toBe(false);
  });

  it('verifies expected account identity', () => {
    const pass = verifyIdentity({ account: 'Acme Sandbox' }, { snapshotText: 'Welcome to Acme Sandbox' });
    const fail = verifyIdentity({ account: 'Acme Sandbox' }, { snapshotText: 'Welcome to Beta Production' });

    expect(pass.passed).toBe(true);
    expect(fail.passed).toBe(false);
  });
});
