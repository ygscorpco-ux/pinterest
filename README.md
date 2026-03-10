# Pinterest Personal Downloader

![Extension icon](assets/icons/icon128.png)

Personal Chrome/Edge extension for selecting the main image and similar images on a Pinterest pin detail page, then downloading them as `PNG`.

## Features

- Detects the main image and similar images on Pinterest pin detail pages
- Multi-select with card click or badge click
- `Cumulative` and `Visible only` selection modes
- Batch download selected images as `PNG`
- Retry failed downloads only
- Custom filename prefix support

## Installation

### 1. Download the project

Download the repository as a ZIP file or clone it with Git:

```bash
git clone https://github.com/ygscorpco-ux/pinterest.git
```

### 2. Load the extension in the browser

For Chrome or Edge:

1. Open `chrome://extensions` or `edge://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this project folder

## Usage

1. Open a Pinterest pin detail page
2. Click the extension icon
3. Click `Start Selection`
4. Click image cards or badges to add images
5. Click `Download Selected Images`

## Project Structure

- `manifest.json`: extension configuration
- `background.js`: downloads, cache, and background logic
- `content/content.js`: shared runtime and common state
- `content/scan.js`: Pinterest page scan and candidate detection
- `content/selection.js`: selection state and download flow
- `content/ui.js`: panel UI, events, and rendering
- `popup/`: browser action popup UI
- `assets/icons/`: extension icons

## Notes

- The extension works best on Pinterest pin detail pages
- Pinterest DOM changes may require scan logic updates
- Syntax checks can be run with:

```bash
node --check background.js
node --check content/content.js
node --check content/scan.js
node --check content/selection.js
node --check content/ui.js
node --check popup/popup.js
```
