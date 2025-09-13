# New Features in Version 1.2

## 🎉 What's New

### 1. Import from Salesloft Calls Page
You can now import recording URLs directly from the Salesloft Calls page with your applied filters!

### 2. Fixed Progress Tracking
The status tab now correctly shows:
- Total recordings to download
- Successfully downloaded count
- Failed downloads
- Current recording being processed

### 3. Automatic Recording Extraction
When you visit the Calls page, a floating button appears to extract all visible recordings.

## 📥 How to Import from Calls Page

### Method 1: Using the Extension Popup
1. Click the extension icon
2. Click **"🔄 Import from Calls Page"**
3. The Calls page will open
4. Apply your filters (date range, user, disposition, etc.)
5. Click the floating **"📥 Extract Recordings"** button
6. URLs will automatically populate in the extension

### Method 2: Direct from Calls Page
1. Navigate to https://app.salesloft.com/app/calls
2. Apply your desired filters
3. Look for the floating **"📥 Extract Recordings"** button (bottom-right)
4. Click it to extract all visible recordings
5. Open the extension popup - URLs will be loaded

## 🔍 Filtering Recordings

The extension respects whatever filters you apply on the Calls page:
- **Date Range**: Last 7 days, Last 30 days, Custom range
- **Users**: Specific team members
- **Disposition**: Answered, No Answer, Voicemail, etc.
- **Duration**: Minimum call length
- **Has Recording**: Only calls with recordings

## 📊 Improved Progress Tracking

The Status tab now shows:
- **Progress Bar**: Visual representation of completion
- **Total**: Total number of recordings in queue
- **Downloaded**: Successfully downloaded files
- **Failed**: Downloads that failed
- **Remaining**: Recordings still to process
- **Current URL**: The recording currently being processed

## 💡 Tips for Best Results

### Bulk Extraction
1. Start with a smaller date range to test
2. The scraper will automatically scroll to load more results
3. Maximum of ~20 scroll attempts to prevent infinite scrolling

### Performance
- Downloads process sequentially (one at a time)
- 7-second delay between downloads to avoid rate limiting
- Expect ~8-10 recordings per minute
- 540 recordings will take approximately 1-1.5 hours

### Troubleshooting Import
If the import button doesn't work:
1. Make sure you're logged into Salesloft
2. Reload the extension (chrome://extensions/)
3. Check that you're on the Calls page (not a different section)
4. Look for the floating extract button on the page

## 🔧 Technical Improvements

- Simplified background service worker for better stability
- Added scripting permission for reliable media detection
- Improved error handling and retry logic
- Better session management for Manifest V3
- Real-time progress updates

## 🎯 Multi-Page Extraction (v1.3)

### Automatic Page Detection
When you click "Extract Recordings" on the Calls page, the extension will:
1. Detect if there are multiple pages of results
2. Ask if you want to extract from ALL pages
3. Automatically navigate through pages extracting recordings
4. Show progress updates on the button

### Supported Pagination Types
- **Traditional Pagination**: Next/Previous buttons with page numbers
- **Infinite Scroll**: Automatically scrolls to load more results
- **Load More Buttons**: Clicks to load additional results

### Extraction Options
- **Current Page Only**: Extract just the visible recordings
- **All Pages**: Navigate through all pages (up to 100 pages)
- **Smart Detection**: Automatically determines pagination type

### Performance Tips
- Extracting from multiple pages takes 3-5 seconds per page
- 10 pages = ~30-50 seconds
- 50 pages = ~2.5-4 minutes
- The button shows real-time progress

## 🚀 Simplified Workflow (v1.4)

### What Changed (v1.9.0)
- **More Reliable**: Added retry logic for content script communication
- **Better Feedback**: Loading indicators prevent double-clicks
- **Smoother Experience**: Automatic script injection ensures connection
- **Connection Status**: Shows "Connecting to page..." during setup
- **Error Recovery**: Automatically retries up to 3 times if connection fails

### Previous Changes (v1.4)
- **Removed**: "Load 540 URLs" button (no longer needed)
- **Enhanced**: "Import from Calls Page" now triggers extraction automatically
- **Smarter**: Detects if Calls page is already open and switches to it
- **Faster**: Automatic extraction starts immediately when clicking import

### New Workflow
1. Click **"Import from Calls Page"** button
2. Extension automatically:
   - Opens or switches to Calls page
   - Waits for page to load
   - Triggers extraction
   - Imports URLs directly to popup
3. Click **"Start Download"** to begin

## 📝 Version History

- **v1.9.0**: Enhanced reliability with retry logic and loading indicators
- **v1.8.4**: Fixed syntax errors and improved error messages
- **v1.4**: Simplified workflow, removed redundant button
- **v1.3**: Multi-page extraction support
- **v1.2**: Added Calls page import, fixed progress tracking
- **v1.1**: Fixed service worker issues
- **v1.0**: Initial release

---

Need help? Check the console in chrome://extensions/ → Service Worker for detailed logs.