# Upload and Image Processing Workflow

This document describes how image uploads move through the current application, including the Redis-backed queue on localhost port 6382, temp-file storage, image processing, tile generation, and frontend status polling.

---

## 1. Purpose

The upload pipeline is designed to:

- accept image uploads from the Teacher view
- avoid holding large files in request memory for too long
- offload heavy Sharp processing to a queue worker
- generate Deep Zoom tiles for the viewer
- store image metadata for later browsing and download

---

## 2. Main Components

### Frontend

- `public/app.js` handles upload form submission and upload-job polling.
- The UI submits the file and waits for the job result if the upload is queued.

### Upload API

- `server/routes/upload.js` accepts multipart uploads and starts the queue flow.
- It also exposes job status lookups via `GET /upload/jobs/:jobId`.

### Upload middleware

- `server/middleware/upload.js` validates file type and size.
- It now stores uploads in `data/tmp/` using disk storage instead of in-memory buffering.

### Queue service

- `server/services/uploadQueue.js` connects to Redis and BullMQ.
- It enqueues upload jobs and runs the processing worker.

### Image pipeline

- `server/services/imagePipeline.js` reads the file, generates a downloadable JPEG, builds Deep Zoom tiles, and writes the DZI manifest.

### Storage layer

- `server/services/storage.js` persists image metadata into `data/db.json` and resolves paths in `data/tiles/`.

---

## 3. End-to-End Flow

```text
[Teacher uploads image]
          |
          v
[POST /upload multipart request]
          |
          v
[Multer validates type and size]
          |
          v
[File is written to data/tmp/]
          |
          v
[runUploadViaQueue()]
          |
          +-------------------------------+
          | Redis available               | Redis unavailable
          v                               v
[Job added to BullMQ queue]       [Inline fallback processing]
          |
          v
[Worker reads temp file]
          |
          v
[Sharp generates download.jpg + DZI tiles]
          |
          v
[saveImageRecord() writes metadata]
          |
          v
[Temp file deleted]
          |
          v
[Frontend polls /upload/jobs/:jobId]
          |
          v
[UI refreshes library and opens viewer]
```

---

## 4. Detailed Upload Sequence

### Step 1: Browser submits the upload

The Teacher page sends a multipart request to:

- `POST /upload`

The payload includes:

- the image file
- folder name
- image name

### Step 2: Multer validates and writes to temp disk

The middleware checks:

- allowed MIME type: JPEG, PNG, WEBP
- maximum upload size

If valid, the file is saved under:

- `data/tmp/`

This reduces RAM pressure compared with keeping the full upload in memory.

### Step 3: The route starts queued processing

The upload route calls the queue service with:

- temp file path
- original file name
- MIME type
- folder
- image name
- owner metadata

If Redis is available on localhost port 6382, the service creates a BullMQ job and returns:

```json
{
  "status": "queued",
  "jobId": "123",
  "mode": "redis-worker"
}
```

If Redis is not available, the route falls back to inline processing so uploads still succeed.

### Step 4: Worker processes the stored file

The worker performs the heavy image work in the background:

1. open the temp file from disk
2. read metadata using Sharp
3. auto-rotate the image if needed
4. generate `download.jpg`
5. generate Deep Zoom tiles and `image.dzi`
6. normalize the tile folder layout
7. collect the generated zoom levels
8. save the image record into `data/db.json`
9. delete the temp file

### Step 5: Frontend waits for completion

The browser polls:

- `GET /upload/jobs/:jobId`

Possible job states include:

- `waiting`
- `active`
- `completed`
- `failed`

Once completed, the frontend receives the final image payload and refreshes the folder tree.

---

## 5. Image Processing Output

Each uploaded image produces:

- one record in `data/db.json`
- one image folder in `data/tiles/<imageId>/`
- one Deep Zoom manifest: `image.dzi`
- one downloadable JPEG: `download.jpg`
- multiple tile folders such as `0/`, `1/`, `2/`, and so on

Example layout:

```text
data/
  db.json
  tmp/
    1713275000-uuid.jpg
  tiles/
    <imageId>/
      image.dzi
      download.jpg
      0/
        0_0.jpg
      1/
        0_0.jpg
        1_0.jpg
      2/
        ...
```

---

## 6. Runtime Modes

### Redis worker mode

Used when Redis is available.

- upload request returns quickly with status `queued`
- worker handles CPU-heavy Sharp processing
- UI polls until the job is done

### Inline fallback mode

Used when Redis is unavailable.

- the app processes the upload in the request path
- this preserves functionality but uses more request-time CPU and RAM

---

## 7. Why this architecture helps

Compared with the original in-memory upload approach, the new flow:

- reduces request-memory pressure
- prevents many simultaneous uploads from all holding large buffers in Node.js RAM
- allows concurrency control through the worker
- makes the web server more responsive under load
- provides clearer job states for the frontend

---

## 8. Redis and Worker Settings

Current defaults:

- Redis host: `127.0.0.1`
- Redis port: `6382`
- queue name: `image-processing`
- worker concurrency: controlled by `UPLOAD_WORKER_CONCURRENCY`

Optional environment variables:

- `REDIS_HOST`
- `REDIS_PORT`
- `UPLOAD_QUEUE_ENABLED`
- `UPLOAD_WORKER_CONCURRENCY`
- `MAX_UPLOAD_SIZE_MB`

---

## 9. Operational Notes

- Start the app server normally for the UI and API.
- Start the worker when you want dedicated background processing.
- The system will still fall back gracefully if Redis is not reachable.
- Temp files are automatically removed after processing.

---

## 10. Related Files

- `server/middleware/upload.js`
- `server/routes/upload.js`
- `server/services/uploadQueue.js`
- `server/services/imagePipeline.js`
- `server/services/storage.js`
- `public/app.js`
- `server/worker.js`
