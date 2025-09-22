# Slack Integration for RevPal Agents

## Overview

This integration automatically sends beautiful, formatted notifications to your Slack channel whenever a new release is published on GitHub. Every release will trigger an automatic notification to channel **C09D86TQVU5** with release details, statistics, and quick action buttons.

## Features

- 🚀 Automatic release notifications on GitHub release publication
- 📊 Release statistics extraction (files changed, additions, deletions)
- ✨ Highlight extraction from release notes
- 🎨 Beautiful Slack message formatting with action buttons
- 🔬 Support for draft and pre-release notifications
- 🧪 Testing utilities for webhook verification

## Quick Setup

### Step 1: Create Slack Webhook

Run the interactive setup script:

```bash
./scripts/setup-slack-webhook.sh
```

This will guide you through:
1. Creating an incoming webhook for channel C09D86TQVU5
2. Testing the webhook connection
3. Saving the configuration

### Step 2: Add GitHub Secret

1. Go to your repository settings on GitHub:
   ```
   https://github.com/RevPal/Agents/settings/secrets/actions
   ```

2. Click "New repository secret"

3. Add a secret named `SLACK_WEBHOOK_URL` with your webhook URL from Step 1

### Step 3: Test the Integration

Test with a sample release:

```bash
node scripts/test-slack-notification.js
```

Or test with a real release:

```bash
node scripts/test-slack-notification.js --release v1.0.0
```

## What You'll Receive

Every time you create a GitHub release, Slack channel C09D86TQVU5 will receive a notification like:

```
🚀 RevPal Agents v1.2.0

✨ Highlights:
• Slack integration for release notifications
• Automated notifications to channel C09D86TQVU5
• Rich formatting with statistics

📊 6 files added | 700+ lines of code

[View Release] [Documentation] [Repository]
```

## Manual Usage

You can also manually send notifications:

```bash
node scripts/slack-release-notifier.js \
  --version v1.0.0 \
  --title "Major Release" \
  --body "Release notes here..." \
  --url "https://github.com/RevPal/Agents/releases/tag/v1.0.0"
```

## Configuration

### Environment Variables

- `SLACK_WEBHOOK_URL` (required): Your Slack incoming webhook URL
- `SLACK_CHANNEL` (optional): Override the default channel
- `PROJECT_NAME` (optional): Override project name (default: "RevPal Agents")
- `REPO_URL` (optional): Override repository URL

### Slack App Details

- **App ID**: A08FC8K02AJ
- **Client ID**: 4172559150165.8522291002358
- **Target Channel**: C09D86TQVU5

## Troubleshooting

### Webhook Not Working

1. Verify the webhook URL is correct:
   ```bash
   echo $SLACK_WEBHOOK_URL
   ```

2. Test the webhook directly:
   ```bash
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test message"}' \
     $SLACK_WEBHOOK_URL
   ```

### GitHub Action Not Triggering

1. Check that the secret is properly set:
   - Go to Settings → Secrets → Actions
   - Ensure `SLACK_WEBHOOK_URL` exists

2. Check GitHub Actions logs:
   - Go to Actions tab
   - Look for "Release Slack Notification" workflow

### Message Not Formatting Correctly

The notifier automatically extracts:
- Bullet points (•, -, *) as highlights
- Numbers matching patterns like "X files changed"
- First 3-4 highlights from release notes

To ensure good formatting:
- Use bullet points for key features
- Include statistics in your release notes
- Keep highlights concise (under 100 characters)

## Security Best Practices

1. **Never commit webhook URLs** - Always use GitHub Secrets
2. **Rotate webhooks regularly** - Regenerate if compromised
3. **Limit channel access** - Use dedicated release channels
4. **Monitor webhook usage** - Check Slack audit logs

## Advanced Configuration

### Custom Message Formatting

Edit `scripts/slack-release-notifier.js` to customize:

```javascript
// Customize project name and repo URL
this.projectName = 'Your Project Name';
this.repoUrl = 'https://github.com/YourOrg/YourRepo';

// Customize message emoji and colors
let emoji = '🚀'; // Change release emoji
let color = 'good'; // Change message color
```

### Multiple Channel Support

To send to multiple channels, modify the workflow:

```yaml
- name: Send to Multiple Channels
  run: |
    CHANNELS=("#releases" "#engineering" "#product")
    for channel in "${CHANNELS[@]}"; do
      SLACK_CHANNEL="$channel" node scripts/slack-release-notifier.js ...
    done
```

### Conditional Notifications

Only notify for non-draft releases:

```yaml
- name: Send Slack Notification
  if: github.event.release.draft == false
  run: |
    node scripts/slack-release-notifier.js ...
```

## Integration with CI/CD

The Slack notifier can be integrated into any CI/CD pipeline:

### GitHub Actions (Included)

Already configured in `.github/workflows/release-notification.yml`

### Jenkins

```groovy
stage('Notify Slack') {
  steps {
    sh '''
      node scripts/slack-release-notifier.js \
        --version ${VERSION} \
        --title "${TITLE}" \
        --body "${RELEASE_NOTES}"
    '''
  }
}
```

### CircleCI

```yaml
- run:
    name: Notify Slack
    command: |
      node scripts/slack-release-notifier.js \
        --version $CIRCLE_TAG \
        --title "$RELEASE_TITLE"
```

## Support

For issues or questions:
1. Check this documentation
2. Review the troubleshooting section
3. Test with the provided test script
4. Check GitHub Actions logs for automation issues

## License

This Slack integration is part of the RevPal Agents project and follows the same license terms.