# Image Processing Terminology

This document defines key terms and concepts used throughout the codebase when processing images.

---

## Core Concepts

### DZI (Deep Zoom Image)
An XML manifest file that describes the structure of a tiled image. It contains image dimensions, tile size, overlap, format, and URL patterns. OpenSeadragon uses this file to load and display zoomable images.

### Deep Zoom Tiles
Small image files (typically 256x256 pixels) that represent portions of a larger image at various zoom levels. Only visible tiles are loaded on demand, enabling efficient viewing of high-resolution images.

### Tile Pyramid
A hierarchical structure of tiles organized by zoom levels. Each level represents the image at a different resolution, with level 0 being the smallest and the highest level being full resolution.

### Pyramid Levels
Individual resolution tiers in the tile pyramid. Each level is typically half the dimensions of the previous level, created using resampling algorithms.

---

## Libraries and Tools

### Sharp
A high-performance Node.js image processing library used for:
- Reading image metadata (dimensions, format, EXIF)
- Auto-rotation based on EXIF orientation
- Resizing with Lanczos3 resampling
- Applying watermark overlays
- Converting between image formats

### OpenSeadragon
A JavaScript library for viewing deep zoom images in the browser. It:
- Parses DZI manifests
- Requests tiles on demand based on viewport
- Handles panning and zooming interactions
- Manages tile caching and loading

### Multer
Express middleware for handling multipart/form-data requests. Used for:
- Receiving uploaded image files
- Validating file types and sizes
- Storing files in memory or temporary storage

---

## Image Processing Terms

### EXIF (Exchangeable Image File Format)
Metadata embedded in image files containing:
- Camera settings and information
- Orientation/rotation data
- Timestamps and GPS coordinates
- Used for auto-rotating images to correct display orientation

### Auto-Rotate
The process of correcting image orientation based on EXIF metadata. Cameras store rotation information in EXIF, and this step ensures images display correctly.

### Lanczos3
A high-quality resampling algorithm used when generating pyramid levels. It produces sharper results than simpler algorithms like bilinear or bicubic interpolation.

### Watermark Overlay
A semi-transparent text or image layer composited onto the source image. Configurable properties include:
- Text content
- Opacity/transparency
- Position and alignment
- Font size and family
- Color

### Buffer
An in-memory representation of binary data. Uploaded files are initially stored as buffers before processing, avoiding disk I/O until necessary.

### Decode
The process of reading compressed image data (JPEG, PNG) into a raw pixel format that can be manipulated programmatically.

---

## Security Terms

### HMAC-SHA256 (Hash-based Message Authentication Code)
A cryptographic signature used to sign tile access tokens. Ensures:
- Token authenticity (tamper detection)
- Short-lived access with expiration
- Binding to specific image ID and user context

### RS-256 JWT (JSON Web Token)
An asymmetric JWT signature algorithm used for:
- User authentication
- Authorization checks before processing
- Extracting user claims (subject, role)
- Preventing unauthorized uploads

### Tile Token
A signed, time-limited token that grants access to specific tiles. Included in tile requests and verified server-side before streaming files.

### Path Traversal Protection
Security measures that prevent attackers from accessing files outside the intended directory using sequences like `../`. Applied to:
- Tile file paths
- Image IDs
- URL parameters

### Opaque Image ID
A non-sequential, unpredictable identifier assigned to each processed image. Prevents enumeration attacks and does not reveal information about other images.

### Atomic Write
A file writing pattern that prevents data corruption by:
- Writing to a temporary file first
- Renaming/moving to the final location only after complete write
- Ensuring the target file is never in a partially-written state

---

## API and Protocol Terms

### MIME Type (Multipurpose Internet Mail Extensions)
Standard identifiers for file formats (e.g., `image/jpeg`, `image/png`). Used for:
- Validating uploaded file types
- Setting correct Content-Type headers
- Rejecting unsupported formats

### Multipart Request
An HTTP request format that can contain multiple parts, typically used for file uploads. Contains:
- File data (binary)
- Form fields (text)
- Content-Type boundaries

### Manifest URL
The endpoint path to the DZI XML file (e.g., `/tiles/{imageId}/image.dzi`). Provided to OpenSeadragon to initialize the viewer.

### Response Contract
The standardized JSON structure returned after successful image processing:
```json
{
  "status": "ok",
  "imageId": "opaque-image-id",
  "dziUrl": "/tiles/opaque-image-id/image.dzi",
  "expiresIn": 900
}
```

---

## Storage Terms

### db.json
A local JSON file used as a simple database to store:
- Image metadata records
- Watermark settings
- Token information
- Timestamps and ownership claims

### Tile Directory Structure
The organized layout of tile files on disk:
```
data/tiles/{imageId}/
├── image.dzi           # Manifest file
├── 0/                  # Level 0 (smallest)
│   ├── 0_0.jpg
│   └── ...
├── 1/                  # Level 1
│   ├── 0_0.jpg
│   └── ...
└── N/                  # Level N (full resolution)
```

### Tile Naming Convention
Files named as `{col}_{row}.jpg` where:
- `col` = column position (x-axis)
- `row` = row position (y-axis)
- Example: `2_3.jpg` = column 2, row 3

---

## Workflow Terms

### Ingestion
The initial phase of receiving and validating uploaded files before any processing begins.

### Processing Pipeline
The sequence of operations applied to an uploaded image:
1. Validation
2. Metadata extraction
3. Auto-rotation
4. Watermark application
5. Tile generation
6. Manifest creation
7. Storage

### Delivery
The phase where processed tiles are served to the viewer with authentication and authorization checks.

### On-Demand Loading
The pattern where OpenSeadragon requests only the tiles visible in the current viewport, rather than loading all tiles at once.

---

## Processing Pipeline Steps and Technologies

This section details each step of the image processing workflow and the specific technology used.

### Step 1: File Reception

**What happens:** The server receives the uploaded file from the browser as part of a multipart/form-data HTTP request.

**Technology:**
- **Express.js** - HTTP server framework that routes the POST request
- **Multer** - Middleware that parses multipart requests and extracts file data
- **Node.js Buffer** - File content stored in memory as a Buffer object

**Input:** Multipart HTTP request with file, folder name, and image name fields
**Output:** In-memory Buffer containing the raw file bytes

---

### Step 2: Image Input Validation

**What happens:** The uploaded file is validated for type, size, and decodability before any processing begins.

**Technology:**
- **Multer** - File type filtering by MIME type (`image/jpeg`, `image/png`)
- **Multer limits** - File size constraints (max file size configuration)
- **Sharp.metadata()** - Reads image header to verify it's a valid, decodable image
- **Node.js native validation** - MIME type checking against allowed list

**Validation checks:**
- File extension matches content type
- File size within configured limits
- Image can be decoded by Sharp (not corrupted)
- Format is supported (JPEG, PNG)

**Input:** Raw file Buffer
**Output:** Validated Buffer or error response (400 Bad Request)

---

### Step 3: Watermark Configuration Loading

**What happens:** The server reads the current watermark settings from the configuration store.

**Technology:**
- **Node.js fs module** - Reads configuration from local files
- **JSON.parse()** - Parses configuration JSON into JavaScript objects
- **In-memory cache** - Settings may be cached to avoid repeated file reads

**Configuration properties loaded:**
- Watermark text content
- Opacity level (0.0 to 1.0)
- Position (center, corner, custom coordinates)
- Font family and size
- Text color (hex or RGBA)
- Enabled/disabled flag

**Input:** Configuration file path
**Output:** JavaScript object with watermark settings

---

### Step 4: Sharp Image Processing

**What happens:** Sharp decodes the image, applies transformations, and prepares it for tile generation.

**Technology:**
- **Sharp** - Primary image processing library
- **Sharp.metadata()** - Extracts width, height, format, channels, EXIF data
- **Sharp.rotate()** - Auto-rotates based on EXIF orientation tag
- **Sharp.composite()** - Overlays watermark text/image onto the source image
- **Sharp.toBuffer()** - Outputs processed image as in-memory Buffer

**Processing operations:**
1. Decode image from compressed format (JPEG/PNG) to raw pixels
2. Read EXIF orientation metadata
3. Apply rotation correction if needed
4. Generate watermark overlay (text rendering or image composite)
5. Composite watermark with specified opacity and position
6. Keep processed image in memory for next step

**Input:** Validated Buffer + watermark configuration
**Output:** Processed image Buffer (rotated + watermarked)

---

### Step 5: Deep Zoom Tile Generation

**What happens:** The processed image is converted into a pyramid of tiled images at multiple zoom levels.

**Technology:**
- **Sharp.resize()** - Creates each pyramid level with Lanczos3 resampling
- **Sharp.extract()** - Slices individual tiles from each level
- **Sharp.jpeg()** - Encodes tiles as JPEG files with quality settings
- **Math.floor/Math.ceil** - Calculates tile grid dimensions per level

**Tile generation algorithm:**
1. Start with full-resolution processed image
2. Calculate number of levels: `ceil(log2(max(width, height) / tileSize))`
3. For each level (from highest to lowest):
   - Resize image by factor of 2 using Lanczos3 kernel
   - Calculate grid: `cols = ceil(width / 256)`, `rows = ceil(height / 256)`
   - Extract 256x256 tiles for each grid position
   - Encode each tile as JPEG

**Tile specifications:**
- Tile size: 256x256 pixels (standard for Deep Zoom)
- Overlap: 1 pixel (prevents seams between tiles)
- Format: JPEG with configurable quality
- Edge tiles: May be smaller than 256x256 at boundaries

**Input:** Processed image Buffer
**Output:** Array of tile Buffers organized by level and position

---

### Step 6: DZI Manifest Creation

**What happens:** An XML manifest file is generated that describes the tile structure to OpenSeadragon.

**Technology:**
- **Template literals / XML builder** - Constructs DZI XML string
- **Node.js fs module** - Writes manifest to disk

**DZI XML structure:**
```xml
<Image TileSize="256" Overlap="1" Format="jpg"
       xmlns="http://schemas.microsoft.com/deepzoom/2008">
  <Size Width="4000" Height="3000"/>
</Image>
```

**Manifest properties:**
- `TileSize`: 256 (pixels per tile)
- `Overlap`: 1 (pixel overlap between adjacent tiles)
- `Format`: jpg (tile image format)
- `Size Width/Height`: Original image dimensions

**Input:** Image dimensions and tile configuration
**Output:** XML string saved as `image.dzi`

---

### Step 7: Tile Storage on Disk

**What happens:** Tile files and the DZI manifest are written to the filesystem in an organized directory structure.

**Technology:**
- **Node.js fs.mkdir()** - Creates directory hierarchy (`{imageId}/{level}/`)
- **Node.js fs.writeFile()** - Writes tile and manifest files
- **Path normalization** - Sanitizes paths to prevent traversal attacks
- **Atomic write patterns** - Writes to temp file then renames for safety

**Directory structure created:**
```
data/tiles/{imageId}/
├── image.dzi
├── 0/
│   ├── 0_0.jpg
│   └── ...
├── 1/
│   ├── 0_0.jpg
│   └── ...
└── N/
```

**File naming:**
- Tiles: `{col}_{row}.jpg` (e.g., `2_3.jpg`)
- Manifest: `image.dzi`
- Levels: Numeric directories (0 = smallest, N = largest)

**Input:** Tile Buffers + DZI XML + imageId
**Output:** Files written to disk

---

### Step 8: Metadata Persistence

**What happens:** Image record and processing metadata are saved to the local JSON database.

**Technology:**
- **Node.js fs module** - Reads and writes db.json
- **JSON.stringify()** - Serializes metadata object
- **Atomic write** - Writes to temp file, then renames to prevent corruption
- **UUID/Crypto** - Generates opaque image IDs

**Metadata stored:**
- `imageId`: Opaque unique identifier
- `folderName`: Parent folder name
- `imageName`: Display name
- `originalFileName`: Original uploaded file name
- `width`, `height`: Image dimensions in pixels
- `format`: Image format (jpeg, png)
- `fileSize`: Original file size in bytes
- `watermarkSettings`: Configuration used during processing
- `tileLevels`: Number of pyramid levels generated
- `dziUrl`: Path to DZI manifest
- `createdAt`: ISO timestamp of upload
- `updatedAt`: ISO timestamp of last modification
- `owner`: User ID who uploaded (from JWT claims)

**Input:** Processing results and configuration
**Output:** Updated db.json with new image record

---

### Step 9: Response and Frontend Integration

**What happens:** The server returns processing results to the frontend, which initializes the viewer.

**Technology:**
- **Express.js res.json()** - Sends JSON response to client
- **Fetch API / XMLHttpRequest** - Frontend receives response
- **OpenSeadragon** - JavaScript viewer library initialized with DZI URL
- **DOM manipulation** - Updates folder tree and opens viewer

**Response structure:**
```json
{
  "status": "ok",
  "imageId": "opaque-image-id",
  "dziUrl": "/tiles/opaque-image-id/image.dzi",
  "metadata": {
    "width": 4000,
    "height": 3000,
    "format": "jpeg"
  }
}
```

**Frontend actions:**
1. Receive response from upload endpoint
2. Refresh folder tree to show new image
3. Initialize OpenSeadragon viewer with `dziUrl`
4. Viewer fetches DZI manifest
5. Viewer requests tiles on demand based on viewport
6. User can pan and zoom through the image

**Input:** Processing results
**Output:** JSON response to browser, viewer initialized

---
### Frontend DZI Processing Workflow

**What happens:** When the frontend receives a DZI file or URL, it processes the deep zoom image for display using OpenSeadragon.

**Technology:**
- **OpenSeadragon v5.0.1** - Primary library for deep zoom image handling (loaded from CDN)
- **XMLHttpRequest** - OpenSeadragon's internal mechanism for fetching DZI manifest and tiles
- **Canvas/WebGL** - Renders tiles efficiently in the browser
- **Browser cache** - Stores loaded tiles to minimize network requests

**OpenSeadragon Initialization (app.js:233-275):**
```javascript
viewerInstance = OpenSeadragon({
    id: 'viewer',
    prefixUrl: 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/5.0.1/images/',
    tileSources: payload.dziUrl,  // e.g., "/tiles/{imageId}/image.dzi"
    showNavigator: true,
});
```

**DZI Manifest Structure:**
The server rewrites the manifest URL to empty string and normalizes format:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Image xmlns="http://schemas.microsoft.com/deepzoom/2008"
  Format="jpg"
  Overlap="0"
  TileSize="256">
  <Size Height="1142" Width="1170" />
</Image>
```

**Processing workflow:**
1. **DZI Parsing**: OpenSeadragon fetches the XML manifest from `dziUrl` to understand image dimensions, tile size, format, and URL patterns
2. **URL Pattern Construction**: Since `Url=""` in manifest, OpenSeadragon uses the DZI file's own directory as base: `/tiles/{imageId}/{z}/{x}_{y}.jpg`
3. **Viewport Calculation**: Determines which tiles are visible based on current zoom level and pan position
4. **Tile Request Queue**: Prioritizes tile requests based on visibility and proximity to viewport center
5. **On-Demand Loading**: Fetches only required tiles via XMLHttpRequest using the constructed URL pattern
6. **Tile Rendering**: Draws loaded tiles onto canvas at appropriate positions and scales
7. **Level-of-Detail Management**: Switches between pyramid levels as user zooms in/out
8. **Memory Management**: Unloads tiles that are far from the current viewport to conserve memory
9. **Interaction Handling**: Processes user input (mouse/touch) for panning, zooming, and navigation

**Key algorithms:**
- **Frustum Culling**: Only loads tiles that intersect with the visible viewport
- **Progressive Loading**: Shows lower resolution tiles first, then replaces with higher resolution as they load
- **Tile Prioritization**: Uses spiral-out pattern from viewport center to determine loading order
- **Smooth Transitions**: Interpolates between zoom levels for fluid user experience

**Server-Side Tile Serving (tiles.js):**
- DZI manifest route: `GET /tiles/:id/image.dzi` (Cache-Control: private, max-age=60)
- Tile route: `GET /tiles/:id/:z/:tileName` (Cache-Control: private, max-age=60)
- Tiles streamed directly via `fs.createReadStream().pipe(res)`

**Fallback Rendering (app.js:195-231):**
If OpenSeadragon fails to load (2-second timeout), tiles are rendered as plain `<img>` elements at the highest pyramid level:
```javascript
const tile = document.createElement('img');
tile.src = `/tiles/${payload.imageId}/${highestLevel}/${column}_${row}.jpg`;
```

**Input:** DZI URL from server response
**Output:** Interactive deep zoom image viewer in the browser

---
### Why Tile Fetches May Not Be Visible in F12 DevTools

When debugging with browser developer tools (F12), you may not see individual tile requests in the Network tab for several reasons:

1. **XMLHttpRequest vs Fetch API**: OpenSeadragon uses `XMLHttpRequest` internally, not the modern `fetch()` API. If DevTools is filtered to show only "Fetch/XHR", these requests should appear, but may be categorized differently depending on the browser.

2. **Browser Caching**: Both DZI manifest and tiles set `Cache-Control: private, max-age=60`. After the first load, tiles are served from the browser's HTTP cache, showing no network activity. To see requests:
   - Enable "Disable cache" in DevTools Network tab
   - Clear browser cache before testing
   - Use incognito/private browsing mode

3. **Image Element Loading**: OpenSeadragon 5.x may use `<img>` elements for tile loading in certain configurations rather than XMLHttpRequest. These appear as "Img" type requests in DevTools, not XHR/Fetch.

4. **Same-Origin Requests**: Since tiles are served from the same origin (`/tiles/...`), they may be less visible if filtering for cross-origin requests.

5. **Rapid Tile Loading**: Tiles load very quickly and may be grouped or collapsed in DevTools. Try:
   - Zooming to a new level to trigger fresh tile loads
   - Panning to previously unloaded areas
   - Checking the "Img" filter in addition to "XHR"

6. **CDN Caching**: OpenSeadragon itself is loaded from CDN (`cdnjs.cloudflare.com`), which may have its own caching behavior.

**To observe tile loading in DevTools:**
1. Open F12 Developer Tools
2. Go to Network tab
3. Enable "Disable cache" checkbox
4. Clear existing network log
5. Reload the page or navigate to a new image
6. Look for requests matching pattern: `/tiles/{imageId}/{z}/{x}_{y}.jpg`
7. Try filtering by "Img" type in addition to "XHR"
8. Zoom in/out to trigger new tile requests

---

## File Format Terms

### JPEG
A compressed image format using lossy compression. Commonly used for photographs. Supported for upload and tile output.

### PNG
A compressed image format using lossless compression. Supports transparency. Supported for upload.

### XML (Extensible Markup Language)
The format used for DZI manifest files. Contains structured metadata about the tiled image.
