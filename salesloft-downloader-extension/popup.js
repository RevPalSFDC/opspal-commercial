// Popup script for Salesloft Recording Downloader

document.addEventListener('DOMContentLoaded', () => {
  // Tab functionality
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show corresponding content
      tabContents.forEach(content => {
        if (content.id === `${tabName}Tab`) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });
  
  // Load saved URLs if any
  chrome.storage.local.get(['savedUrls'], (result) => {
    if (result.savedUrls) {
      document.getElementById('urlList').value = result.savedUrls;
    }
  });
  
  // Update status on load
  updateStatus();
  
  // Set up periodic status updates
  setInterval(updateStatus, 1000);
});

// Button handlers
document.getElementById('startDownload').addEventListener('click', startDownload);
document.getElementById('pauseDownload').addEventListener('click', pauseDownload);
document.getElementById('resumeDownload').addEventListener('click', resumeDownload);
document.getElementById('clearProgress').addEventListener('click', clearProgress);
document.getElementById('loadFromFile').addEventListener('click', loadFromFile);
document.getElementById('importFromCalls').addEventListener('click', importFromCalls);

// Start download
async function startDownload() {
  const urlText = document.getElementById('urlList').value.trim();
  
  if (!urlText) {
    showMessage('Please enter recording URLs', 'warning');
    return;
  }
  
  const urls = urlText.split('\n')
    .map(url => url.trim())
    .filter(url => url.startsWith('https://recordings.salesloft.com'));
  
  if (urls.length === 0) {
    showMessage('No valid Salesloft recording URLs found', 'warning');
    return;
  }
  
  // Save URLs for later
  chrome.storage.local.set({ savedUrls: urlText });
  
  showMessage(`Starting download of ${urls.length} recordings...`, 'info');
  console.log(`Sending ${urls.length} URLs to background script`);
  
  // Send to background script
  chrome.runtime.sendMessage({
    action: 'startDownload',
    urls: urls
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error:', chrome.runtime.lastError);
      showMessage(`Error: ${chrome.runtime.lastError.message}`, 'warning');
      
      // Try to wake up the service worker
      showMessage('Service worker may be inactive. Retrying...', 'info');
      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: 'startDownload',
          urls: urls
        }, (retryResponse) => {
          if (chrome.runtime.lastError) {
            showMessage('Still failed. Please reload the extension.', 'warning');
          } else if (retryResponse && retryResponse.status === 'started') {
            showMessage('Download process started!', 'success');
            document.querySelector('[data-tab="status"]').click();
          }
        });
      }, 1000);
    } else if (response && response.status === 'started') {
      showMessage('Download process started!', 'success');
      
      // Switch to status tab
      document.querySelector('[data-tab="status"]').click();
    } else {
      showMessage('No response from background script', 'warning');
    }
  });
}

// Pause download
function pauseDownload() {
  chrome.runtime.sendMessage({ action: 'pause' }, (response) => {
    if (response.status === 'paused') {
      showMessage('Download paused', 'info');
      updateStatus();
    }
  });
}

// Resume download
function resumeDownload() {
  chrome.runtime.sendMessage({ action: 'resume' }, (response) => {
    if (response.status === 'resumed') {
      showMessage('Download resumed', 'success');
      updateStatus();
    }
  });
}

// Clear progress
async function clearProgress() {
  if (confirm('This will clear all download progress. Are you sure?')) {
    await chrome.storage.local.remove(['processedUrls', 'downloadedCount']);
    showMessage('Progress cleared', 'info');
    updateStatus();
  }
}


// Import from Salesloft Calls page
async function importFromCalls() {
  // Disable button to prevent double-clicks
  const importBtn = document.getElementById('importFromCalls');
  const originalText = importBtn.textContent;
  importBtn.disabled = true;
  importBtn.textContent = '⏳ Loading...';
  
  showMessage('Checking for Calls page...', 'info');
  
  // First check if we have recently imported URLs
  chrome.storage.local.get(['importedUrls', 'importTime'], (result) => {
    if (result.importedUrls && result.importTime) {
      const minutesAgo = Math.floor((Date.now() - result.importTime) / 60000);
      
      if (minutesAgo < 5) {
        // Recent import available
        document.getElementById('urlList').value = result.importedUrls.join('\n');
        showMessage(`Loaded ${result.importedUrls.length} URLs from recent import (${minutesAgo} min ago)`, 'success');
        // Re-enable button
        importBtn.disabled = false;
        importBtn.textContent = originalText;
        return;
      }
    }
    
    // Check if calls page is already open
    chrome.tabs.query({ url: 'https://app.salesloft.com/app/calls*' }, (tabs) => {
      if (tabs.length > 0) {
        // Calls page already open, switch to it
        chrome.tabs.update(tabs[0].id, { active: true }, async () => {
          showMessage('Preparing to extract...', 'info');
          
          // Inject content script if not already loaded
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              files: ['calls-scraper.js']
            });
            console.log('Content script injected');
            // Wait a moment for script to initialize
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (e) {
            console.log('Content script already loaded or injection failed:', e);
          }
          
          // Try to get pagination info with retry
          const sendMessageWithRetry = (tabId, message, callback, retries = 2) => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
              if (chrome.runtime.lastError && retries > 0) {
                console.log('Retrying message, attempts left:', retries);
                showMessage('Connecting to page... please wait', 'info');
                setTimeout(() => {
                  // Try injecting script again
                  chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['calls-scraper.js']
                  }).then(() => {
                    setTimeout(() => {
                      sendMessageWithRetry(tabId, message, callback, retries - 1);
                    }, 1000);
                  }).catch(() => {
                    sendMessageWithRetry(tabId, message, callback, retries - 1);
                  });
                }, 1000);
              } else {
                callback(response);
              }
            });
          };
          
          // Show connection status
          showMessage('Connecting to Calls page...', 'info');
          
          // First get pagination info
          sendMessageWithRetry(tabs[0].id, { 
            action: 'getPaginationInfo' 
          }, (paginationResponse) => {
            try {
              let extractAll = false;
              
              // Always show the prompt, even if pagination isn't detected
              let info = { totalPages: 1, totalRecords: 0 };
              
              if (!chrome.runtime.lastError && paginationResponse && paginationResponse.paginationInfo) {
                info = paginationResponse.paginationInfo;
                console.log('Pagination info received:', info);
              }
            
            // Show prompt if there are multiple pages OR if we detect there might be more records
            // Also show if user holds Shift key when clicking (force prompt)
            if (info.totalPages > 1 || info.totalRecords > 50 || true) { // Always show for now
              // Custom prompt with page limit option
              const totalEstimate = info.totalRecords > 0 
                ? `${info.totalRecords} total calls (~${Math.ceil(info.totalRecords / 50)} pages)` 
                : 'Could not detect total count';
              const message = `Calls Page Extraction\n${totalEstimate}\n\n` +
                `How many pages would you like to extract?\n\n` +
                `• Enter a number (e.g., "5" for first 5 pages)\n` +
                `• Enter "all" to extract all available pages\n` +
                `• Enter "1" or click Cancel for current page only\n\n` +
                `Note: Each page typically has 50 calls`;
              
              const defaultValue = info.totalRecords > 500 ? "10" : info.totalRecords > 0 ? "all" : "5";
              const userInput = prompt(message, defaultValue);
              
              if (userInput === null) {
                // User clicked cancel - current page only
                extractAll = false;
              } else if (userInput.toLowerCase() === 'all') {
                extractAll = true;
              } else {
                const pageLimit = parseInt(userInput);
                if (pageLimit && pageLimit > 0) {
                  extractAll = pageLimit;
                } else {
                  extractAll = false;
                }
              }
            }
            
            const extractMessage = typeof extractAll === 'number' 
              ? `Extracting from first ${extractAll} pages...` 
              : extractAll 
                ? 'Extracting from all pages...' 
                : 'Extracting from current page...';
            showMessage(extractMessage, 'info');
            
            // Now extract recordings
            if (!tabs || !tabs[0]) {
              showMessage('Error: Could not find Calls page tab', 'warning');
              return;
            }
            
            chrome.tabs.sendMessage(tabs[0].id, { 
              action: 'extractRecordings',
              extractAll: extractAll
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Error:', chrome.runtime.lastError);
                const errorMsg = chrome.runtime.lastError.message || 'Could not connect to Calls page';
                showMessage(`Error: ${errorMsg}. Please reload the Calls page and try again.`, 'warning');
              } else if (response && response.status === 'success') {
                const urls = response.urls;
                document.getElementById('urlList').value = urls.join('\n');
                const pageInfo = response.pagesExtracted > 1 ? ` from ${response.pagesExtracted} pages` : '';
                showMessage(`Extracted ${urls.length} recording URLs${pageInfo}!`, 'success');
                
                // Save for future use
                chrome.storage.local.set({ 
                  importedUrls: urls,
                  importTime: Date.now()
                });
              } else {
                showMessage('No recordings found on the page', 'warning');
              }
              // Re-enable button
              importBtn.disabled = false;
              importBtn.textContent = originalText;
            });
            } catch (error) {
              console.error('Error in pagination handler:', error);
              const errorMsg = error.message || String(error) || 'Unknown error occurred';
              showMessage('Error: ' + errorMsg, 'warning');
              // Re-enable button
              importBtn.disabled = false;
              importBtn.textContent = originalText;
            }
          });
        });
      } else {
        // Open the calls page
        chrome.tabs.create({
          url: 'https://app.salesloft.com/app/calls',
          active: true
        }, (tab) => {
          showMessage('Calls page opened. Waiting for it to load...', 'info');
          
          // Wait for page to load then trigger extraction
          setTimeout(async () => {
            // Inject content script to ensure it's loaded
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['calls-scraper.js']
              });
              console.log('Content script injected for new tab');
              // Wait for script to initialize
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (e) {
              console.log('Content script injection:', e);
            }
            
            // Retry logic for new tab
            const sendMessageWithRetry = (tabId, message, callback, retries = 3) => {
              chrome.tabs.sendMessage(tabId, message, (response) => {
                if (chrome.runtime.lastError && retries > 0) {
                  console.log('Retrying message for new tab, attempts left:', retries);
                  showMessage('Loading Calls page... please wait', 'info');
                  setTimeout(() => {
                    // Try injecting script again
                    chrome.scripting.executeScript({
                      target: { tabId: tabId },
                      files: ['calls-scraper.js']
                    }).then(() => {
                      setTimeout(() => {
                        sendMessageWithRetry(tabId, message, callback, retries - 1);
                      }, 1500);
                    }).catch(() => {
                      sendMessageWithRetry(tabId, message, callback, retries - 1);
                    });
                  }, 1500);
                } else {
                  callback(response);
                }
              });
            };
            
            // First get pagination info
            sendMessageWithRetry(tab.id, { 
              action: 'getPaginationInfo' 
            }, (paginationResponse) => {
              if (chrome.runtime.lastError) {
                showMessage('Page still loading. Please wait a moment and try again.', 'info');
                return;
              }
              
              let extractAll = false;
              let info = { totalPages: 1, totalRecords: 0 };
              
              if (paginationResponse && paginationResponse.paginationInfo) {
                info = paginationResponse.paginationInfo;
                console.log('Pagination info received:', info);
              }
              
              // Always show prompt for page selection
              if (true) {
                // Custom prompt with page limit option
                const totalEstimate = info.totalRecords > 0 
                  ? `${info.totalRecords} total calls (~${Math.ceil(info.totalRecords / 50)} pages)` 
                  : 'Could not detect total count';
                const message = `Calls Page Extraction\n${totalEstimate}\n\n` +
                  `How many pages would you like to extract?\n\n` +
                  `• Enter a number (e.g., "5" for first 5 pages)\n` +
                  `• Enter "all" to extract all available pages\n` +
                  `• Enter "1" or click Cancel for current page only\n\n` +
                  `Note: Each page typically has 50 calls`;
                
                const defaultValue = info.totalRecords > 500 ? "10" : info.totalRecords > 0 ? "all" : "5";
                const userInput = prompt(message, defaultValue);
                  
                  if (userInput === null) {
                    // User clicked cancel - current page only
                    extractAll = false;
                  } else if (userInput.toLowerCase() === 'all') {
                    extractAll = true;
                  } else {
                    const pageLimit = parseInt(userInput);
                    if (pageLimit && pageLimit > 0) {
                      extractAll = pageLimit;
                    } else {
                      extractAll = false;
                    }
                  }
              }
              
              const extractMessage = typeof extractAll === 'number' 
              ? `Extracting from first ${extractAll} pages...` 
              : extractAll 
                ? 'Extracting from all pages...' 
                : 'Extracting from current page...';
            showMessage(extractMessage, 'info');
              
              // Now extract recordings with retry
              sendMessageWithRetry(tab.id, { 
                action: 'extractRecordings',
                extractAll: extractAll
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error('Error:', chrome.runtime.lastError);
                  const errorMsg = chrome.runtime.lastError.message || 'Could not connect to page';
                  showMessage(`${errorMsg}. Click the "Extract Recordings" button on the page.`, 'info');
                } else if (response && response.status === 'success') {
                  const urls = response.urls;
                  document.getElementById('urlList').value = urls.join('\n');
                  const pageInfo = response.pagesExtracted > 1 ? ` from ${response.pagesExtracted} pages` : '';
                  showMessage(`Extracted ${urls.length} recording URLs${pageInfo}!`, 'success');
                  
                  // Save for future use
                  chrome.storage.local.set({ 
                    importedUrls: urls,
                    importTime: Date.now()
                  });
                }
                // Re-enable button
                importBtn.disabled = false;
                importBtn.textContent = originalText;
              });
            });
          }, 4000); // Wait 4 seconds for page to load
          
          // Also listen for imported URLs from button click
          const listener = (changes, area) => {
            if (area === 'local' && changes.importedUrls) {
              const urls = changes.importedUrls.newValue;
              if (urls && urls.length > 0) {
                document.getElementById('urlList').value = urls.join('\n');
                showMessage(`Imported ${urls.length} recording URLs!`, 'success');
                chrome.storage.onChanged.removeListener(listener);
                // Re-enable button
                importBtn.disabled = false;
                importBtn.textContent = originalText;
              }
            }
          };
          
          chrome.storage.onChanged.addListener(listener);
          
          // Remove listener after 60 seconds
          setTimeout(() => {
            chrome.storage.onChanged.removeListener(listener);
          }, 60000);
        });
      }
    });
  });
}

// Load URLs from file
function loadFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.csv';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      
      // Extract URLs from text
      const urls = text.match(/https:\/\/recordings\.salesloft\.com\/[^\s,]+/g);
      
      if (urls && urls.length > 0) {
        document.getElementById('urlList').value = urls.join('\n');
        showMessage(`Loaded ${urls.length} URLs from file`, 'success');
      } else {
        showMessage('No valid URLs found in file', 'warning');
      }
    };
    
    reader.readAsText(file);
  };
  
  input.click();
}

// Update status display
function updateStatus() {
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (!response) return;
    
    // Update counts
    document.getElementById('totalCount').textContent = response.total || 0;
    document.getElementById('downloadedCount').textContent = response.downloaded || 0;
    document.getElementById('failedCount').textContent = response.failed || 0;
    document.getElementById('remainingCount').textContent = 
      (response.total || 0) - (response.processed || 0);
    
    // Update progress bar
    const progress = response.total > 0 
      ? (response.downloaded / response.total * 100).toFixed(1)
      : 0;
    document.getElementById('progressBar').style.width = `${progress}%`;
    
    // Update current URL
    if (response.currentUrl) {
      document.getElementById('currentUrl').style.display = 'block';
      document.getElementById('currentUrlText').textContent = response.currentUrl;
    } else {
      document.getElementById('currentUrl').style.display = 'none';
    }
    
    // Update button states
    document.getElementById('pauseDownload').disabled = !response.isProcessing;
    document.getElementById('resumeDownload').disabled = response.isProcessing;
  });
}

// Show message
function showMessage(text, type = 'info') {
  const messageEl = document.getElementById('statusMessage');
  
  messageEl.textContent = text;
  messageEl.className = `alert alert-${type} show`;
  
  setTimeout(() => {
    messageEl.classList.remove('show');
  }, 5000);
}

// Listen for completion message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadComplete') {
    showMessage(
      `Download complete! ${request.stats.downloaded} files downloaded, ${request.stats.failed} failed.`,
      request.stats.failed > 0 ? 'warning' : 'success'
    );
    updateStatus();
  }
});