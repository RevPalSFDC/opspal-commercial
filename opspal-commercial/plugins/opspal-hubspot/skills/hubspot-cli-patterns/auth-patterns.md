# HubSpot CLI Authentication Patterns

Complete reference for HubSpot CLI authentication, including local development and CI/CD pipelines.

## Authentication Methods

### Method 1: Interactive Authentication (Local Development)

Best for: Individual developers working locally

```bash
# Start authentication flow
hs auth

# This will:
# 1. Open browser to HubSpot login
# 2. Request OAuth permissions
# 3. Create hubspot.config.yml in current directory
```

**hubspot.config.yml** (auto-generated):
```yaml
defaultPortal: my-account
portals:
  - name: my-account
    portalId: 12345678
    authType: personalaccesskey
    personalAccessKey: 'pat-na1-xxxxx-xxxxx-xxxxx'
```

### Method 2: Environment Variables (CI/CD)

Best for: Automated deployments, CI/CD pipelines

```bash
# Set environment variables
export HUBSPOT_ACCOUNT_ID=12345678
export HUBSPOT_PERSONAL_ACCESS_KEY=pat-na1-xxxxx-xxxxx-xxxxx

# Use with CLI
hs cms upload --use-env ./my-theme @hubspot/my-theme
```

Required variables:
- `HUBSPOT_ACCOUNT_ID` - Your HubSpot portal ID
- `HUBSPOT_PERSONAL_ACCESS_KEY` - Personal access key (PAK)

### Method 3: Config File with Account Selection

Best for: Managing multiple HubSpot accounts

```bash
# Add another account
hs auth --account=production

# hubspot.config.yml now has multiple portals
# defaultPortal: development
# portals:
#   - name: development
#     portalId: 12345678
#     ...
#   - name: production
#     portalId: 87654321
#     ...

# Use specific account
hs cms upload --account=production ./my-theme @hubspot/my-theme
```

## Personal Access Key (PAK) Setup

### Creating a PAK

1. Go to HubSpot → Settings → Integrations → Private Apps
2. Click "Create a private app"
3. Configure scopes (see below)
4. Copy the access key

### Required Scopes for CMS Operations

| Scope | Operations Enabled |
|-------|-------------------|
| `content` | Pages, blog posts, landing pages |
| `cms.pages.landing_pages.write` | Landing page CRUD |
| `cms.pages.site_pages.write` | Website page CRUD |
| `cms.blogs.write` | Blog post CRUD |
| `files` | File manager operations |
| `design_manager` | Theme, template, module management |
| `forms` | Form management |
| `automation` | Workflow management |

### Recommended Scope Sets

**For Theme Development**:
```
design_manager
files
content
```

**For Full CMS Operations**:
```
design_manager
files
content
cms.pages.landing_pages.write
cms.pages.site_pages.write
cms.blogs.write
forms
```

**For Complete Access**:
```
design_manager
files
content
cms.pages.landing_pages.write
cms.pages.site_pages.write
cms.blogs.write
forms
automation
crm.objects.contacts.write
crm.objects.deals.write
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/deploy-hubspot.yml
name: Deploy to HubSpot

on:
  push:
    branches: [main]

env:
  HUBSPOT_ACCOUNT_ID: ${{ secrets.HUBSPOT_ACCOUNT_ID }}
  HUBSPOT_PERSONAL_ACCESS_KEY: ${{ secrets.HUBSPOT_PERSONAL_ACCESS_KEY }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install HubSpot CLI
        run: npm install -g @hubspot/cli

      - name: Deploy Theme
        run: hs cms upload --use-env ./theme @hubspot/my-theme --mode=publish
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - deploy

deploy-hubspot:
  stage: deploy
  image: node:18
  variables:
    HUBSPOT_ACCOUNT_ID: $HUBSPOT_ACCOUNT_ID
    HUBSPOT_PERSONAL_ACCESS_KEY: $HUBSPOT_PERSONAL_ACCESS_KEY
  script:
    - npm install -g @hubspot/cli
    - hs cms upload --use-env ./theme @hubspot/my-theme --mode=publish
  only:
    - main
```

### Jenkins

```groovy
// Jenkinsfile
pipeline {
    agent any

    environment {
        HUBSPOT_ACCOUNT_ID = credentials('hubspot-account-id')
        HUBSPOT_PERSONAL_ACCESS_KEY = credentials('hubspot-pak')
    }

    stages {
        stage('Install CLI') {
            steps {
                sh 'npm install -g @hubspot/cli'
            }
        }

        stage('Deploy') {
            steps {
                sh 'hs cms upload --use-env ./theme @hubspot/my-theme --mode=publish'
            }
        }
    }
}
```

### CircleCI

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  deploy:
    docker:
      - image: cimg/node:18.0
    steps:
      - checkout
      - run:
          name: Install HubSpot CLI
          command: npm install -g @hubspot/cli
      - run:
          name: Deploy Theme
          command: hs cms upload --use-env ./theme @hubspot/my-theme --mode=publish

workflows:
  deploy-workflow:
    jobs:
      - deploy:
          context: hubspot-credentials
          filters:
            branches:
              only: main
```

## Multi-Environment Setup

### Development → Staging → Production

```bash
# hubspot.config.yml
defaultPortal: development
portals:
  - name: development
    portalId: 11111111
    authType: personalaccesskey
    personalAccessKey: 'pat-dev-xxxxx'

  - name: staging
    portalId: 22222222
    authType: personalaccesskey
    personalAccessKey: 'pat-staging-xxxxx'

  - name: production
    portalId: 33333333
    authType: personalaccesskey
    personalAccessKey: 'pat-prod-xxxxx'
```

### Deployment Workflow

```bash
# Deploy to development (default)
hs cms upload ./theme @hubspot/my-theme --mode=draft

# Test and validate in development
hs cms lighthouse-score https://dev.example.com

# Deploy to staging
hs cms upload --account=staging ./theme @hubspot/my-theme --mode=publish

# Test staging
hs cms lighthouse-score https://staging.example.com

# Deploy to production
hs cms upload --account=production ./theme @hubspot/my-theme --mode=publish
```

### CI/CD Multi-Environment

```yaml
# GitHub Actions with environments
name: Deploy Theme

on:
  push:
    branches:
      - develop
      - staging
      - main

jobs:
  deploy-dev:
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment: development
    env:
      HUBSPOT_ACCOUNT_ID: ${{ secrets.HUBSPOT_DEV_ACCOUNT_ID }}
      HUBSPOT_PERSONAL_ACCESS_KEY: ${{ secrets.HUBSPOT_DEV_PAK }}
    steps:
      - uses: actions/checkout@v3
      - run: npm install -g @hubspot/cli
      - run: hs cms upload --use-env ./theme @hubspot/my-theme --mode=draft

  deploy-staging:
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    environment: staging
    env:
      HUBSPOT_ACCOUNT_ID: ${{ secrets.HUBSPOT_STAGING_ACCOUNT_ID }}
      HUBSPOT_PERSONAL_ACCESS_KEY: ${{ secrets.HUBSPOT_STAGING_PAK }}
    steps:
      - uses: actions/checkout@v3
      - run: npm install -g @hubspot/cli
      - run: hs cms upload --use-env ./theme @hubspot/my-theme --mode=publish

  deploy-production:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    env:
      HUBSPOT_ACCOUNT_ID: ${{ secrets.HUBSPOT_PROD_ACCOUNT_ID }}
      HUBSPOT_PERSONAL_ACCESS_KEY: ${{ secrets.HUBSPOT_PROD_PAK }}
    steps:
      - uses: actions/checkout@v3
      - run: npm install -g @hubspot/cli
      - run: hs cms upload --use-env ./theme @hubspot/my-theme --mode=publish
```

## Security Best Practices

### Token Management

```bash
# NEVER commit hubspot.config.yml with real tokens
echo "hubspot.config.yml" >> .gitignore

# Use environment variables in scripts
if [ -z "$HUBSPOT_PERSONAL_ACCESS_KEY" ]; then
  echo "Error: HUBSPOT_PERSONAL_ACCESS_KEY not set"
  exit 1
fi
```

### Token Rotation

1. Create new PAK in HubSpot
2. Update secrets in CI/CD platform
3. Verify deployments work with new token
4. Revoke old PAK in HubSpot

### Scope Minimization

```bash
# Don't use one PAK for everything
# Create separate PAKs for:
# - Theme development (design_manager, files)
# - Content operations (content, cms.*)
# - Workflow management (automation)
```

### Audit Trail

```bash
# Log deployments
echo "$(date): Deployed theme to $HUBSPOT_ACCOUNT_ID by $USER" >> deployment.log

# In CI/CD, use build metadata
echo "$(date): Deployed from commit $GITHUB_SHA by $GITHUB_ACTOR" >> deployment.log
```

## Troubleshooting

### Authentication Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `No portal found` | Missing config/env vars | Run `hs auth` or set env vars |
| `401 Unauthorized` | Invalid/expired token | Regenerate PAK in HubSpot |
| `403 Forbidden` | Missing required scope | Add scope to private app |
| `Invalid portal ID` | Wrong account ID | Verify HUBSPOT_ACCOUNT_ID |

### Debug Authentication

```bash
# Check current configuration
hs auth list

# Test authentication
hs filemanager ls /

# Verbose mode for debugging
hs cms upload ./theme @hubspot/my-theme --debug
```

### Environment Variable Issues

```bash
# Verify environment variables are set
env | grep HUBSPOT

# Check if --use-env is being used
hs cms upload --use-env --debug ./theme @hubspot/my-theme

# Common mistake: using config file when env vars are set
# Solution: Always use --use-env flag with env vars
```
