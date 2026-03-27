'use strict';

const fs = require('fs');
const path = require('path');

describe('activate-license command instructions', () => {
  test('document automatic unlock and block rogue post-activation commands', () => {
    const commandPath = path.join(__dirname, '..', 'commands', 'activate-license.md');
    const markdown = fs.readFileSync(commandPath, 'utf8');

    expect(markdown).toContain('Encrypted plugin assets are decrypted **automatically** at the start of every new Claude Code session. No manual decryption command exists or is needed.');
    expect(markdown).toContain('## After Activation');
    expect(markdown).toContain('Display the Tier and Allowed domains from the script output in a summary table.');
    expect(markdown).toContain('Do NOT suggest `/encrypt-assets`');
    expect(markdown).toContain('Do NOT suggest `/encrypt-assets --decrypt`');
    expect(markdown).toContain('Do NOT suggest `/finishopspalupdate`');
    expect(markdown).toContain('Do NOT suggest `/license-canary` unless the user asks to verify');
    expect(markdown).not.toContain('Stores scoped decryption keys in `~/.claude/opspal-enc/`.');
  });
});
