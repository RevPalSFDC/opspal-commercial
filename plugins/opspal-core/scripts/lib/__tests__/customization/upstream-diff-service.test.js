/**
 * Tests for UpstreamDiffService
 */

'use strict';

const { UpstreamDiffService } = require('../../customization/upstream-diff-service');

describe('UpstreamDiffService', () => {
  let service;

  beforeEach(() => {
    service = new UpstreamDiffService({ registry: null });
  });

  describe('diffCSS', () => {
    test('detects added properties', () => {
      const custom = 'color: red; font-size: 14px; border: 1px solid;';
      const upstream = 'color: red; font-size: 14px;';

      const result = service.diffCSS(custom, upstream);
      expect(result.hasChanges).toBe(true);
      expect(result.additions.length).toBe(1);
      expect(result.additions[0].property).toBe('border');
    });

    test('detects modified properties', () => {
      const custom = 'color: blue;';
      const upstream = 'color: red;';

      const result = service.diffCSS(custom, upstream);
      expect(result.hasChanges).toBe(true);
      expect(result.modifications.length).toBe(1);
      expect(result.modifications[0].custom).toBe('blue');
      expect(result.modifications[0].upstream).toBe('red');
    });

    test('detects removed properties', () => {
      const custom = 'color: red;';
      const upstream = 'color: red; font-size: 14px;';

      const result = service.diffCSS(custom, upstream);
      expect(result.hasChanges).toBe(true);
      expect(result.deletions.length).toBe(1);
    });

    test('reports no changes for identical CSS', () => {
      const css = 'color: red; font-size: 14px;';
      const result = service.diffCSS(css, css);
      expect(result.hasChanges).toBe(false);
    });
  });

  describe('diffJSON', () => {
    test('detects added fields', () => {
      const result = service.diffJSON({ a: 1, b: 2 }, { a: 1 });
      expect(result.hasChanges).toBe(true);
      expect(result.changes.find(c => c.path === 'b' && c.type === 'added')).toBeDefined();
    });

    test('detects removed fields', () => {
      const result = service.diffJSON({ a: 1 }, { a: 1, b: 2 });
      expect(result.hasChanges).toBe(true);
      expect(result.changes.find(c => c.path === 'b' && c.type === 'removed')).toBeDefined();
    });

    test('detects modified values', () => {
      const result = service.diffJSON({ a: 'new' }, { a: 'old' });
      expect(result.hasChanges).toBe(true);
      expect(result.changes[0].type).toBe('value_changed');
    });

    test('detects nested changes', () => {
      const result = service.diffJSON(
        { a: { b: { c: 'new' } } },
        { a: { b: { c: 'old' } } }
      );
      expect(result.hasChanges).toBe(true);
      expect(result.changes[0].path).toBe('a.b.c');
    });

    test('reports no changes for identical objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const result = service.diffJSON(obj, obj);
      expect(result.hasChanges).toBe(false);
    });
  });

  describe('diffText', () => {
    test('detects line additions', () => {
      const result = service.diffText('line1\nline2\nline3', 'line1\nline2');
      expect(result.hasChanges).toBe(true);
      expect(result.additions.length).toBe(1);
    });

    test('detects line deletions', () => {
      const result = service.diffText('line1', 'line1\nline2');
      expect(result.hasChanges).toBe(true);
      expect(result.deletions.length).toBe(1);
    });

    test('detects line modifications', () => {
      const result = service.diffText('line1\nmodified', 'line1\noriginal');
      expect(result.hasChanges).toBe(true);
    });

    test('reports no changes for identical text', () => {
      const text = 'line1\nline2\nline3';
      const result = service.diffText(text, text);
      expect(result.hasChanges).toBe(false);
    });
  });
});
