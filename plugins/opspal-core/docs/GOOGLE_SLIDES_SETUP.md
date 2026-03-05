# Google Slides Generator - Setup Guide

This guide explains how to set up Google API credentials for the Google Slides Generator.

## Overview

The Google Slides Generator requires OAuth2 credentials to access the Google Slides and Google Drive APIs. This is a one-time setup process.

## Prerequisites

- Google account with access to Google Cloud Console
- Access to Google Slides and Google Drive
- Node.js 18+ installed

## Setup Steps

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name: "RevPal Slides Generator" (or any name)
4. Click "Create"
5. Wait for project creation (about 30 seconds)

### Step 2: Enable Required APIs

1. In your new project, go to "APIs & Services" → "Library"
2. Search for and enable these APIs:
   - **Google Slides API**
   - **Google Drive API**

**Enable Google Slides API:**
- Search "Google Slides API"
- Click on it
- Click "Enable"
- Wait for activation

**Enable Google Drive API:**
- Search "Google Drive API"
- Click on it
- Click "Enable"
- Wait for activation

### Step 3: Create OAuth2 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted to configure consent screen:
   - Click "Configure Consent Screen"
   - Select "External" (unless using Google Workspace)
   - Click "Create"
   - Fill in:
     - App name: "RevPal Slides Generator"
     - User support email: Your email
     - Developer contact: Your email
   - Click "Save and Continue"
   - Skip "Scopes" page (click "Save and Continue")
   - Skip "Test users" page (click "Save and Continue")
   - Click "Back to Dashboard"

4. Return to "Credentials" page
5. Click "Create Credentials" → "OAuth client ID"
6. Application type: **Desktop app**
7. Name: "RevPal Slides Generator Client"
8. Click "Create"

### Step 4: Download and Install Credentials

1. In the Credentials page, find your new OAuth 2.0 Client ID
2. Click the download icon (⬇) on the right
3. Save the JSON file

4. Create credentials directory:
   ```bash
   mkdir -p ~/.credentials
   ```

5. Move the downloaded file:
   ```bash
   mv ~/Downloads/client_secret_*.json ~/.credentials/google-credentials.json
   ```

6. Verify the file:
   ```bash
   ls -la ~/.credentials/google-credentials.json
   cat ~/.credentials/google-credentials.json | jq '.installed.client_id'
   ```

   You should see a client ID like: `123456789-abc123.apps.googleusercontent.com`

### Step 5: Set Environment Variable (Optional)

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/.credentials/google-credentials.json
```

Reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

### Step 6: First-Time Authentication

The first time you run the Google Slides Generator, you'll be prompted to authorize:

1. Run the test script:
   ```bash
   node scripts/test-slides-generation.js
   ```

2. You'll see a URL in the terminal:
   ```
   Authorize this app by visiting this url: https://accounts.google.com/o/oauth2/v2/auth?...
   ```

3. Copy and paste the URL into your browser
4. Sign in with your Google account
5. Click "Allow" to grant permissions
6. Copy the authorization code from the browser
7. Paste it back into the terminal

8. The script will complete and save the token for future use

## Verification

Test that everything works:

```bash
node scripts/test-slides-generation.js
```

You should see:
- ✅ Google API clients initialized
- ✅ Template cloned successfully
- ✅ Slides created
- ✅ Presentation URL provided

## Troubleshooting

### Error: "Google credentials not found"

**Problem**: Credentials file not in the expected location

**Solution**:
```bash
# Check if file exists
ls -la ~/.credentials/google-credentials.json

# If not, verify you downloaded and moved the file correctly
# Should contain "installed" or "web" key with client_id, client_secret, etc.
cat ~/.credentials/google-credentials.json | jq .
```

### Error: "Cannot read properties of undefined (reading 'redirect_uris')"

**Problem**: Wrong credential type (service account instead of OAuth2)

**Solution**: Download OAuth2 credentials (Desktop app type), not service account credentials

### Error: "Access blocked: This app's request is invalid"

**Problem**: OAuth consent screen not configured

**Solution**:
1. Go to "APIs & Services" → "OAuth consent screen"
2. Complete the setup (see Step 3 above)
3. Add your email as a test user if using External user type

### Error: "API has not been used in project before"

**Problem**: Google Slides API or Google Drive API not enabled

**Solution**:
1. Go to "APIs & Services" → "Library"
2. Search for "Google Slides API" and "Google Drive API"
3. Enable both APIs

## Security Notes

- **Keep credentials file secure**: Contains client secret
- **Don't commit to git**: `.gitignore` should exclude `~/.credentials/`
- **Rotate credentials**: If compromised, delete and recreate in Google Cloud Console
- **Token storage**: OAuth tokens are cached in `~/.credentials/token.json`

## Alternative: Manual Mode

If you can't set up OAuth2 credentials, you can use manual mode:

1. Create presentation manually in Google Slides
2. Note the presentation ID from URL:
   ```
   https://docs.google.com/presentation/d/PRESENTATION_ID/edit
   ```

3. Run in manual mode:
   ```javascript
   const manager = new GoogleSlidesManager({ mode: 'manual' });

   // Provide existing presentation ID
   const presentation = {
     presentationId: 'YOUR_PRESENTATION_ID',
     url: 'https://docs.google.com/presentation/d/YOUR_PRESENTATION_ID/edit'
   };

   // Continue with manual modifications
   ```

## Support

- [Google Slides API Documentation](https://developers.google.com/slides)
- [OAuth2 Setup Guide](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)

---

**Last Updated**: 2025-12-08
**Version**: 1.0.0
