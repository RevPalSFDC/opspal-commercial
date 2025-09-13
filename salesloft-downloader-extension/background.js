// Background service worker for Salesloft Recording Downloader
console.log('Background service worker starting...');

let downloadQueue = [];
let currentTabId = null;
let isProcessing = false;
let downloadedCount = 0;
let failedDownloads = [];
let processedUrls = new Set();

// Keep service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Just having this listener keeps the service worker from being terminated
    if (isProcessing) {
      console.log('Keep-alive: Still processing downloads');
    }
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.action);
  
  if (request.action === 'startDownload') {
    console.log('Starting download with', request.urls.length, 'URLs');
    startBatchDownload(request.urls);
    sendResponse({ status: 'started' });
  } else if (request.action === 'testSingleDownload') {
    // Test method - directly open a tab with a recording
    console.log('Testing single download');
    chrome.tabs.create({
      url: request.url || 'https://recordings.salesloft.com/c/101314/f43567b7-a6f3-4f86-baf6-fcbbe6060e64',
      active: true
    }).then(tab => {
      console.log('Test tab created:', tab.id);
      sendResponse({ status: 'test_started', tabId: tab.id });
    }).catch(error => {
      console.error('Test tab creation failed:', error);
      sendResponse({ status: 'error', error: error.message });
    });
  } else if (request.action === 'mediaFound') {
    // Content script found media URL
    handleMediaFound(request.mediaUrl, request.pageUrl);
  } else if (request.action === 'getStatus') {
    sendResponse({
      total: downloadQueue.length + processedUrls.size,
      processed: processedUrls.size,
      downloaded: downloadedCount,
      failed: failedDownloads.length,
      isProcessing: isProcessing,
      currentUrl: currentTabId ? getCurrentUrl() : null
    });
  } else if (request.action === 'pause') {
    isProcessing = false;
    sendResponse({ status: 'paused' });
  } else if (request.action === 'resume') {
    if (!isProcessing && downloadQueue.length > 0) {
      isProcessing = true;
      processNextRecording();
    }
    sendResponse({ status: 'resumed' });
  }
  return true;
});

// Start batch download process
async function startBatchDownload(urls) {
  console.log(`Starting batch download of ${urls.length} recordings`);
  console.log('First URL:', urls[0]);
  
  try {
    // Filter out already processed URLs
    const newUrls = urls.filter(url => !processedUrls.has(url));
    downloadQueue = [...newUrls];
    console.log(`Queue size after filtering: ${downloadQueue.length}`);
    
    // Load saved progress if any
    const saved = await chrome.storage.local.get(['processedUrls', 'downloadedCount']);
    if (saved.processedUrls) {
      saved.processedUrls.forEach(url => processedUrls.add(url));
      downloadedCount = saved.downloadedCount || 0;
      console.log(`Loaded ${saved.processedUrls.length} previously processed URLs`);
    }
    
    if (downloadQueue.length === 0) {
      console.log('All recordings already processed');
      return;
    }
    
    console.log('Starting processing...');
    isProcessing = true;
    processNextRecording();
  } catch (error) {
    console.error('Error in startBatchDownload:', error);
  }
}

// Process next recording in queue
async function processNextRecording() {
  if (!isProcessing || downloadQueue.length === 0) {
    console.log('Download complete or paused');
    isProcessing = false;
    
    // Save progress
    await chrome.storage.local.set({
      processedUrls: Array.from(processedUrls),
      downloadedCount: downloadedCount
    });
    
    // Notify completion
    if (downloadQueue.length === 0) {
      chrome.runtime.sendMessage({
        action: 'downloadComplete',
        stats: {
          total: processedUrls.size,
          downloaded: downloadedCount,
          failed: failedDownloads.length
        }
      });
    }
    return;
  }
  
  const url = downloadQueue.shift();
  processedUrls.add(url);
  console.log(`Processing: ${url}`);
  console.log(`Remaining in queue: ${downloadQueue.length}`);
  
  try {
    // Create new tab with recording URL
    console.log('Creating tab for URL:', url);
    const tab = await chrome.tabs.create({
      url: url,
      active: false
    });
    
    console.log('Tab created with ID:', tab.id);
    currentTabId = tab.id;
    
    // Set timeout for this recording (30 seconds max)
    setTimeout(async () => {
      if (currentTabId === tab.id) {
        console.log('Timeout reached, moving to next recording');
        failedDownloads.push({ url, reason: 'timeout' });
        processedUrls.add(url);
        
        try {
          await chrome.tabs.remove(tab.id);
        } catch (e) {
          console.error('Error closing tab:', e);
        }
        
        currentTabId = null;
        
        // Process next after delay
        setTimeout(() => processNextRecording(), 2000);
      }
    }, 30000);
    
  } catch (error) {
    console.error('Error creating tab:', error);
    failedDownloads.push({ url, reason: error.message });
    processedUrls.add(url);
    
    // Continue with next
    setTimeout(() => processNextRecording(), 2000);
  }
}

// Handle media URL found by content script
async function handleMediaFound(mediaUrl, pageUrl) {
  console.log(`Media found: ${mediaUrl}`);
  
  if (!mediaUrl || !currentTabId) {
    return;
  }
  
  try {
    // Extract recording ID from page URL
    const recordingId = pageUrl.split('/').pop().split('?')[0];
    const filename = `recording_${recordingId}.mp3`;
    
    // Download the media file
    const downloadId = await chrome.downloads.download({
      url: mediaUrl,
      filename: `salesloft_recordings/${filename}`,
      saveAs: false,
      conflictAction: 'uniquify'
    });
    
    console.log(`Download started: ${filename} (ID: ${downloadId})`);
    
    // Monitor download progress
    chrome.downloads.onChanged.addListener(function downloadListener(delta) {
      if (delta.id === downloadId) {
        if (delta.state) {
          if (delta.state.current === 'complete') {
            console.log(`Download complete: ${filename}`);
            downloadedCount++;
            chrome.downloads.onChanged.removeListener(downloadListener);
            
            // Mark as processed
            processedUrls.add(pageUrl);
            
            // Close tab and process next
            closeTabAndContinue();
          } else if (delta.state.current === 'interrupted') {
            console.error(`Download failed: ${filename}`);
            failedDownloads.push({ url: pageUrl, reason: 'download_failed' });
            processedUrls.add(pageUrl);
            chrome.downloads.onChanged.removeListener(downloadListener);
            
            // Close tab and process next
            closeTabAndContinue();
          }
        }
      }
    });
    
  } catch (error) {
    console.error('Error downloading:', error);
    failedDownloads.push({ url: pageUrl, reason: error.message });
    processedUrls.add(pageUrl);
    
    // Close tab and continue
    closeTabAndContinue();
  }
}

// Close current tab and process next recording
async function closeTabAndContinue() {
  if (currentTabId) {
    try {
      await chrome.tabs.remove(currentTabId);
    } catch (e) {
      console.error('Error closing tab:', e);
    }
    currentTabId = null;
  }
  
  // Save progress periodically
  if (processedUrls.size % 10 === 0) {
    await chrome.storage.local.set({
      processedUrls: Array.from(processedUrls),
      downloadedCount: downloadedCount
    });
  }
  
  // Add delay to avoid rate limiting
  setTimeout(() => processNextRecording(), 2000);
}

// Get current URL being processed
function getCurrentUrl() {
  if (currentTabId) {
    return downloadQueue[0] || 'Processing...';
  }
  return null;
}

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === currentTabId && changeInfo.status === 'complete') {
    // Tab fully loaded, content script should handle it
    console.log('Tab loaded:', tab.url);
  }
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('Salesloft Recording Downloader installed');
  
  // Clear any old data on install/update
  chrome.storage.local.get(['processedUrls'], (result) => {
    if (result.processedUrls) {
      console.log(`Found ${result.processedUrls.length} previously processed URLs`);
    }
  });
});