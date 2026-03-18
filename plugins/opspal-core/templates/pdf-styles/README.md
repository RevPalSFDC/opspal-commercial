# PDF Styles and Themes

Location: `templates/pdf-styles/`

The PDF stylesheet is composed from multiple layers:

- Base: `templates/pdf-styles/base.css`
- Components: `templates/pdf-styles/components/` (cover, tables, toc)
- Themes: `templates/pdf-styles/themes/`

## Available Themes

- `default` - Neutral system theme
- `revpal` - RevPal branded theme
- `revpal-brand` - RevPal branded theme (default for PDF generation)

## Usage

```js
const PDFGenerator = require('../scripts/lib/pdf-generator');

const generator = new PDFGenerator({ theme: 'revpal-brand' });

await generator.convertMarkdown(inputPath, outputPath, {
  theme: 'revpal-brand',
  metadata: { title: 'Sample Report', date: '2025-12-30' }
});
```

Use `theme` in the constructor for a default, or pass `theme` in the per-call options to override.
