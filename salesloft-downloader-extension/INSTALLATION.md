# Salesloft Recording Downloader - Installation & Usage Guide

## Prerequisites
- Google Chrome browser (version 88 or later)
- Active Salesloft account with access to recordings
- Be logged into Salesloft in your browser

## Installation Steps

### 1. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** by toggling the switch in the top right corner
3. Click **"Load unpacked"** button
4. Navigate to the extension folder: `/home/chris/Desktop/RevPal/Agents/salesloft-downloader-extension/`
5. Select the folder and click **"Select Folder"**
6. The extension should now appear in your extensions list with a microphone icon

### 2. Pin the Extension (Optional but Recommended)

1. Click the puzzle piece icon in Chrome's toolbar
2. Find "Salesloft Recording Downloader"
3. Click the pin icon to keep it visible in your toolbar

## Usage Instructions

### Initial Setup

1. **Verify Salesloft Login**
   - Open a new tab and go to https://app.salesloft.com
   - Make sure you're logged in to your Salesloft account
   - Navigate to any recording to verify access

### Downloading Recordings

#### Method 1: Import from Calls Page (Recommended)

1. Click the extension icon in your toolbar
2. Click **"🔄 Import from Calls Page"**
3. The Calls page will open (or switch to it if already open)
4. Apply your filters on the Calls page (date range, users, etc.)
5. The extension will automatically extract recordings
6. If multiple pages exist, choose to extract all or current page
7. URLs will populate in the extension
8. Click **"Start Download"**

#### Method 2: Quick Test (Manual URLs)

1. Click the extension icon
2. Paste a few test URLs (one per line):
   ```
   https://recordings.salesloft.com/c/101314/f43567b7-a6f3-4f86-baf6-fcbbe6060e64
   https://recordings.salesloft.com/c/101314/1d82b3d6-f292-4b5f-a467-5d168f237b28
   ```
3. Click **"Start Download"**
4. Monitor progress in the Status tab

#### Method 3: Load from File

1. Click the extension icon
2. Click **"Load URLs from File"**
3. Select the `urls.txt` file from the extension directory
4. Click **"Start Download"**

### Monitoring Progress

- Switch to the **Status** tab to see:
  - Total recordings to download
  - Successfully downloaded count
  - Failed downloads count
  - Current recording being processed
  - Progress bar

### Download Location

Files are saved to: `~/Downloads/salesloft_recordings/`
- Format: `recording_[uuid].mp3`
- Example: `recording_f43567b7-a6f3-4f86-baf6.mp3`

## Important Notes

### Rate Limiting
- The extension processes recordings sequentially with delays
- Downloading 540 recordings will take approximately 2-3 hours
- Do not close Chrome while downloading is in progress

### Pause and Resume
- Click **"Pause"** to temporarily stop downloads
- Click **"Resume"** to continue from where you left off
- Progress is saved locally, so you can close and reopen the popup

### Troubleshooting

#### Downloads not starting?

**Step 1: Check the Extension Console**
1. Go to `chrome://extensions/`
2. Find "Salesloft Recording Downloader"
3. Click "background page" (or "service worker" in newer Chrome)
4. Look for error messages in the Console tab
5. You should see logs like:
   - "Message received: startDownload"
   - "Starting download with 540 URLs"
   - "Processing: https://recordings..."

**Step 2: Use the Debug Page**
1. Open a new tab
2. Navigate to: `chrome-extension://[EXTENSION_ID]/debug.html`
   - Get your extension ID from `chrome://extensions/`
3. Click "Test Single Tab" to verify basic functionality
4. Click "Test Download (1 URL)" to test a single download
5. Check the console output for errors

**Step 3: Manual Verification**
1. Open https://recordings.salesloft.com/c/101314/f43567b7-a6f3-4f86-baf6-fcbbe6060e64 manually
2. Verify the page loads and you can play the recording
3. Open DevTools (F12) and check the Console for content script logs

**Step 4: Common Fixes**
1. Reload the extension:
   - Go to `chrome://extensions/`
   - Click the refresh icon on the extension card
2. Clear extension storage:
   - Use the debug page "Clear Storage" button
   - Or right-click extension icon → "Manage extension" → "Clear data"
3. Verify you're logged into Salesloft
4. Check Chrome's download settings aren't blocking

#### Getting HTML files instead of MP3?
- This means authentication failed
- Log out and back into Salesloft
- Clear browser cache for salesloft.com domains

#### Extension not appearing?
1. Make sure Developer mode is enabled
2. Check for errors in `chrome://extensions/`
3. Try reloading the extension

#### High failure rate?
- Reduce concurrent tabs (modify in background.js if needed)
- Check your internet connection
- Some recordings may be genuinely unavailable

### Best Practices

1. **Test First**: Always test with 5-10 recordings before running the full batch
2. **Monitor Initially**: Watch the first 20-30 downloads to ensure they're working
3. **Check File Sizes**: Valid recordings are typically 500KB - 50MB
4. **Batch Processing**: For large sets, consider processing in batches of 100-200
5. **Keep Chrome Active**: Disable sleep/hibernate during large downloads

## Verification

After downloading, verify your files:

```bash
# Check file count
ls -la ~/Downloads/salesloft_recordings/*.mp3 | wc -l

# Check for valid MP3 files (not HTML)
file ~/Downloads/salesloft_recordings/*.mp3 | head -5

# Check file sizes (should vary, not all 3.7KB)
ls -lh ~/Downloads/salesloft_recordings/*.mp3 | head -10
```

## Support

If you encounter issues:

1. Check the extension's background page console:
   - Go to `chrome://extensions/`
   - Click "background page" link under the extension
   - Look for error messages in the console

2. Check the content script console:
   - Open a recording page
   - Press F12 to open DevTools
   - Check the Console tab for errors

3. Review the popup console:
   - Right-click the extension icon
   - Select "Inspect popup"
   - Check the Console tab

## Privacy & Security

- The extension only accesses recordings.salesloft.com
- No data is sent to external servers
- All processing happens locally in your browser
- Uses your existing Salesloft session for authentication

## Uninstallation

1. Go to `chrome://extensions/`
2. Find "Salesloft Recording Downloader"
3. Click "Remove"
4. Confirm removal

---

**Version**: 1.9.0  
**Last Updated**: September 2025  
**Developed by**: RevPal