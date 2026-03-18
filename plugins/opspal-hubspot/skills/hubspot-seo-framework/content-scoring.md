# Content Quality Scoring

## Overall Content Score (0-100)

### Component Breakdown
| Component | Weight | Score Range |
|-----------|--------|-------------|
| Keyword Optimization | 25% | 0-100 |
| Readability | 20% | 0-100 |
| Meta Tags | 20% | 0-100 |
| Content Structure | 15% | 0-100 |
| Internal Linking | 10% | 0-100 |
| Image Optimization | 10% | 0-100 |

## Keyword Optimization Score

### Scoring Criteria
| Factor | Points | Criteria |
|--------|--------|----------|
| Title includes keyword | 20 | Keyword in first 60 chars |
| First paragraph | 15 | Keyword in first 100 words |
| H1 tag | 15 | Keyword in H1 |
| URL slug | 10 | Keyword in URL |
| H2 tags | 10 | Keyword in at least one H2 |
| Keyword density | 15 | 1-2% density |
| Variations used | 15 | 3+ keyword variations |

### Keyword Density Calculator
```javascript
function calculateKeywordDensity(content, keyword) {
  const words = content.toLowerCase().split(/\s+/);
  const keywordWords = keyword.toLowerCase().split(/\s+/);
  const keywordCount = countOccurrences(content.toLowerCase(), keyword.toLowerCase());
  const totalWords = words.length;

  return (keywordCount * keywordWords.length / totalWords) * 100;
}

// Scoring
function scoreKeywordDensity(density) {
  if (density >= 1 && density <= 2) return 100;
  if (density >= 0.5 && density < 1) return 70;
  if (density > 2 && density <= 3) return 60;
  if (density > 3) return 20; // Over-optimized
  return 30; // Under-optimized
}
```

## Readability Score

### Flesch Reading Ease
| Score | Grade Level | Audience |
|-------|-------------|----------|
| 90-100 | 5th grade | Very easy |
| 80-89 | 6th grade | Easy |
| 70-79 | 7th grade | Fairly easy |
| 60-69 | 8th-9th | Standard |
| 50-59 | 10th-12th | Fairly difficult |
| 30-49 | College | Difficult |
| 0-29 | Graduate | Very difficult |

**Target**: 60-70 (8th-9th grade) for most web content

### Readability Factors
| Factor | Points | Criteria |
|--------|--------|----------|
| Flesch score 60-70 | 40 | Optimal range |
| Sentence length | 20 | Avg < 20 words |
| Paragraph length | 15 | Avg 2-4 sentences |
| Passive voice | 15 | < 10% passive |
| Transition words | 10 | > 25% of sentences |

### Calculation
```javascript
function calculateFleschScore(text) {
  const sentences = countSentences(text);
  const words = countWords(text);
  const syllables = countSyllables(text);

  return 206.835 -
         (1.015 * (words / sentences)) -
         (84.6 * (syllables / words));
}
```

## Meta Tag Score

### Scoring Criteria
| Factor | Points | Criteria |
|--------|--------|----------|
| Title length | 25 | 50-60 characters |
| Title has keyword | 20 | Keyword present |
| Description length | 25 | 150-160 characters |
| Description has keyword | 15 | Keyword present |
| Description has CTA | 15 | Action-oriented |

### Validation Rules
```javascript
function scoreMetaTags(title, description, keyword) {
  let score = 0;

  // Title scoring
  if (title.length >= 50 && title.length <= 60) score += 25;
  else if (title.length >= 40 && title.length <= 70) score += 15;

  if (title.toLowerCase().includes(keyword.toLowerCase())) score += 20;

  // Description scoring
  if (description.length >= 150 && description.length <= 160) score += 25;
  else if (description.length >= 120 && description.length <= 180) score += 15;

  if (description.toLowerCase().includes(keyword.toLowerCase())) score += 15;

  // CTA check
  const ctaWords = ['get', 'learn', 'discover', 'find', 'try', 'start', 'download'];
  if (ctaWords.some(cta => description.toLowerCase().includes(cta))) score += 15;

  return score;
}
```

## Content Structure Score

### Scoring Criteria
| Factor | Points | Criteria |
|--------|--------|----------|
| Has H1 | 20 | Exactly one H1 |
| H2 count | 25 | 3-7 H2 tags |
| Header hierarchy | 20 | No skipped levels |
| Paragraph structure | 20 | 2-4 sentences avg |
| List usage | 15 | At least 1 list |

## Internal Linking Score

### Scoring Criteria
| Factor | Points | Criteria |
|--------|--------|----------|
| Link count | 40 | 3-5 per 1000 words |
| Anchor text quality | 30 | Descriptive anchors |
| Link relevance | 30 | Links to related content |

### Anchor Text Quality
```javascript
function scoreAnchorText(anchorText) {
  const poorAnchors = ['click here', 'read more', 'here', 'link', 'this'];

  if (poorAnchors.includes(anchorText.toLowerCase())) {
    return 0; // Poor anchor text
  }

  if (anchorText.length > 5 && anchorText.length < 60) {
    return 100; // Good descriptive anchor
  }

  return 50; // Acceptable
}
```

## Image Optimization Score

### Scoring Criteria
| Factor | Points | Criteria |
|--------|--------|----------|
| Alt text present | 30 | All images have alt |
| Alt text quality | 25 | Descriptive, includes keyword |
| File size | 25 | < 200KB per image |
| File naming | 20 | Descriptive file names |

## Overall Score Interpretation

| Score | Rating | Action |
|-------|--------|--------|
| 90-100 | Excellent | Publish as-is |
| 80-89 | Good | Minor tweaks |
| 70-79 | Fair | Review and optimize |
| 60-69 | Needs Work | Significant revisions |
| < 60 | Poor | Major rewrite needed |
