// Simplified background service worker for Salesloft Recording Downloader
console.log('Background service worker starting (simplified version)...');

let downloadQueue = [];
let isProcessing = false;
let currentIndex = 0;
let successCount = 0;
let failedCount = 0;
let currentUrl = '';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.action);
  
  if (request.action === 'startDownload') {
    console.log('Starting download with', request.urls.length, 'URLs');
    downloadQueue = request.urls;
    currentIndex = 0;
    isProcessing = true;
    processNextUrl();
    sendResponse({ status: 'started' });
  } else if (request.action === 'getStatus') {
    sendResponse({
      total: downloadQueue.length,
      processed: currentIndex,
      downloaded: successCount,
      failed: failedCount,
      isProcessing: isProcessing,
      currentUrl: isProcessing ? currentUrl : null
    });
  } else if (request.action === 'pause') {
    isProcessing = false;
    sendResponse({ status: 'paused' });
  } else if (request.action === 'resume') {
    isProcessing = true;
    processNextUrl();
    sendResponse({ status: 'resumed' });
  } else if (request.action === 'recordingsFound') {
    // Recordings found from calls page
    console.log(`Received ${request.urls.length} recordings from ${request.source}`);
    
    // Store them for the popup to access
    chrome.storage.local.set({ 
      importedUrls: request.urls,
      importSource: request.source,
      importTime: Date.now()
    }, () => {
      sendResponse({ status: 'stored', count: request.urls.length });
    });
  }
  return true;
});

// Process URLs one by one
async function processNextUrl() {
  if (!isProcessing || currentIndex >= downloadQueue.length) {
    console.log('Download complete or paused');
    isProcessing = false;
    return;
  }
  
  const url = downloadQueue[currentIndex];
  currentUrl = url;
  console.log(`Processing ${currentIndex + 1}/${downloadQueue.length}: ${url}`);
  
  try {
    // Extract UUID from URL
    const match = url.match(/\/([a-f0-9-]+)$/);
    const uuid = match ? match[1] : `recording_${currentIndex}`;
    
    // Open the URL in a new tab
    const tab = await chrome.tabs.create({
      url: url,
      active: false
    });
    
    console.log('Tab created:', tab.id);
    
    // Wait for page to load
    await new Promise(resolve => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      
      // Timeout after 15 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 15000);
    });
    
    console.log('Page loaded, attempting to find media...');
    
    // Try to get media URL from the page
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: findMediaUrl
    });
    
    if (results && results[0] && results[0].result) {
      const mediaUrl = results[0].result;
      console.log('Media URL found:', mediaUrl);
      
      // Download the media file
      chrome.downloads.download({
        url: mediaUrl,
        filename: `salesloft_recordings/recording_${uuid}.mp3`,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download error:', chrome.runtime.lastError);
          failedCount++;
        } else {
          console.log('Download started:', downloadId);
          successCount++;
        }
      });
    } else {
      console.log('No media URL found, trying direct download of page URL');
      
      // Fallback: try to download the page URL directly
      chrome.downloads.download({
        url: url,
        filename: `salesloft_recordings/recording_${uuid}.mp3`,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Direct download error:', chrome.runtime.lastError);
        } else {
          console.log('Direct download started:', downloadId);
        }
      });
    }
    
    // Close the tab after a delay
    setTimeout(() => {
      chrome.tabs.remove(tab.id).catch(e => console.log('Tab already closed'));
    }, 5000);
    
  } catch (error) {
    console.error('Error processing URL:', error);
  }
  
  // Move to next URL
  currentIndex++;
  
  // Process next after delay
  setTimeout(() => processNextUrl(), 7000);
}

// Function to inject into the page to find media URL
function findMediaUrl() {
  // Look for audio/video elements
  const media = document.querySelector('audio, video');
  if (media) {
    const src = media.src || media.currentSrc;
    if (src && !src.includes('blob:')) {
      return src;
    }
  }
  
  // Look for source elements
  const source = document.querySelector('source');
  if (source && source.src && !source.src.includes('blob:')) {
    return source.src;
  }
  
  // Look in network performance entries
  const entries = performance.getEntriesByType('resource');
  for (const entry of entries) {
    if (entry.name.includes('.mp3') || entry.name.includes('audio')) {
      return entry.name;
    }
  }
  
  return null;
}

// Log when installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Salesloft Recording Downloader installed (simplified version)');
});