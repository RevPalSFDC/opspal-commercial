const { parseCliArgs } = require('../scripts/lib/pdf-cli-parser');

describe('pdf-cli-parser', () => {
    it('parses positional single-document invocation', () => {
        const parsed = parseCliArgs(['report.md', 'report.pdf', '--verbose']);

        expect(parsed.ok).toBe(true);
        expect(parsed.mode).toBe('single');
        expect(parsed.input).toBe('report.md');
        expect(parsed.output).toBe('report.pdf');
        expect(parsed.options.verbose).toBe(true);
    });

    it('parses --input/--output invocation', () => {
        const parsed = parseCliArgs([
            '--input', 'report.md',
            '--output', 'report.pdf',
            '--profile', 'cover-toc'
        ]);

        expect(parsed.ok).toBe(true);
        expect(parsed.mode).toBe('single');
        expect(parsed.input).toBe('report.md');
        expect(parsed.output).toBe('report.pdf');
        expect(parsed.options.profile).toBe('cover-toc');
    });

    it('parses collate positional invocation', () => {
        const parsed = parseCliArgs([
            '--collate',
            'reports/*.md',
            'report.pdf',
            '--profile', 'simple'
        ]);

        expect(parsed.ok).toBe(true);
        expect(parsed.mode).toBe('collate');
        expect(parsed.input).toBe('reports/*.md');
        expect(parsed.output).toBe('report.pdf');
        expect(parsed.options.profile).toBe('simple');
    });

    it('parses collate with --input/--output', () => {
        const parsed = parseCliArgs([
            '--collate',
            '--input', 'reports/*.md',
            '--output', 'report.pdf',
            '--bookmarks'
        ]);

        expect(parsed.ok).toBe(true);
        expect(parsed.mode).toBe('collate');
        expect(parsed.input).toBe('reports/*.md');
        expect(parsed.output).toBe('report.pdf');
        expect(parsed.options.bookmarks).toBe(true);
    });

    it('fails on missing --input value', () => {
        const parsed = parseCliArgs(['--input', '--output', 'report.pdf']);

        expect(parsed.ok).toBe(false);
        expect(parsed.error).toBe('Missing value for --input');
    });

    it('passes through unknown options for compatibility', () => {
        const parsed = parseCliArgs(['report.md', 'report.pdf', '--bogus', '123']);

        expect(parsed.ok).toBe(true);
        expect(parsed.options.bogus).toBe('123');
    });

    it('defaults to cover-toc profile when --profile is omitted', () => {
        const parsed = parseCliArgs(['report.md', 'report.pdf']);

        expect(parsed.ok).toBe(true);
        expect(parsed.options.profile).toBe('cover-toc');
    });

    it('rejects legacy --theme flag', () => {
        const parsed = parseCliArgs(['report.md', 'report.pdf', '--theme', 'revpal-brand']);

        expect(parsed.ok).toBe(false);
        expect(parsed.error).toContain('--theme flag is no longer supported');
    });

    it('rejects legacy --cover flag', () => {
        const parsed = parseCliArgs(['report.md', 'report.pdf', '--cover']);

        expect(parsed.ok).toBe(false);
        expect(parsed.error).toContain('--cover flag is no longer supported');
    });

    it('rejects legacy --toc flag', () => {
        const parsed = parseCliArgs(['--collate', 'reports/*.md', 'report.pdf', '--toc']);

        expect(parsed.ok).toBe(false);
        expect(parsed.error).toContain('--toc flag is no longer supported');
    });
});
