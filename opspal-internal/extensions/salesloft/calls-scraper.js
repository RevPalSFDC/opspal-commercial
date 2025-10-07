// Content script for extracting call recordings from Salesloft Calls page
console.log('Salesloft Calls Scraper loaded');

// Function to extract recording URLs from the current page
function extractRecordingUrls() {
  console.log('Extracting recording URLs from calls page...');
  
  const recordings = new Set();
  
  // Method 1: Look for recording links in the DOM
  const recordingLinks = document.querySelectorAll('a[href*="recordings.salesloft.com"]');
  recordingLinks.forEach(link => {
    const url = link.href;
    if (url.includes('/c/')) {
      recordings.add(url);
      console.log('Found recording link:', url);
    }
  });
  
  // Method 2: Look for call rows with various selectors
  const callRowSelectors = [
    '[data-test*="call-row"]',
    '[class*="call-row"]',
    'tr[class*="call"]',
    '[role="row"]',
    '[class*="CallRow"]',
    '[class*="call-list-item"]',
    'tbody tr',
    '[data-testid*="call"]'
  ];
  
  const callRows = document.querySelectorAll(callRowSelectors.join(', '));
  console.log(`Found ${callRows.length} potential call rows`);
  
  callRows.forEach(row => {
    // Look for recording indicators with multiple selectors
    const recordingIndicators = [
      '[class*="recording"]',
      '[data-test*="recording"]',
      '[aria-label*="recording"]',
      '[title*="recording"]',
      'svg[class*="recording"]',
      '[class*="audio"]',
      '[class*="media"]',
      'button[aria-label*="play"]',
      '[data-testid*="recording"]'
    ];
    
    const hasRecording = row.querySelector(recordingIndicators.join(', '));
    
    if (hasRecording) {
      // Try to find associated link
      const link = row.querySelector('a[href*="recordings.salesloft.com"]');
      if (link) {
        recordings.add(link.href);
      } else {
        // Try to extract call ID and construct URL
        const callIdElement = row.querySelector('[data-call-id], [data-id], [id*="call"]');
        if (callIdElement) {
          const callId = callIdElement.getAttribute('data-call-id') || 
                        callIdElement.getAttribute('data-id') || 
                        callIdElement.id;
          console.log('Found call ID:', callId);
          // You might need to make an API call here to get the recording URL
        }
      }
    }
  });
  
  // Method 3: Look for any recording URLs in onclick handlers or data attributes
  const allElements = document.querySelectorAll('*[onclick*="recordings.salesloft"], *[data-url*="recordings.salesloft"]');
  allElements.forEach(el => {
    const onclick = el.getAttribute('onclick') || '';
    const dataUrl = el.getAttribute('data-url') || '';
    const combined = onclick + dataUrl;
    
    const urlMatch = combined.match(/https:\/\/recordings\.salesloft\.com\/c\/\d+\/[a-f0-9-]+/g);
    if (urlMatch) {
      urlMatch.forEach(url => recordings.add(url));
    }
  });
  
  console.log(`Extracted ${recordings.size} unique recording URLs from current page`);
  return Array.from(recordings);
}

// Intercept fetch requests to capture API data
function interceptApiCalls() {
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    
    return originalFetch.apply(this, args).then(async response => {
      // Clone the response to read it
      const clone = response.clone();
      
      // Check if this is a calls API endpoint
      if (url.includes('/api/') && (url.includes('calls') || url.includes('recordings'))) {
        try {
          const data = await clone.json();
          console.log('API Response intercepted:', url);
          
          // Extract recording URLs from API response
          const urls = extractUrlsFromApiData(data);
          if (urls.length > 0) {
            console.log(`Found ${urls.length} recordings in API response`);
            
            // Send to background script
            chrome.runtime.sendMessage({
              action: 'recordingsFound',
              urls: urls,
              source: 'api'
            });
          }
        } catch (e) {
          // Not JSON or error parsing
        }
      }
      
      return response;
    });
  };
}

// Extract recording URLs from API response data
function extractUrlsFromApiData(data) {
  const urls = [];
  
  // Recursive function to find URLs in nested objects
  function findUrls(obj) {
    if (!obj) return;
    
    if (typeof obj === 'string' && obj.includes('recordings.salesloft.com')) {
      urls.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach(item => findUrls(item));
    } else if (typeof obj === 'object') {
      Object.values(obj).forEach(value => findUrls(value));
      
      // Check specific fields that might contain recordings
      if (obj.recording_url) urls.push(obj.recording_url);
      if (obj.recording) findUrls(obj.recording);
      if (obj.call_recording) findUrls(obj.call_recording);
      if (obj.media_url) urls.push(obj.media_url);
      if (obj.recordings) findUrls(obj.recordings);
    }
  }
  
  findUrls(data);
  
  // Filter and clean URLs
  return urls
    .filter(url => url.includes('/c/') && url.includes('recordings.salesloft.com'))
    .map(url => {
      // Clean up URL if needed
      if (url.startsWith('http')) return url;
      if (url.startsWith('//')) return 'https:' + url;
      if (url.startsWith('/')) return 'https://recordings.salesloft.com' + url;
      return url;
    });
}

// Function to get all visible calls with recordings
async function getAllCallsWithRecordings() {
  console.log('Scanning for calls with recordings...');
  
  // Wait for page to load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Try to scroll to load more results
  const scrollContainer = document.querySelector('[class*="scroll"], [class*="list"], main');
  if (scrollContainer) {
    console.log('Scrolling to load more calls...');
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    await new Promise(resolve => setTimeout(resolve, 1000));
    scrollContainer.scrollTop = 0;
  }
  
  // Extract URLs
  const urls = extractRecordingUrls();
  
  console.log(`Found ${urls.length} recording URLs`);
  return urls;
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractRecordings') {
    console.log('Extract recordings message received from extension');
    
    // Check if there are multiple pages
    const paginationInfo = getPaginationInfo();
    const hasMultiplePages = paginationInfo && paginationInfo.totalPages > 1;
    
    console.log(`Pagination info: ${JSON.stringify(paginationInfo)}`);
    
    // Decide whether to extract all pages or just current
    const extractAll = request.extractAll !== undefined ? request.extractAll : hasMultiplePages;
    
    console.log('Extract all value:', extractAll, 'Type:', typeof extractAll);
    
    // Handle different extraction modes
    if (extractAll === false) {
      // Current page only
      console.log('Extracting from current page only...');
      scrollThroughAllPages().then(urls => {
        console.log(`Sending ${urls.length} URLs from current page to extension`);
        sendResponse({ 
          status: 'success', 
          urls: urls,
          pageUrl: window.location.href,
          filters: getActiveFilters(),
          pagesExtracted: 1
        });
      }).catch(error => {
        console.error('Error extracting recordings:', error);
        sendResponse({ status: 'error', error: error.message });
      });
    } else if (extractAll === true || typeof extractAll === 'number') {
      // Multiple pages
      const pageLimit = typeof extractAll === 'number' ? extractAll : null;
      console.log(pageLimit ? `Extracting from first ${pageLimit} pages...` : 'Extracting from all pages...');
      extractFromAllPages(pageLimit).then(urls => {
        console.log(`Sending ${urls.length} URLs from multiple pages to extension`);
        sendResponse({ 
          status: 'success', 
          urls: urls,
          pageUrl: window.location.href,
          filters: getActiveFilters(),
          pagesExtracted: pageLimit || paginationInfo.totalPages || 'multiple'
        });
      }).catch(error => {
        console.error('Error extracting recordings:', error);
        sendResponse({ status: 'error', error: error.message });
      });
    } else {
      // Default: try scrolling on current page
      console.log('Default: Extracting from current page with scrolling...');
      scrollThroughAllPages().then(urls => {
        console.log(`Sending ${urls.length} URLs from current page to extension`);
        sendResponse({ 
          status: 'success', 
          urls: urls,
          pageUrl: window.location.href,
          filters: getActiveFilters(),
          pagesExtracted: 1
        });
      }).catch(error => {
        console.error('Error extracting recordings:', error);
        sendResponse({ status: 'error', error: error.message });
      });
    }
    
    return true; // Keep message channel open for async response
  } else if (request.action === 'getPaginationInfo') {
    // Return pagination information
    const info = getPaginationInfo();
    sendResponse({ 
      status: 'success', 
      paginationInfo: info 
    });
    return true;
  }
});

// Get active filters from the page
function getActiveFilters() {
  const filters = {};
  
  // Look for filter badges or active filters
  const filterElements = document.querySelectorAll('[class*="filter"], [class*="badge"], [aria-label*="filter"]');
  filterElements.forEach(el => {
    const text = el.textContent.trim();
    if (text) {
      filters[text.split(':')[0]] = text;
    }
  });
  
  // Check URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.forEach((value, key) => {
    filters[key] = value;
  });
  
  return filters;
}

// Navigate through all pages to get all recordings
async function extractFromAllPages(pageLimit = null) {
  const allUrls = new Set();
  let currentPage = 1;
  let totalPages = 1;
  let hasNextPage = true;
  
  // Update button to show progress
  const button = document.getElementById('salesloft-extract-btn');
  const originalText = button ? button.textContent : '';
  
  // Use page limit if specified, otherwise safety limit of 100
  const maxPages = pageLimit || 100;
  
  while (hasNextPage && currentPage <= maxPages) {
    console.log(`=== Extracting from page ${currentPage} of max ${maxPages} ===`);
    
    if (button) {
      button.textContent = `📥 Extracting page ${currentPage}...`;
    }
    
    // Extract URLs from current page
    const urls = extractRecordingUrls();
    const beforeCount = allUrls.size;
    urls.forEach(url => allUrls.add(url));
    const newCount = allUrls.size - beforeCount;
    
    // Check for pagination controls
    const paginationInfo = getPaginationInfo();
    totalPages = paginationInfo.totalPages || totalPages;
    
    console.log(`Page ${currentPage}/${totalPages || '?'}, found ${urls.length} recordings on this page (${newCount} new, total: ${allUrls.size})`);
    
    // Check if we've reached the page limit
    if (pageLimit && currentPage >= pageLimit) {
      console.log(`Reached page limit of ${pageLimit}`);
      break;
    }
    
    // Try to go to next page
    console.log('Attempting to navigate to next page...');
    hasNextPage = await goToNextPage();
    
    if (!hasNextPage) {
      console.log('No next page found or navigation failed');
      break;
    }
    
    console.log('Successfully navigated to next page, waiting for it to load...');
    currentPage++;
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  if (button) {
    button.textContent = originalText;
  }
  
  const pagesExtracted = currentPage - 1; // Since we increment before checking
  const limitInfo = pageLimit ? ` (limited to ${pageLimit} pages)` : '';
  console.log(`Extraction complete: ${allUrls.size} total recordings from ${pagesExtracted} pages${limitInfo}`);
  return Array.from(allUrls);
}

// Get pagination information from the page
function getPaginationInfo() {
  const info = {
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0
  };
  
  console.log('Getting pagination info...');
  
  // Method 1: Look for pagination text like "1-50 of 234" or "Showing 1 to 50 of 234"
  const selectors = [
    '[class*="pagination"]',
    '[class*="page-info"]',
    '[class*="results"]',
    '[class*="count"]',
    '[class*="total"]',
    'span:contains("of")',
    'div:contains("of")',
    'p:contains("of")'
  ];
  
  let paginationText = null;
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (el.textContent && el.textContent.match(/\d+.*of.*\d+/i)) {
          paginationText = el;
          break;
        }
      }
      if (paginationText) break;
    } catch (e) {
      // Selector might be invalid
    }
  }
  
  if (paginationText) {
    const text = paginationText.textContent;
    console.log('Found pagination text:', text);
    
    // Try different regex patterns
    const patterns = [
      /(\d+)[^\d]+(\d+)[^\d]+of[^\d]+(\d+)/i,  // "1-50 of 234" or "1 - 50 of 234"
      /showing[^\d]*(\d+)[^\d]+to[^\d]+(\d+)[^\d]+of[^\d]+(\d+)/i,  // "Showing 1 to 50 of 234"
      /(\d+)[^\d]+(\d+)[^\d]+(\d+)/  // Generic "1 50 234"
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        const total = parseInt(match[3]);
        
        if (total > 0) {
          info.totalRecords = total;
          const perPage = end - start + 1;
          info.currentPage = Math.ceil(start / perPage);
          info.totalPages = Math.ceil(total / perPage);
          console.log(`Parsed: ${total} total records, ${info.totalPages} pages, ${perPage} per page`);
          break;
        }
      }
    }
  }
  
  // Method 2: Look for page number indicators
  const pageNumbers = document.querySelectorAll('[class*="page-number"], [aria-label*="page"], button[class*="page"]');
  pageNumbers.forEach(el => {
    const num = parseInt(el.textContent);
    if (num && num > info.totalPages) {
      info.totalPages = num;
      console.log(`Found page number button: ${num}`);
    }
  });
  
  // Method 3: Check for Next button (indicates multiple pages)
  const nextButton = document.querySelector('button[aria-label*="next" i], a[aria-label*="next" i], [class*="next"]:not(:disabled)');
  if (nextButton && !nextButton.disabled) {
    // If there's a next button, there are at least 2 pages
    if (info.totalPages === 1) {
      info.totalPages = 2; // At minimum
      console.log('Found Next button, setting minimum 2 pages');
    }
  }
  
  console.log('Final pagination info:', info);
  return info;
}

// Navigate to the next page
async function goToNextPage() {
  // Method 1: Look for "Next" button with various selectors
  const nextSelectors = [
    'button[aria-label*="next" i]',
    'a[aria-label*="next" i]',
    '[class*="next"]:not(:disabled)',
    '[class*="pagination"] button:last-child:not(:disabled)',
    'button:contains("Next"):not(:disabled)',
    'a:contains("Next")'
  ];
  
  let nextButton = null;
  for (const selector of nextSelectors) {
    try {
      nextButton = document.querySelector(selector);
      if (nextButton) break;
    } catch (e) {
      // Invalid selector, skip
    }
  }
  
  // Also check for buttons with text content
  if (!nextButton) {
    const buttons = document.querySelectorAll('button, a');
    for (const btn of buttons) {
      if (btn.textContent.toLowerCase().includes('next') && !btn.disabled) {
        nextButton = btn;
        break;
      }
    }
  }
  
  if (nextButton && !nextButton.disabled && !nextButton.classList.contains('disabled')) {
    console.log('Found next button:', nextButton.textContent || nextButton.ariaLabel);
    nextButton.click();
    return true;
  } else {
    console.log('Next button not found or disabled');
  }
  
  // Method 2: Look for numbered page buttons
  const currentPageEl = document.querySelector('[class*="current-page"], [aria-current="page"], [class*="active"][class*="page"]');
  if (currentPageEl) {
    const currentPageNum = parseInt(currentPageEl.textContent);
    const nextPageButton = document.querySelector(`[aria-label*="page ${currentPageNum + 1}"], button:has-text("${currentPageNum + 1}")`);
    if (nextPageButton) {
      console.log(`Clicking page ${currentPageNum + 1} button`);
      nextPageButton.click();
      return true;
    }
  }
  
  // Method 3: Try infinite scroll
  const scrollContainer = document.querySelector('[class*="scroll"], [class*="list"], main') || document.body;
  const previousHeight = scrollContainer.scrollHeight;
  
  scrollContainer.scrollTop = scrollContainer.scrollHeight;
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  if (scrollContainer.scrollHeight > previousHeight) {
    console.log('Infinite scroll detected, new content loaded');
    return true;
  }
  
  return false;
}

// Scroll through all pages to get all recordings (for infinite scroll)
async function scrollThroughAllPages() {
  const allUrls = new Set();
  let previousHeight = 0;
  let attempts = 0;
  const maxAttempts = 50; // Increased for more pages
  let noNewContentCount = 0;
  
  const scrollContainer = document.querySelector('[class*="scroll"], [class*="list"], main') || document.body;
  
  // Update button to show progress
  const button = document.getElementById('salesloft-extract-btn');
  
  while (attempts < maxAttempts) {
    if (button) {
      button.textContent = `📥 Loading more... (${allUrls.size} found)`;
    }
    
    // Extract URLs from current view
    const urls = extractRecordingUrls();
    const previousSize = allUrls.size;
    urls.forEach(url => allUrls.add(url));
    
    // Check if we found new URLs
    if (allUrls.size === previousSize) {
      noNewContentCount++;
      if (noNewContentCount >= 3) {
        console.log('No new recordings found in last 3 attempts');
        break;
      }
    } else {
      noNewContentCount = 0;
    }
    
    // Scroll to bottom
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    
    // Wait for new content to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if new content loaded
    if (scrollContainer.scrollHeight === previousHeight) {
      console.log('No more content to load');
      break;
    }
    
    previousHeight = scrollContainer.scrollHeight;
    attempts++;
    
    console.log(`Scroll attempt ${attempts}, found ${allUrls.size} recordings so far`);
  }
  
  return Array.from(allUrls);
}

// Add button to the page for easy access
function addExtractButton() {
  // Check if button already exists
  if (document.getElementById('salesloft-extract-btn')) return;
  
  const button = document.createElement('button');
  button.id = 'salesloft-extract-btn';
  button.textContent = '📥 Extract Recordings';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    padding: 10px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    transition: all 0.2s;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 8px rgba(0,0,0,0.2)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
  });
  
  button.addEventListener('click', async () => {
    console.log('Extract button clicked');
    button.disabled = true;
    button.textContent = '⏳ Checking pagination...';
    
    try {
      // Check if there's pagination or infinite scroll
      const paginationInfo = getPaginationInfo();
      const hasMultiplePages = paginationInfo && paginationInfo.totalPages > 1;
      
      let urls = [];
      
      if (hasMultiplePages) {
        // Ask user if they want all pages
        const extractAll = confirm(`Found ${paginationInfo.totalPages || 'multiple'} pages of calls. Extract recordings from ALL pages? This may take a few minutes.`);
        
        if (extractAll) {
          button.textContent = '⏳ Extracting all pages...';
          urls = await extractFromAllPages();
        } else {
          button.textContent = '⏳ Extracting current page...';
          urls = extractRecordingUrls();
        }
      } else {
        // Try scrolling in case of infinite scroll
        button.textContent = '⏳ Extracting recordings...';
        urls = await scrollThroughAllPages();
      }
      
      if (urls && urls.length > 0) {
        console.log(`Sending ${urls.length} URLs to extension`);
        
        // Send to extension
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            action: 'recordingsFound',
            urls: urls,
            source: 'button'
          }, response => {
            if (chrome.runtime.lastError) {
              console.error('Error sending message:', chrome.runtime.lastError);
              button.textContent = `⚠️ Found ${urls.length} - Open extension to import`;
            } else {
              button.textContent = `✅ Found ${urls.length} recordings`;
            }
            setTimeout(() => {
              button.textContent = '📥 Extract Recordings';
              button.disabled = false;
            }, 3000);
          });
        } else {
          // Chrome API not available, just show count
          button.textContent = `✅ Found ${urls.length} recordings`;
          console.log('Recording URLs:', urls);
          setTimeout(() => {
            button.textContent = '📥 Extract Recordings';
            button.disabled = false;
          }, 3000);
        }
      } else {
        button.textContent = '❌ No recordings found';
        setTimeout(() => {
          button.textContent = '📥 Extract Recordings';
          button.disabled = false;
        }, 3000);
      }
    } catch (error) {
      console.error('Error during extraction:', error);
      button.textContent = '❌ Error - Check console';
      setTimeout(() => {
        button.textContent = '📥 Extract Recordings';
        button.disabled = false;
      }, 3000);
    }
  });
  
  document.body.appendChild(button);
}

// Initialize
console.log('Initializing calls scraper...');
interceptApiCalls();

// Add button after page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addExtractButton);
} else {
  setTimeout(addExtractButton, 1000);
}

// Re-add button if page changes (SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(addExtractButton, 1000);
  }
}).observe(document.body, { childList: true, subtree: true });