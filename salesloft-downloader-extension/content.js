// Content script for Salesloft Recording Downloader
// Runs on recordings.salesloft.com pages to detect and capture media URLs

console.log('Salesloft Recording Downloader: Content script loaded');

let mediaUrlFound = false;
let checkAttempts = 0;
const MAX_ATTEMPTS = 60; // Try for 30 seconds (60 * 500ms)

// Start monitoring for media
startMediaDetection();

function startMediaDetection() {
  console.log('Starting media detection...');
  
  // Method 1: Check for audio/video elements
  const checkForMediaElements = setInterval(() => {
    checkAttempts++;
    
    // Look for audio or video elements
    const mediaElements = document.querySelectorAll('audio, video');
    
    if (mediaElements.length > 0) {
      console.log(`Found ${mediaElements.length} media element(s)`);
      
      mediaElements.forEach(element => {
        const src = element.src || element.currentSrc;
        
        if (src && !src.includes('blob:') && !mediaUrlFound) {
          console.log('Media URL found:', src);
          mediaUrlFound = true;
          clearInterval(checkForMediaElements);
          
          // Send to background script
          chrome.runtime.sendMessage({
            action: 'mediaFound',
            mediaUrl: src,
            pageUrl: window.location.href
          });
        }
        
        // Also check source elements
        const sources = element.querySelectorAll('source');
        sources.forEach(source => {
          if (source.src && !source.src.includes('blob:') && !mediaUrlFound) {
            console.log('Media URL found in source:', source.src);
            mediaUrlFound = true;
            clearInterval(checkForMediaElements);
            
            chrome.runtime.sendMessage({
              action: 'mediaFound',
              mediaUrl: source.src,
              pageUrl: window.location.href
            });
          }
        });
      });
    }
    
    // Stop checking after max attempts
    if (checkAttempts >= MAX_ATTEMPTS) {
      console.log('Max attempts reached, no direct media URL found');
      clearInterval(checkForMediaElements);
      
      // Try alternative methods
      tryAlternativeMethods();
    }
  }, 500);
  
  // Method 2: Intercept fetch/XHR requests
  interceptNetworkRequests();
  
  // Method 3: Monitor DOM mutations
  observeDOM();
}

// Intercept network requests to catch media URLs
function interceptNetworkRequests() {
  // Override fetch
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    
    // Check if this looks like a media URL
    if (typeof url === 'string' && isMediaUrl(url) && !mediaUrlFound) {
      console.log('Media URL intercepted (fetch):', url);
      mediaUrlFound = true;
      
      chrome.runtime.sendMessage({
        action: 'mediaFound',
        mediaUrl: url,
        pageUrl: window.location.href
      });
    }
    
    return originalFetch.apply(this, args);
  };
  
  // Override XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (isMediaUrl(url) && !mediaUrlFound) {
      console.log('Media URL intercepted (XHR):', url);
      mediaUrlFound = true;
      
      chrome.runtime.sendMessage({
        action: 'mediaFound',
        mediaUrl: url,
        pageUrl: window.location.href
      });
    }
    
    return originalOpen.apply(this, [method, url, ...rest]);
  };
}

// Check if URL looks like a media file
function isMediaUrl(url) {
  if (!url) return false;
  
  const mediaExtensions = ['.mp3', '.mp4', '.wav', '.m4a', '.ogg', '.webm', '.mpeg'];
  const mediaPatterns = [
    '/audio/',
    '/media/',
    '/recording',
    'cloudfront.net',
    'amazonaws.com',
    '.mp3?',
    '.mp4?',
    'audio/mpeg',
    'audio/mp3'
  ];
  
  const lowerUrl = url.toLowerCase();
  
  return mediaExtensions.some(ext => lowerUrl.includes(ext)) ||
         mediaPatterns.some(pattern => lowerUrl.includes(pattern));
}

// Observe DOM for dynamically added media elements
function observeDOM() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Check if it's a media element
          if ((node.tagName === 'AUDIO' || node.tagName === 'VIDEO') && !mediaUrlFound) {
            const src = node.src || node.currentSrc;
            if (src && !src.includes('blob:')) {
              console.log('Media element added to DOM:', src);
              mediaUrlFound = true;
              
              chrome.runtime.sendMessage({
                action: 'mediaFound',
                mediaUrl: src,
                pageUrl: window.location.href
              });
            }
          }
          
          // Also check children
          const mediaChildren = node.querySelectorAll('audio, video');
          mediaChildren.forEach(element => {
            if (!mediaUrlFound) {
              const src = element.src || element.currentSrc;
              if (src && !src.includes('blob:')) {
                console.log('Media element found in added node:', src);
                mediaUrlFound = true;
                
                chrome.runtime.sendMessage({
                  action: 'mediaFound',
                  mediaUrl: src,
                  pageUrl: window.location.href
                });
              }
            }
          });
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Try alternative methods if direct detection fails
function tryAlternativeMethods() {
  console.log('Trying alternative detection methods...');
  
  // Look for iframes
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const iframeMedia = iframeDoc.querySelectorAll('audio, video');
      
      iframeMedia.forEach(element => {
        const src = element.src || element.currentSrc;
        if (src && !src.includes('blob:') && !mediaUrlFound) {
          console.log('Media found in iframe:', src);
          mediaUrlFound = true;
          
          chrome.runtime.sendMessage({
            action: 'mediaFound',
            mediaUrl: src,
            pageUrl: window.location.href
          });
        }
      });
    } catch (e) {
      // Cross-origin iframe, can't access
      console.log('Cannot access iframe content (cross-origin)');
    }
  });
  
  // Look for download links
  const downloadLinks = document.querySelectorAll('a[download], a[href*=".mp3"], a[href*=".mp4"]');
  downloadLinks.forEach(link => {
    if (link.href && isMediaUrl(link.href) && !mediaUrlFound) {
      console.log('Download link found:', link.href);
      mediaUrlFound = true;
      
      chrome.runtime.sendMessage({
        action: 'mediaFound',
        mediaUrl: link.href,
        pageUrl: window.location.href
      });
    }
  });
  
  // Parse page source for media URLs
  const pageSource = document.documentElement.innerHTML;
  const urlPattern = /https?:\/\/[^\s<>"]+\.(mp3|mp4|wav|m4a|ogg|webm)[^\s<>"]*/gi;
  const matches = pageSource.match(urlPattern);
  
  if (matches && matches.length > 0 && !mediaUrlFound) {
    console.log('Media URL found in page source:', matches[0]);
    mediaUrlFound = true;
    
    chrome.runtime.sendMessage({
      action: 'mediaFound',
      mediaUrl: matches[0],
      pageUrl: window.location.href
    });
  }
  
  // If still no media found, look for player-specific patterns
  if (!mediaUrlFound) {
    checkForPlayerPatterns();
  }
}

// Check for specific player patterns
function checkForPlayerPatterns() {
  // Look for common player elements
  const playerSelectors = [
    '.audio-player',
    '.video-player',
    '.media-player',
    '[class*="player"]',
    '[id*="player"]',
    '.plyr',
    '.video-js',
    '.jwplayer'
  ];
  
  playerSelectors.forEach(selector => {
    const players = document.querySelectorAll(selector);
    players.forEach(player => {
      // Check data attributes
      const dataAttributes = player.dataset;
      Object.values(dataAttributes).forEach(value => {
        if (isMediaUrl(value) && !mediaUrlFound) {
          console.log('Media URL found in data attribute:', value);
          mediaUrlFound = true;
          
          chrome.runtime.sendMessage({
            action: 'mediaFound',
            mediaUrl: value,
            pageUrl: window.location.href
          });
        }
      });
    });
  });
  
  // If still nothing found, notify background that we couldn't find media
  if (!mediaUrlFound) {
    console.log('No media URL could be detected');
    
    // Try to trigger play button if exists
    const playButtons = document.querySelectorAll('button[aria-label*="Play"], button[title*="Play"], .play-button, [class*="play"]');
    if (playButtons.length > 0) {
      console.log('Attempting to click play button...');
      playButtons[0].click();
      
      // Give it one more chance after clicking play
      setTimeout(() => {
        const mediaElements = document.querySelectorAll('audio, video');
        mediaElements.forEach(element => {
          const src = element.src || element.currentSrc;
          if (src && !src.includes('blob:') && !mediaUrlFound) {
            console.log('Media URL found after play:', src);
            mediaUrlFound = true;
            
            chrome.runtime.sendMessage({
              action: 'mediaFound',
              mediaUrl: src,
              pageUrl: window.location.href
            });
          }
        });
      }, 2000);
    }
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadSingle') {
    // Trigger download of current page's media
    startMediaDetection();
    sendResponse({ status: 'detecting' });
  }
  return true;
});

// Auto-start detection after page load
window.addEventListener('load', () => {
  console.log('Page fully loaded, starting detection');
  if (!mediaUrlFound) {
    startMediaDetection();
  }
});