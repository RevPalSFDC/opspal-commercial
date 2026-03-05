# HubSpot CLI File Operations

Complete reference for managing files and assets via HubSpot CLI.

## File Manager Overview

HubSpot File Manager stores:
- Images (PNG, JPG, GIF, SVG, WebP)
- Documents (PDF, DOC, XLS)
- Videos (MP4, MOV)
- Other assets (fonts, icons)

Files are accessible via:
- HubSpot CDN URLs
- Design Manager references
- CMS pages and modules

## Upload Operations

### Upload Single File

```bash
# Upload to root
hs filemanager upload ./image.png

# Upload to specific folder
hs filemanager upload ./logo.png /images/logos/

# Upload with custom name
hs filemanager upload ./local-image.png /images/hero-banner.png
```

### Upload Folder

```bash
# Upload entire folder
hs filemanager upload ./assets/ /site-assets/

# Upload recursively (includes subdirectories)
hs filemanager upload ./assets/ /site-assets/ --recursive

# Upload with overwrite
hs filemanager upload ./assets/ /site-assets/ --recursive --overwrite
```

### Upload Options

```bash
# Force overwrite existing files
hs filemanager upload ./file.png /images/ --overwrite

# Quiet mode (suppress output)
hs filemanager upload ./file.png /images/ --quiet
```

## Fetch Operations

### Fetch Single File

```bash
# Fetch file to local directory
hs filemanager fetch /images/logo.png ./local-logo.png

# Fetch to specific directory
hs filemanager fetch /images/logo.png ./downloads/
```

### Fetch Folder

```bash
# Fetch entire folder
hs filemanager fetch /images/ ./local-images/

# Fetch with overwrite
hs filemanager fetch /images/ ./local-images/ --overwrite
```

## File Organization

### Recommended Folder Structure

```
/
├── images/
│   ├── logos/
│   ├── heroes/
│   ├── team/
│   ├── products/
│   └── blog/
├── documents/
│   ├── whitepapers/
│   ├── case-studies/
│   └── datasheets/
├── videos/
│   ├── demos/
│   └── testimonials/
└── assets/
    ├── icons/
    └── fonts/
```

### Naming Conventions

```bash
# Good: lowercase, hyphens, descriptive
hero-banner-homepage.png
product-screenshot-dashboard.png
team-john-doe.jpg

# Bad: spaces, special characters, generic names
Hero Banner.png
image (1).png
IMG_20231015.jpg
```

## File Privacy Settings

CLI uploads are **public by default**. For private files, use the API:

```javascript
// API upload with privacy settings
const FormData = require('form-data');
const fs = require('fs');

const form = new FormData();
form.append('file', fs.createReadStream('./file.pdf'));
form.append('folderPath', '/private-docs/');
form.append('options', JSON.stringify({
  access: 'PRIVATE',  // or 'PUBLIC_INDEXABLE', 'PUBLIC_NOT_INDEXABLE'
}));

// POST to /files/v3/files
```

### Access Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `PUBLIC_INDEXABLE` | Accessible and searchable | Marketing images |
| `PUBLIC_NOT_INDEXABLE` | Accessible but not searchable | Internal assets |
| `PRIVATE` | Requires authentication | Gated content |

## Bulk Operations

### Upload Multiple Files Script

```bash
#!/bin/bash
# upload-images.sh

IMAGE_DIR="./images-to-upload"
TARGET_PATH="/images/$(date +%Y-%m)"

for file in "$IMAGE_DIR"/*; do
  if [[ -f "$file" ]]; then
    echo "Uploading: $file"
    hs filemanager upload "$file" "$TARGET_PATH/"
  fi
done
```

### Sync Local Folder

```bash
#!/bin/bash
# sync-assets.sh

LOCAL_DIR="./assets"
REMOTE_DIR="/site-assets"

# Upload all local files
hs filemanager upload "$LOCAL_DIR" "$REMOTE_DIR" --recursive --overwrite

echo "Sync complete!"
```

## Image Optimization

### Before Upload

```bash
# Optimize images before upload (using imagemagick)
convert input.png -quality 85 -resize 1920x1080\> optimized.png

# Batch optimize
for file in ./images/*.png; do
  convert "$file" -quality 85 -resize 2000x2000\> "$file"
done

# Then upload
hs filemanager upload ./images/ /images/ --recursive
```

### HubSpot CDN Features

HubSpot automatically provides:
- Responsive image URLs (add `?width=800`)
- WebP conversion (automatic for supported browsers)
- CDN caching

```html
<!-- In HubSpot modules, use responsive images -->
<img src="{{ module.image.src }}?width={{ module.image.width }}"
     srcset="{{ module.image.src }}?width=400 400w,
             {{ module.image.src }}?width=800 800w,
             {{ module.image.src }}?width=1200 1200w"
     alt="{{ module.image.alt }}">
```

## File References in Theme

### In CSS

```css
/* Reference uploaded images */
.hero {
  background-image: url('//cdn2.hubspot.net/hub/PORTAL_ID/file.png');
}

/* Better: Use theme assets */
.hero {
  background-image: url('./images/hero-bg.png');
}
```

### In HubL Templates

```html
<!-- Using module field -->
<img src="{{ module.image.src }}" alt="{{ module.image.alt }}">

<!-- Using theme asset -->
<img src="{{ get_asset_url('./images/logo.png') }}" alt="Logo">

<!-- Using public URL -->
<img src="{{ get_public_template_url('my-theme/images/icon.png') }}" alt="Icon">
```

## Troubleshooting

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `File too large` | Exceeds 150MB limit | Compress file or use external hosting |
| `Invalid file type` | Unsupported extension | Convert to supported format |
| `Folder not found` | Invalid path | Create folder first or check path |
| `Permission denied` | Insufficient access | Check API permissions |

### File Not Showing

1. Check upload completed successfully
2. Verify path is correct
3. Clear browser cache
4. Check file privacy settings
5. Verify CDN propagation (wait 1-2 minutes)

### Large File Handling

For files > 100MB:
1. Consider external hosting (S3, CloudFront)
2. Link to external URL in HubSpot
3. Or use HubSpot's native video hosting for videos

## Integration with CMS Pages

### Using Files in Page Content

When creating pages via API, reference files by URL:

```javascript
// Page widgets with file reference
const pageWidgets = {
  "module_1": {
    "name": "hero",
    "params": {
      "background_image": {
        "src": "https://cdn2.hubspot.net/hub/PORTAL_ID/images/hero.png",
        "alt": "Hero background"
      }
    }
  }
};
```

### File Upload → Page Update Flow

```bash
# 1. Upload image
hs filemanager upload ./new-hero.png /images/heroes/

# 2. Get CDN URL (from HubSpot File Manager or API)
# URL format: https://cdn2.hubspot.net/hub/PORTAL_ID/images/heroes/new-hero.png

# 3. Update page via API with new image URL
# (Use hubspot-cms-page-publisher agent)
```

## Best Practices

### File Management

- [ ] Use descriptive, lowercase filenames
- [ ] Organize files in logical folders
- [ ] Optimize images before upload
- [ ] Set appropriate privacy levels
- [ ] Document custom file locations
- [ ] Clean up unused files periodically

### Performance

- [ ] Compress images (target < 200KB for web)
- [ ] Use appropriate dimensions (don't upload 5000px images)
- [ ] Leverage HubSpot's responsive URL parameters
- [ ] Enable lazy loading for below-fold images

### Security

- [ ] Never upload sensitive documents publicly
- [ ] Use PRIVATE access for gated content
- [ ] Regularly audit public file access
- [ ] Remove deprecated/old files
