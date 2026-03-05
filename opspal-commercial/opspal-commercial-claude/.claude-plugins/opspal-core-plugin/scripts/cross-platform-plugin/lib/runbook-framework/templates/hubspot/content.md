## Content & Blog

{{#if featureDetails.contentStrategy}}
**Blog Posts:** {{featureDetails.contentStrategy.blogPosts}}
**Landing Pages:** {{featureDetails.contentStrategy.landingPages}}
**CTAs:** {{featureDetails.contentStrategy.ctaButtons}}

### Blog Performance

{{#if featureDetails.contentStrategy.blogStats}}
- **Total Views:** {{featureDetails.contentStrategy.blogStats.totalViews}}
- **Avg Views/Post:** {{featureDetails.contentStrategy.blogStats.avgViews}}
- **Top Performing:** {{featureDetails.contentStrategy.blogStats.topPost}}
{{/if}}

### Landing Pages

{{#if featureDetails.contentStrategy.topLandingPages}}
| Page | Views | Conversions |
|------|-------|-------------|
{{#each featureDetails.contentStrategy.topLandingPages}}
| {{this.name}} | {{this.views}} | {{this.conversions}} |
{{/each}}
{{else}}
No landing page data available.
{{/if}}

### SEO Performance

{{#if featureDetails.contentStrategy.seoStats}}
- **Organic Traffic:** {{featureDetails.contentStrategy.seoStats.organicTraffic}}
- **Keywords Ranking:** {{featureDetails.contentStrategy.seoStats.keywordsRanking}}
{{/if}}
{{else}}
Content strategy information not available. Run feature detection to populate.
{{/if}}
