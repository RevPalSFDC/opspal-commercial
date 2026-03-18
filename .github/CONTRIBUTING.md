# Contributing to OpsPal Plugin Marketplace

## Branch Protection Policy

The `main` branch is protected. All changes must go through pull requests.

### Workflow

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes and commit:**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

3. **Push your branch:**
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Create a Pull Request:**
   - Go to: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/pulls
   - Click "New pull request"
   - Select your branch
   - Add description of changes
   - Request review from @RevPalSFDC

5. **Wait for approval:**
   - Repository admins will review your PR
   - Address any feedback
   - Once approved, admins will merge to `main`

### Direct Push Restrictions

**Only repository admins can push directly to `main`.**

All other contributors must use pull requests. This ensures:
- Code review before merging
- Automated tests run via GitHub Actions
- Quality control and validation
- Audit trail of all changes

### Automated Validation

All pull requests automatically run:
- Plugin validation (quality score >= 80)
- Marketplace catalog validation
- Integration tests

PRs must pass all checks before merging.

## Questions?

Contact the repository maintainers or open an issue.
