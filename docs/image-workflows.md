# Image Workflow Guide

This document explains the current app flow for:

1. Uploading an image
2. Processing the image into Deep Zoom tiles
3. Loading and viewing an image from the folder tree

---

## Role Summary

- Teacher view: can upload images, manage folders, rename images, delete items, and update watermark settings.
- Student view: can only browse folders and open images for viewing.

Paths:

- Teacher: /teacher
- Student: /student

---

## 1. Upload Image Workflow

ASCII diagram:

```text
[Teacher opens /teacher]
          |
          v
[Select folder + image name + file]
          |
          v
[Click Upload image]
          |
          v
[Browser sends POST /upload]
          |
          v
[upload middleware validates file]
          |
          v
[Server loads watermark settings]
          |
          v
[processImageUpload(buffer, watermark)]
          |
          v
[Save metadata in db.json]
          |
          v
[Return imageId + dziUrl + metadata]
          |
          v
[UI refreshes folder tree and opens viewer]
```

### Step-by-step

1. The teacher enters a folder name and image name.
2. The teacher chooses a file from the computer.
3. The browser sends a multipart upload request to the backend.
4. The upload middleware checks file type and request validity.
5. The backend reads the current watermark settings.
6. The backend processes the image and creates Deep Zoom tiles.
7. The image record is saved into the local database.
8. The UI refreshes the library tree so the new image appears under its folder.

---

## 2. Image Processing Workflow

This is the internal backend pipeline after an upload is accepted.

ASCII diagram:

```text
[Incoming image buffer]
          |
          v
[Validate file type and size]
          |
          v
[Sharp reads image metadata]
          |
          v
[Decode image and read EXIF data]
          |
          v
[Auto-rotate based on EXIF orientation]
          |
          v
[Load watermark configuration]
          |
          v
[Apply watermark overlay if enabled]
          |
          v
[Generate pyramid levels with Lanczos3]
          |
          v
[Slice each level into 256x256 tiles]
          |
          v
[Generate DZI manifest XML]
          |
          v
[Normalize tile folders and file names]
          |
          v
[Rewrite manifest URL format]
          |
          v
[Collect zoom levels metadata]
          |
          v
[Store tile files on disk]
          |
          v
[Save metadata in data/db.json]
          |
          v
[Return imageId + dziUrl + metadata]
```

### Detailed Processing Steps

#### Step 1: File Reception and Validation

- The server receives the uploaded file as a buffer from the multipart request
- Multer middleware validates the file type (JPEG, PNG accepted)
- File size limits are enforced before any processing begins
- Invalid files return 400 errors immediately without further processing

#### Step 2: Image Input Validation

- Sharp reads the image buffer to extract metadata (width, height, format, channels)
- EXIF data is parsed to determine orientation and rotation requirements
- The image is validated to ensure it can be decoded successfully
- Corrupted or unreadable images are rejected with appropriate error messages

#### Step 3: Watermark Configuration Loading

- The server loads current watermark settings from the configuration store
- Settings include watermark text, opacity, position, font size, and color
- If watermarking is disabled, this step is skipped and processing continues
- Configuration is validated before application to the image

#### Step 4: Sharp Image Processing

- Sharp decodes the image into a workable format
- Auto-rotation is applied based on EXIF orientation metadata
- If enabled, watermark overlay is composited onto the image
- The processed image is kept in memory for tile generation

#### Step 5: Deep Zoom Tile Generation

- Pyramid levels are generated using Lanczos3 resampling for quality
- Each level is resized by a factor of 2 from the previous level
- The smallest level contains a single tile (typically 1x1 pixel to ~256x256)
- Each pyramid level is sliced into 256x256 pixel tiles
- Tiles are named using the format `{col}_{row}.jpg` within level directories

#### Step 6: DZI Manifest Creation

- A Deep Zoom Image (DZI) XML manifest is generated
- The manifest includes image dimensions, tile size, overlap, and format
- The manifest URL is formatted for use by OpenSeadragon viewer
- The manifest file is saved as `image.dzi` in the tile directory

#### Step 7: Tile Storage on Disk

- Tile files are stored in the directory structure: `data/tiles/{imageId}/{level}/{col}_{row}.jpg`
- The DZI manifest is saved as `data/tiles/{imageId}/image.dzi`
- Directory structure is created if it does not exist
- File names are normalized to prevent path traversal issues

#### Step 8: Metadata Persistence

- Image metadata is saved to `data/db.json` including:
  - Opaque image ID (not sequential)
  - Folder name and image name
  - Original file name
  - Image dimensions (width, height)
  - File format and size
  - Watermark settings used during processing
  - Tile levels and pyramid metadata
  - DZI manifest URL
  - Timestamps for creation and last access
- Atomic write patterns are used to prevent database corruption

#### Step 9: Response and Frontend Integration

- The server returns a response containing:
  - `imageId`: The opaque identifier for the processed image
  - `dziUrl`: The URL to the DZI manifest for OpenSeadragon
  - `metadata`: Image dimensions and processing details
- The frontend uses the `dziUrl` to load the DZI manifest
- OpenSeadragon initializes with the manifest and requests tiles on demand
- The viewer progressively loads tiles as the user pans and zooms

### Stored output

The app saves:

- Image ID (opaque, non-sequential)
- Folder name
- Image name
- Original file name
- Image metadata such as width, height, format, and size
- Watermark settings used for the upload
- Tile levels and pyramid metadata
- Deep Zoom manifest and tile files on disk
- Timestamps for creation and access

### File storage layout

```text
data/
  db.json
  tiles/
    <imageId>/
      image.dzi
      0/
        0_0.jpg
        0_1.jpg
        ...
      1/
        0_0.jpg
        0_1.jpg
        ...
      2/
        ...
      ...
```

---

## 3. Load Image Workflow

This is the view flow used by both teacher and student pages.

ASCII diagram:

```text
[User opens /student or /teacher]
          |
          v
[index.html + app.js load]
          |
          +------------------------------+
          |                              |
          v                              v
[GET /upload/library]           [GET watermark settings]
          |                              |
          v                              v
[Render folder tree]            [Render watermark preview]
          |
          v
[User expands a folder]
          |
          v
[User clicks an image]
          |
          v
[GET /upload/:id]
          |
          v
[Receive metadata + dziUrl]
          |
          v
[OpenSeadragon loads image.dzi]
          |
          v
[Viewer requests visible tile files]
          |
          v
[Server streams /tiles/:id/:z/:x_y]
          |
          v
[Image is shown in the zoom viewer]
```

### Step-by-step

1. The page loads the folder library from the backend.
2. The app builds the folder tree with parent folders and child images.
3. The user selects an image from the tree.
4. The frontend asks the backend for the image metadata.
5. The viewer opens the DZI manifest.
6. OpenSeadragon fetches only the tiles needed for the current zoom and pan.
7. The backend returns those tile files from local storage.

---

## 4. Quick End-to-End Summary

```text
Teacher uploads image
   -> backend validates request
   -> backend processes image
   -> watermark is applied
   -> tiles and metadata are stored
   -> image appears in folder tree
   -> teacher or student selects image
   -> viewer loads DZI and tiles on demand
```

---

## 5. Main Backend Pieces

- Upload route handles create, update, and library APIs.
- Image pipeline service creates Deep Zoom output.
- Storage service persists metadata and settings.
- Tile route serves the manifest and tile images.

This document reflects the current local Node and Express implementation.
