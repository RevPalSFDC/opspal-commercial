'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  computeChecksum,
  parseSections,
  mergeClaudeMd,
  detectLegacyFormat,
  generateManagedBlock,
  generateUserSectionBlock,
  formatDiffReport,
  createBackup,
  listBackups,
  restoreBackup,
  writePendingReview,
  readPendingReview,
  clearPendingReview,
  getBackupDir,
  getPendingDir
} = require('../scripts/lib/claudemd-section-parser');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir;
let originalHome;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudemd-test-'));
  originalHome = process.env.HOME;
  process.env.HOME = tmpDir;
});

afterEach(() => {
  process.env.HOME = originalHome;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function backupDir() {
  return getBackupDir();
}

function pendingDir() {
  return getPendingDir();
}

// ---------------------------------------------------------------------------
// computeChecksum
// ---------------------------------------------------------------------------

describe('computeChecksum', () => {
  test('returns a 12-char hex string', () => {
    const result = computeChecksum('hello world');
    expect(result).toMatch(/^[0-9a-f]{12}$/);
  });

  test('is deterministic', () => {
    expect(computeChecksum('test')).toBe(computeChecksum('test'));
  });

  test('is trim-invariant', () => {
    expect(computeChecksum('  hello  ')).toBe(computeChecksum('hello'));
    expect(computeChecksum('\nhello\n')).toBe(computeChecksum('hello'));
  });

  test('different content produces different checksums', () => {
    expect(computeChecksum('foo')).not.toBe(computeChecksum('bar'));
  });
});

// ---------------------------------------------------------------------------
// generateManagedBlock / generateUserSectionBlock
// ---------------------------------------------------------------------------

describe('generateManagedBlock', () => {
  test('wraps content with OPSPAL_MANAGED markers', () => {
    const result = generateManagedBlock('test-section', 'some content', '1.0.0');
    expect(result).toContain('<!-- OPSPAL_MANAGED section="test-section" version="1.0.0"');
    expect(result).toContain('some content');
    expect(result).toContain('<!-- OPSPAL_MANAGED_END section="test-section" -->');
  });

  test('includes computed checksum', () => {
    const checksum = computeChecksum('some content');
    const result = generateManagedBlock('test-section', 'some content', '1.0.0');
    expect(result).toContain(`checksum="${checksum}"`);
  });
});

describe('generateUserSectionBlock', () => {
  test('wraps content with USER_SECTION markers', () => {
    const result = generateUserSectionBlock('my-notes', 'my notes here');
    expect(result).toContain('<!-- USER_SECTION name="my-notes" -->');
    expect(result).toContain('my notes here');
    expect(result).toContain('<!-- USER_SECTION_END -->');
  });
});

// ---------------------------------------------------------------------------
// parseSections
// ---------------------------------------------------------------------------

describe('parseSections', () => {
  test('returns empty array for empty content', () => {
    expect(parseSections('')).toEqual([]);
    expect(parseSections(null)).toEqual([]);
    expect(parseSections('   ')).toEqual([]);
  });

  test('parses content with no markers as user-verbatim', () => {
    const content = '# My Project\n\nSome notes here.\n\n## Custom Section\nMore stuff.';
    const sections = parseSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe('user-verbatim');
    expect(sections[0].content).toBe(content);
  });

  test('parses OPSPAL_MANAGED markers', () => {
    const content = [
      '<!-- OPSPAL_MANAGED section="routing" version="3.0.0" checksum="abc123def456" -->',
      '## Routing Table',
      'Some routing content',
      '<!-- OPSPAL_MANAGED_END section="routing" -->'
    ].join('\n');

    const sections = parseSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toEqual({
      type: 'managed',
      name: 'routing',
      version: '3.0.0',
      checksum: 'abc123def456',
      content: '## Routing Table\nSome routing content'
    });
  });

  test('parses USER_SECTION markers', () => {
    const content = [
      '<!-- USER_SECTION name="my-conventions" -->',
      '## My Conventions',
      '- Use snake_case',
      '<!-- USER_SECTION_END -->'
    ].join('\n');

    const sections = parseSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toEqual({
      type: 'user-section',
      name: 'my-conventions',
      content: '## My Conventions\n- Use snake_case'
    });
  });

  test('parses legacy USER_EDITABLE_START markers as user-section', () => {
    const content = [
      '<!-- USER_EDITABLE_START name="project-overview" -->',
      'My project overview here',
      '<!-- USER_EDITABLE_END -->'
    ].join('\n');

    const sections = parseSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe('user-section');
    expect(sections[0].name).toBe('project-overview');
    expect(sections[0].content).toBe('My project overview here');
  });

  test('parses mixed content preserving order', () => {
    const content = [
      '# My Project',
      '',
      '<!-- OPSPAL_MANAGED section="plugins" version="1.0.0" checksum="aaa111bbb222" -->',
      '## Plugins',
      'Plugin list here',
      '<!-- OPSPAL_MANAGED_END section="plugins" -->',
      '',
      '<!-- USER_SECTION name="team-notes" -->',
      'Our team conventions',
      '<!-- USER_SECTION_END -->',
      '',
      'Some untagged content at the bottom'
    ].join('\n');

    const sections = parseSections(content);
    expect(sections).toHaveLength(4);
    expect(sections[0].type).toBe('user-verbatim');
    expect(sections[0].content).toBe('# My Project\n');
    expect(sections[1].type).toBe('managed');
    expect(sections[1].name).toBe('plugins');
    expect(sections[2].type).toBe('user-section');
    expect(sections[2].name).toBe('team-notes');
    expect(sections[3].type).toBe('user-verbatim');
    expect(sections[3].content).toContain('Some untagged content');
  });

  test('handles adjacent managed sections without verbatim between', () => {
    const content = [
      '<!-- OPSPAL_MANAGED section="a" version="1.0.0" checksum="aaa111bbb222" -->',
      'Section A',
      '<!-- OPSPAL_MANAGED_END section="a" -->',
      '<!-- OPSPAL_MANAGED section="b" version="1.0.0" checksum="ccc333ddd444" -->',
      'Section B',
      '<!-- OPSPAL_MANAGED_END section="b" -->'
    ].join('\n');

    const sections = parseSections(content);
    expect(sections).toHaveLength(2);
    expect(sections[0].name).toBe('a');
    expect(sections[1].name).toBe('b');
  });

  test('handles OPSPAL_MANAGED_END with section attribute', () => {
    const content = [
      '<!-- OPSPAL_MANAGED section="x" version="2.0.0" checksum="xxx111yyy222" -->',
      'content',
      '<!-- OPSPAL_MANAGED_END section="x" -->'
    ].join('\n');

    const sections = parseSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('x');
  });

  test('handles OPSPAL_MANAGED_END without section attribute', () => {
    const content = [
      '<!-- OPSPAL_MANAGED section="x" version="2.0.0" checksum="xxx111yyy222" -->',
      'content',
      '<!-- OPSPAL_MANAGED_END -->'
    ].join('\n');

    const sections = parseSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('x');
  });
});

// ---------------------------------------------------------------------------
// detectLegacyFormat
// ---------------------------------------------------------------------------

describe('detectLegacyFormat', () => {
  test('returns all false for null/empty content', () => {
    const result = detectLegacyFormat(null);
    expect(result.hasMarkers).toBe(false);
    expect(result.hasManagedMarkers).toBe(false);
    expect(result.hasUserMarkers).toBe(false);
    expect(result.hasLegacyMarkers).toBe(false);
    expect(result.userContentDetected).toBe(false);
  });

  test('detects managed markers', () => {
    const content = '<!-- OPSPAL_MANAGED section="x" version="1" checksum="a" -->\nfoo\n<!-- OPSPAL_MANAGED_END -->';
    const result = detectLegacyFormat(content);
    expect(result.hasManagedMarkers).toBe(true);
    expect(result.hasMarkers).toBe(true);
  });

  test('detects user section markers', () => {
    const content = '<!-- USER_SECTION name="x" -->\nfoo\n<!-- USER_SECTION_END -->';
    const result = detectLegacyFormat(content);
    expect(result.hasUserMarkers).toBe(true);
    expect(result.hasMarkers).toBe(true);
  });

  test('detects legacy markers', () => {
    const content = '<!-- USER_EDITABLE_START name="project-overview" -->\nfoo\n<!-- USER_EDITABLE_END -->';
    const result = detectLegacyFormat(content);
    expect(result.hasLegacyMarkers).toBe(true);
    expect(result.hasMarkers).toBe(true);
  });

  test('detects user content from unknown headings when no managed markers', () => {
    const content = '## My Custom Section\n\nSome user content';
    const result = detectLegacyFormat(content);
    expect(result.userContentDetected).toBe(true);
    expect(result.hasManagedMarkers).toBe(false);
  });

  test('does not flag known plugin headings as user content', () => {
    const content = '## 🚨 CRITICAL: Agent Routing Rules\n\n## 🔌 Installed Plugins\n\n## 🔒 Security';
    const result = detectLegacyFormat(content);
    expect(result.userContentDetected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mergeClaudeMd
// ---------------------------------------------------------------------------

describe('mergeClaudeMd', () => {
  function makeGenerated(entries) {
    const map = new Map();
    for (const [name, content, version] of entries) {
      map.set(name, { content, version: version || '1.0.0' });
    }
    return map;
  }

  test('first-time generation: no existing sections', () => {
    const generated = makeGenerated([
      ['routing', '## Routing\nContent', '3.0.0'],
      ['plugins', '## Plugins\nList', '3.0.0']
    ]);

    const result = mergeClaudeMd([], generated);
    expect(result.merged).toContain('## Routing');
    expect(result.merged).toContain('## Plugins');
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0].action).toBe('added');
    expect(result.changes[1].action).toBe('added');
    expect(result.isClean).toBe(true);
  });

  test('updates managed section when checksum differs', () => {
    const oldContent = 'Old routing content';
    const newContent = 'New routing content';
    const checksum = computeChecksum(oldContent);

    const existing = [{
      type: 'managed',
      name: 'routing',
      version: '2.0.0',
      checksum,
      content: oldContent
    }];

    const generated = makeGenerated([['routing', newContent, '3.0.0']]);
    const result = mergeClaudeMd(existing, generated);

    expect(result.merged).toContain(newContent);
    expect(result.merged).not.toContain(oldContent);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toEqual({
      action: 'updated',
      name: 'routing',
      oldVersion: '2.0.0',
      newVersion: '3.0.0'
    });
  });

  test('skips managed section when checksum matches (no change)', () => {
    const content = 'Same content';
    const checksum = computeChecksum(content);

    const existing = [{
      type: 'managed',
      name: 'routing',
      version: '3.0.0',
      checksum,
      content
    }];

    const generated = makeGenerated([['routing', content, '3.0.0']]);
    const result = mergeClaudeMd(existing, generated);

    expect(result.merged).toContain(content);
    expect(result.changes).toHaveLength(0);
  });

  test('preserves user-section in place', () => {
    const existing = [
      { type: 'managed', name: 'a', version: '1.0.0', checksum: computeChecksum('A'), content: 'A' },
      { type: 'user-section', name: 'my-notes', content: 'My custom notes' },
      { type: 'managed', name: 'b', version: '1.0.0', checksum: computeChecksum('B'), content: 'B' }
    ];

    const generated = makeGenerated([
      ['a', 'A-new', '2.0.0'],
      ['b', 'B-new', '2.0.0']
    ]);

    const result = mergeClaudeMd(existing, generated);
    expect(result.merged).toContain('A-new');
    expect(result.merged).toContain('My custom notes');
    expect(result.merged).toContain('B-new');
    expect(result.merged).toContain('<!-- USER_SECTION name="my-notes" -->');

    // Verify ordering: a, user-notes, b
    const aIdx = result.merged.indexOf('A-new');
    const notesIdx = result.merged.indexOf('My custom notes');
    const bIdx = result.merged.indexOf('B-new');
    expect(aIdx).toBeLessThan(notesIdx);
    expect(notesIdx).toBeLessThan(bIdx);
  });

  test('preserves user-verbatim in place', () => {
    const existing = [
      { type: 'user-verbatim', content: '# My Project Header' },
      { type: 'managed', name: 'plugins', version: '1.0.0', checksum: computeChecksum('old'), content: 'old' }
    ];

    const generated = makeGenerated([['plugins', 'new', '2.0.0']]);
    const result = mergeClaudeMd(existing, generated);

    expect(result.merged).toContain('# My Project Header');
    expect(result.merged).toContain('new');
    expect(result.hasUserVerbatim).toBe(true);
    expect(result.isClean).toBe(false);
  });

  test('removes managed section when plugin drops it', () => {
    const existing = [
      { type: 'managed', name: 'a', version: '1.0.0', checksum: computeChecksum('A'), content: 'A' },
      { type: 'managed', name: 'dropped', version: '1.0.0', checksum: computeChecksum('gone'), content: 'gone' }
    ];

    const generated = makeGenerated([['a', 'A-new', '2.0.0']]);
    const result = mergeClaudeMd(existing, generated);

    expect(result.merged).toContain('A-new');
    expect(result.merged).not.toContain('gone');
    expect(result.changes.find(c => c.name === 'dropped').action).toBe('removed');
  });

  test('appends new managed sections not in existing', () => {
    const existing = [
      { type: 'managed', name: 'a', version: '1.0.0', checksum: computeChecksum('A'), content: 'A' }
    ];

    const generated = makeGenerated([
      ['a', 'A', '1.0.0'],
      ['new-section', 'Brand new!', '1.0.0']
    ]);

    const result = mergeClaudeMd(existing, generated);
    expect(result.merged).toContain('Brand new!');
    expect(result.changes.find(c => c.name === 'new-section').action).toBe('added');
  });

  test('detects conflict: user edited inside managed block', () => {
    const originalContent = 'Original plugin content';
    const checksum = computeChecksum(originalContent);

    const existing = [{
      type: 'managed',
      name: 'routing',
      version: '2.0.0',
      checksum,
      content: 'User modified this content'  // different from checksum
    }];

    const generated = makeGenerated([['routing', 'New plugin content', '3.0.0']]);

    // Non-interactive mode: keeps user version
    const resultNonInteractive = mergeClaudeMd(existing, generated, { mode: 'non-interactive' });
    expect(resultNonInteractive.conflicts).toHaveLength(1);
    expect(resultNonInteractive.merged).toContain('User modified this content');
    expect(resultNonInteractive.merged).not.toContain('New plugin content');

    // Interactive mode: applies plugin content
    const resultInteractive = mergeClaudeMd(existing, generated, { mode: 'interactive' });
    expect(resultInteractive.conflicts).toHaveLength(1);
    expect(resultInteractive.merged).toContain('New plugin content');
  });

  test('force mode overrides conflicts', () => {
    const originalContent = 'Original';
    const checksum = computeChecksum(originalContent);

    const existing = [{
      type: 'managed',
      name: 'routing',
      version: '2.0.0',
      checksum,
      content: 'User-modified'
    }];

    const generated = makeGenerated([['routing', 'Plugin update', '3.0.0']]);
    const result = mergeClaudeMd(existing, generated, { mode: 'non-interactive', force: true });

    // Force mode: no conflict reported, plugin content applied
    expect(result.conflicts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// formatDiffReport
// ---------------------------------------------------------------------------

describe('formatDiffReport', () => {
  test('formats a clean merge report', () => {
    const report = formatDiffReport({
      changes: [
        { action: 'updated', name: 'routing', oldVersion: '2.0.0', newVersion: '3.0.0' },
        { action: 'added', name: 'new-section' }
      ],
      conflicts: [],
      skipped: [{ type: 'user-section', name: 'my-notes' }],
      isClean: true,
      hasUserVerbatim: false
    });

    expect(report).toContain('[WILL UPDATE]');
    expect(report).toContain('routing');
    expect(report).toContain('2.0.0 -> 3.0.0');
    expect(report).toContain('[NEW]');
    expect(report).toContain('[PRESERVED]');
    expect(report).toContain('Clean merge');
  });

  test('formats unprotected content warning', () => {
    const report = formatDiffReport({
      changes: [],
      conflicts: [],
      skipped: [{ type: 'user-verbatim', preview: 'Some custom content here' }],
      isClean: false,
      hasUserVerbatim: true
    });

    expect(report).toContain('[UNPROTECTED]');
    expect(report).toContain('review recommended');
  });

  test('formats conflict warnings', () => {
    const report = formatDiffReport({
      changes: [{ action: 'updated-conflict', name: 'routing' }],
      conflicts: [{ name: 'routing', userContent: 'x', pluginContent: 'y' }],
      skipped: [],
      isClean: false,
      hasUserVerbatim: false
    });

    expect(report).toContain('[CONFLICT]');
    expect(report).toContain('1 conflict(s)');
  });
});

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

describe('backup and restore', () => {
  test('createBackup copies file and writes manifest', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, '# Test content');

    // Override module's BACKUP_DIR by calling directly with the right HOME
    const backupPath = createBackup(claudeMdPath, { label: 'test', trigger: 'manual' });

    expect(backupPath).toBeTruthy();
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.readFileSync(backupPath, 'utf8')).toBe('# Test content');

    const manifestPath = path.join(backupDir(), 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest).toHaveLength(1);
    expect(manifest[0].label).toBe('test');
    expect(manifest[0].trigger).toBe('manual');
  });

  test('createBackup returns null for non-existent file', () => {
    const result = createBackup(path.join(tmpDir, 'nonexistent.md'));
    expect(result).toBeNull();
  });

  test('listBackups returns entries from manifest', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, '# v1');
    createBackup(claudeMdPath, { label: 'first' });

    fs.writeFileSync(claudeMdPath, '# v2');
    createBackup(claudeMdPath, { label: 'second' });

    const backups = listBackups();
    expect(backups).toHaveLength(2);
    expect(backups[0].label).toBe('first');
    expect(backups[1].label).toBe('second');
    expect(backups[0].exists).toBe(true);
  });

  test('listBackups returns empty when no manifest', () => {
    expect(listBackups()).toEqual([]);
  });

  test('restoreBackup restores and creates before-rollback backup', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, '# Original');
    const backupPath = createBackup(claudeMdPath, { label: 'original' });

    // Modify the file
    fs.writeFileSync(claudeMdPath, '# Modified');

    // Restore
    restoreBackup(backupPath, claudeMdPath);

    expect(fs.readFileSync(claudeMdPath, 'utf8')).toBe('# Original');

    // Should have created a before-rollback backup
    const backups = listBackups();
    const rollbackBackup = backups.find(b => b.label === 'before-rollback');
    expect(rollbackBackup).toBeTruthy();
  });

  test('restoreBackup throws for missing backup', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    expect(() => {
      restoreBackup('/nonexistent/backup.md', claudeMdPath);
    }).toThrow('Backup not found');
  });

  test('backup pruning keeps only MAX_BACKUPS entries', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');

    for (let i = 0; i < 15; i++) {
      fs.writeFileSync(claudeMdPath, `# Version ${i}`);
      createBackup(claudeMdPath, { label: `v${i}` });
    }

    const backups = listBackups();
    expect(backups.length).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// Pending review
// ---------------------------------------------------------------------------

describe('pending review', () => {
  test('writePendingReview creates a JSON file', () => {
    const pendingPath = writePendingReview({
      reason: 'untagged-content',
      sections: [{ name: 'test', preview: 'some content' }]
    });

    expect(fs.existsSync(pendingPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    expect(data.reason).toBe('untagged-content');
  });

  test('readPendingReview returns most recent', () => {
    writePendingReview({ reason: 'first' });
    // Small delay to ensure different timestamp
    writePendingReview({ reason: 'second' });

    const pending = readPendingReview();
    expect(pending).toBeTruthy();
    expect(pending.reason).toBe('second');
  });

  test('readPendingReview returns null when empty', () => {
    expect(readPendingReview()).toBeNull();
  });

  test('clearPendingReview removes all pending files', () => {
    writePendingReview({ reason: 'test1' });
    writePendingReview({ reason: 'test2' });
    clearPendingReview();
    expect(readPendingReview()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Round-trip integration test
// ---------------------------------------------------------------------------

describe('round-trip: generate -> parse -> merge -> parse', () => {
  test('managed block survives round-trip with identical checksum', () => {
    const original = generateManagedBlock('routing', '## Routing\nSome content', '3.0.0');
    const sections = parseSections(original);

    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe('managed');
    expect(sections[0].name).toBe('routing');
    expect(sections[0].checksum).toBe(computeChecksum('## Routing\nSome content'));

    // Merge with same content should produce no changes
    const generated = new Map([['routing', { content: '## Routing\nSome content', version: '3.0.0' }]]);
    const result = mergeClaudeMd(sections, generated);
    expect(result.changes).toHaveLength(0);
    expect(result.isClean).toBe(true);
  });

  test('full CLAUDE.md with mixed markers round-trips correctly', () => {
    const original = [
      generateManagedBlock('header', '# CLAUDE.md', '4.0.0'),
      '',
      generateUserSectionBlock('project-overview', 'My project is about X'),
      '',
      generateManagedBlock('plugins', '## Plugins\n- core v2.0', '4.0.0'),
      '',
      generateUserSectionBlock('team-rules', '## Team Rules\n- Always test first'),
      '',
      generateManagedBlock('footer', '**Generated** | 2026-04-09', '4.0.0')
    ].join('\n');

    const sections = parseSections(original);
    expect(sections).toHaveLength(5);

    // Types in order
    expect(sections.map(s => s.type)).toEqual([
      'managed', 'user-section', 'managed', 'user-section', 'managed'
    ]);

    // Merge with updated plugins
    const generated = new Map([
      ['header', { content: '# CLAUDE.md', version: '4.0.0' }],
      ['plugins', { content: '## Plugins\n- core v3.0\n- sf v2.0', version: '4.1.0' }],
      ['footer', { content: '**Generated** | 2026-04-10', version: '4.1.0' }]
    ]);

    const result = mergeClaudeMd(sections, generated);

    // User sections preserved
    expect(result.merged).toContain('My project is about X');
    expect(result.merged).toContain('Always test first');

    // Plugin sections updated
    expect(result.merged).toContain('core v3.0');
    expect(result.merged).toContain('sf v2.0');

    // Header unchanged
    expect(result.changes.find(c => c.name === 'header')).toBeUndefined();

    // Plugins and footer updated
    expect(result.changes.find(c => c.name === 'plugins').action).toBe('updated');
    expect(result.changes.find(c => c.name === 'footer').action).toBe('updated');

    // Clean merge (no verbatim, no conflicts)
    expect(result.isClean).toBe(true);
  });
});
