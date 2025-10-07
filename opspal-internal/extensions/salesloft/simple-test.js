// Simple test script - inject this into a recording page console to test download

console.log('Testing Salesloft download...');

// Find media elements
const mediaElements = document.querySelectorAll('audio, video, source');
console.log(`Found ${mediaElements.length} media elements`);

mediaElements.forEach((el, index) => {
  const src = el.src || el.currentSrc || el.getAttribute('src');
  if (src) {
    console.log(`Media ${index + 1}: ${src}`);
    
    // Try to download it
    if (!src.includes('blob:')) {
      console.log('Attempting download...');
      
      // Create a download link
      const a = document.createElement('a');
      a.href = src;
      a.download = `recording_${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      console.log('Download triggered');
    }
  }
});

// Also check for any links that might contain media
const links = Array.from(document.querySelectorAll('a')).filter(a => 
  a.href && (a.href.includes('.mp3') || a.href.includes('.mp4') || a.href.includes('audio'))
);

if (links.length > 0) {
  console.log(`Found ${links.length} potential media links:`);
  links.forEach(link => console.log(link.href));
}

// Check network requests in performance entries
const entries = performance.getEntriesByType('resource');
const mediaRequests = entries.filter(e => 
  e.name.includes('.mp3') || 
  e.name.includes('.mp4') || 
  e.name.includes('audio') ||
  e.name.includes('cloudfront')
);

if (mediaRequests.length > 0) {
  console.log(`Found ${mediaRequests.length} media requests in network:`);
  mediaRequests.forEach(req => console.log(req.name));
}