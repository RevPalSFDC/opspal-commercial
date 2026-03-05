const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseCsvLine,
  parseCSV,
  applyAccountAssociationCausePolicy
} = require('../../territory/territory-bulk-assignment');

describe('territory-bulk-assignment CSV safeguards', () => {
  describe('parseCsvLine', () => {
    it('parses quoted commas and escaped quotes', () => {
      const { values, error } = parseCsvLine('001xx,0MIxx,"Territory2Manual","Rep ""East"""');
      expect(error).toBeNull();
      expect(values).toEqual(['001xx', '0MIxx', 'Territory2Manual', 'Rep "East"']);
    });

    it('returns error for unclosed quote', () => {
      const { error } = parseCsvLine('001xx,0MIxx,"Territory2Manual');
      expect(error).toBe('Unclosed quoted field');
    });
  });

  describe('parseCSV', () => {
    function writeTempCsv(content) {
      const file = path.join(os.tmpdir(), `territory-bulk-${Date.now()}-${Math.random()}.csv`);
      fs.writeFileSync(file, content, 'utf-8');
      return file;
    }

    it('returns line-level parse errors for malformed rows', () => {
      const file = writeTempCsv([
        'ObjectId,Territory2Id,AssociationCause',
        '001A,0MIA,Territory2Manual',
        '001B,0MIB', // Missing column
        '001C,0MIC,Territory2Rule'
      ].join('\n'));

      const parsed = parseCSV(file);
      expect(parsed.records).toHaveLength(2);
      expect(parsed.errors).toHaveLength(1);
      expect(parsed.errors[0].line).toBe(3);
      expect(parsed.errors[0].error).toContain('Column count mismatch');
    });
  });

  describe('applyAccountAssociationCausePolicy', () => {
    const assignments = [
      { __lineNumber: 2, ObjectId: '001A', Territory2Id: '0MIA', AssociationCause: 'Territory2Manual' },
      { __lineNumber: 3, ObjectId: '001B', Territory2Id: '0MIB', AssociationCause: '' },
      { __lineNumber: 4, ObjectId: '001C', Territory2Id: '0MIC', AssociationCause: 'territory2api' }
    ];

    it('fails strict mode when AssociationCause is missing', () => {
      const result = applyAccountAssociationCausePolicy(assignments, { requireAssociationCause: true });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].line).toBe(3);
      expect(result.assignments).toHaveLength(2);
    });

    it('applies default when fallback mode is enabled', () => {
      const result = applyAccountAssociationCausePolicy(assignments, {
        requireAssociationCause: false,
        associationCause: 'Territory2Rule'
      });

      expect(result.errors).toHaveLength(0);
      expect(result.defaultsApplied).toBe(1);
      expect(result.assignments).toHaveLength(3);

      const line3 = result.assignments.find((a) => a.__lineNumber === 3);
      expect(line3.AssociationCause).toBe('Territory2Rule');

      const line4 = result.assignments.find((a) => a.__lineNumber === 4);
      expect(line4.AssociationCause).toBe('Territory2Api');
    });

    it('throws for invalid default association cause', () => {
      expect(() => {
        applyAccountAssociationCausePolicy(assignments, {
          requireAssociationCause: false,
          associationCause: 'BadCause'
        });
      }).toThrow('Invalid default association cause');
    });
  });
});
