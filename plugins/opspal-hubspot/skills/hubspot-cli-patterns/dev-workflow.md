# HubSpot CLI Development Workflow

Complete development workflow patterns for building and managing HubSpot CMS themes.

## Local Development Setup

### Initial Setup

```bash
# 1. Install HubSpot CLI
npm install -g @hubspot/cli

# 2. Authenticate
hs auth

# 3. Create or fetch theme
# Option A: Create new theme
hs cms create website-theme my-theme

# Option B: Fetch existing theme
hs cms fetch @hubspot/existing-theme ./my-theme

# 4. Set up version control
cd my-theme
git init
echo "hubspot.config.yml" >> .gitignore
git add .
git commit -m "Initial theme setup"
```

### Project Structure

```
my-project/
├── .git/
├── .gitignore
├── hubspot.config.yml      # Local only, not committed
├── theme/
│   ├── theme.json
│   ├── fields.json
│   ├── templates/
│   │   ├── layouts/
│   │   │   └── base.html
│   │   ├── home.html
│   │   ├── about.html
│   │   └── blog/
│   │       ├── listing.html
│   │       └── post.html
│   ├── modules/
│   │   ├── hero/
│   │   ├── cta/
│   │   └── testimonials/
│   ├── css/
│   │   ├── main.css
│   │   └── components/
│   ├── js/
│   │   └── main.js
│   └── images/
├── package.json            # Optional: for build tools
└── README.md
```

## Watch Mode Development

### Basic Watch

```bash
# Start watching for changes
cd my-project
hs cms watch ./theme @hubspot/my-theme --mode=draft
```

Watch mode will:
- Detect file changes automatically
- Upload changed files to HubSpot draft
- Display upload status in terminal
- Continue running until Ctrl+C

### Watch with Initial Upload

```bash
# Upload everything first, then watch
hs cms watch ./theme @hubspot/my-theme --mode=draft --initial-upload
```

Use `--initial-upload` when:
- Starting fresh development session
- After pulling changes from git
- After switching branches

### Watch Specific Directories

```bash
# Only watch CSS (faster for styling work)
hs cms watch ./theme/css @hubspot/my-theme/css --mode=draft

# Only watch templates
hs cms watch ./theme/templates @hubspot/my-theme/templates --mode=draft
```

## Development Workflow

### Daily Workflow

```bash
# 1. Start your day: Fetch latest from HubSpot
hs cms fetch @hubspot/my-theme ./theme --overwrite

# 2. Pull latest from git
git pull origin main

# 3. Start watch mode
hs cms watch ./theme @hubspot/my-theme --mode=draft --initial-upload

# 4. Open HubSpot preview in browser
# https://app.hubspot.com/design-manager/PORTAL_ID/themes/my-theme

# 5. Make changes, see them live in preview
# (watch mode uploads automatically)

# 6. When done, commit changes
git add .
git commit -m "feat: update hero module"
git push origin main
```

### Feature Development Workflow

```bash
# 1. Create feature branch
git checkout -b feature/new-pricing-page

# 2. Fetch latest theme state
hs cms fetch @hubspot/my-theme ./theme --overwrite

# 3. Start development
hs cms watch ./theme @hubspot/my-theme --mode=draft --initial-upload

# 4. Develop and test in preview
# Make changes → Auto-upload → Preview in HubSpot

# 5. Validate before merging
hs cms theme marketplace-validate ./theme

# 6. Commit and create PR
git add .
git commit -m "feat: add pricing page template"
git push origin feature/new-pricing-page

# 7. After PR approval and merge to main:
git checkout main
git pull origin main

# 8. Deploy to production
hs cms upload ./theme @hubspot/my-theme --mode=publish
```

## Testing and Validation

### Theme Validation

```bash
# Full marketplace validation
hs cms theme marketplace-validate ./theme

# Check for:
# - Required files (theme.json, fields.json)
# - Valid JSON syntax
# - Accessibility issues
# - Best practice warnings
```

### Performance Testing

```bash
# Run Lighthouse audit
hs cms lighthouse-score https://your-site.com

# Test specific pages
hs cms lighthouse-score https://your-site.com/about
hs cms lighthouse-score https://your-site.com/blog
```

### Preview Testing Checklist

```markdown
## Preview Testing Checklist

### Desktop (1920x1080)
- [ ] All pages render correctly
- [ ] Navigation works
- [ ] Images load
- [ ] Forms functional
- [ ] CTAs clickable

### Tablet (768x1024)
- [ ] Responsive layout correct
- [ ] Touch targets adequate
- [ ] No horizontal scroll

### Mobile (375x667)
- [ ] Mobile menu works
- [ ] Text readable
- [ ] Forms usable
- [ ] No layout breaks

### Browser Testing
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge
```

## Build Tools Integration

### Using npm Scripts

```json
// package.json
{
  "name": "my-hubspot-theme",
  "version": "1.0.0",
  "scripts": {
    "dev": "hs cms watch ./theme @hubspot/my-theme --mode=draft --initial-upload",
    "fetch": "hs cms fetch @hubspot/my-theme ./theme --overwrite",
    "deploy:draft": "hs cms upload ./theme @hubspot/my-theme --mode=draft",
    "deploy:publish": "hs cms upload ./theme @hubspot/my-theme --mode=publish",
    "validate": "hs cms theme marketplace-validate ./theme",
    "lighthouse": "hs cms lighthouse-score"
  }
}
```

Usage:
```bash
npm run dev        # Start development
npm run fetch      # Fetch latest from HubSpot
npm run validate   # Validate theme
npm run deploy:publish  # Deploy to live
```

### With CSS Preprocessors (SCSS)

```json
// package.json
{
  "scripts": {
    "sass:watch": "sass --watch ./src/scss:./theme/css",
    "sass:build": "sass ./src/scss:./theme/css --style=compressed",
    "dev": "concurrently \"npm run sass:watch\" \"npm run hs:watch\"",
    "hs:watch": "hs cms watch ./theme @hubspot/my-theme --mode=draft"
  },
  "devDependencies": {
    "sass": "^1.69.0",
    "concurrently": "^8.2.0"
  }
}
```

### With JavaScript Bundling

```json
// package.json
{
  "scripts": {
    "js:watch": "esbuild ./src/js/main.js --bundle --outfile=./theme/js/main.js --watch",
    "js:build": "esbuild ./src/js/main.js --bundle --outfile=./theme/js/main.js --minify",
    "dev": "concurrently \"npm run js:watch\" \"npm run sass:watch\" \"npm run hs:watch\"",
    "hs:watch": "hs cms watch ./theme @hubspot/my-theme --mode=draft"
  }
}
```

## Deployment Strategies

### Manual Deployment

```bash
# 1. Validate
hs cms theme marketplace-validate ./theme

# 2. Run Lighthouse
hs cms lighthouse-score https://your-site.com

# 3. Deploy to draft for final review
hs cms upload ./theme @hubspot/my-theme --mode=draft

# 4. Review in HubSpot preview
# Check all pages, forms, modules

# 5. Deploy to live
hs cms upload ./theme @hubspot/my-theme --mode=publish
```

### Automated Deployment (CI/CD)

See `auth-patterns.md` for CI/CD configuration examples.

### Blue-Green Deployment

```bash
# 1. Create "v2" version of theme
cp -r ./theme ./theme-v2
# Update theme-v2/theme.json with new name

# 2. Deploy v2 as separate theme
hs cms upload ./theme-v2 @hubspot/my-theme-v2 --mode=draft

# 3. Test v2 thoroughly
# Update pages to use v2 theme (in staging)

# 4. When ready, update production pages to v2
# Or switch DNS/routing

# 5. Keep v1 as rollback
```

## Rollback Procedures

### Quick Rollback (Git)

```bash
# 1. Identify last good commit
git log --oneline

# 2. Checkout previous version
git checkout abc1234 -- ./theme

# 3. Deploy rollback
hs cms upload ./theme @hubspot/my-theme --mode=publish

# 4. Return to main
git checkout main -- ./theme
```

### Rollback with HubSpot Revisions

```bash
# HubSpot keeps revision history in Design Manager
# Use HubSpot UI to:
# 1. Go to Design Manager
# 2. Right-click file → View Revisions
# 3. Restore previous version
# 4. Fetch to local
hs cms fetch @hubspot/my-theme ./theme --overwrite
```

## Troubleshooting Development

### Common Issues

**Watch mode not detecting changes**:
```bash
# Stop and restart with initial upload
# Ctrl+C
hs cms watch ./theme @hubspot/my-theme --mode=draft --initial-upload
```

**File not uploading**:
```bash
# Check file path is within theme directory
# Verify file extension is supported
# Try manual upload
hs cms upload ./theme/file.html @hubspot/my-theme/file.html --mode=draft
```

**Preview not updating**:
```bash
# Clear browser cache
# Or use incognito mode
# Verify upload completed in terminal
```

**HubL syntax errors**:
```bash
# Check HubSpot Design Manager for error details
# Use HubL linter if available
# Review HubSpot documentation for correct syntax
```

### Debug Mode

```bash
# Enable verbose output
hs cms watch ./theme @hubspot/my-theme --mode=draft --debug

# Shows:
# - File change detection
# - Upload requests
# - Response status
# - Error details
```

## Best Practices

### Development

- [ ] Always work in draft mode during development
- [ ] Use feature branches for significant changes
- [ ] Validate theme before every publish
- [ ] Test on multiple devices/browsers
- [ ] Keep commits small and focused

### Version Control

- [ ] Never commit `hubspot.config.yml` with tokens
- [ ] Use meaningful commit messages
- [ ] Tag releases (v1.0.0, v1.1.0)
- [ ] Document breaking changes

### Performance

- [ ] Optimize images before adding to theme
- [ ] Minimize CSS/JS in production
- [ ] Use lazy loading for below-fold content
- [ ] Run Lighthouse before deployments

### Collaboration

- [ ] Document theme structure in README
- [ ] Create coding standards for team
- [ ] Use PR reviews for production changes
- [ ] Maintain changelog
