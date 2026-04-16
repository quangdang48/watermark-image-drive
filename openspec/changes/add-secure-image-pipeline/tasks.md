## 1. Implementation

- [x] 1.1 Add `POST /upload` route with Multer validation for size and MIME type
- [x] 1.2 Add RS-256 JWT guard for upload and tile access paths
- [x] 1.3 Build Sharp processing flow for metadata extraction, resizing, and DZI tile generation
- [x] 1.4 Add HMAC-SHA256 token minting with per-request TTL
- [x] 1.5 Persist tiles under `data/tiles/` and metadata in `data/db.json`
- [x] 1.6 Add secure `GET /tiles/:id/:z/:x_y` streaming endpoint
- [x] 1.7 Integrate OpenSeadragon with the generated DZI manifest
- [x] 1.8 Add end-to-end verification for upload, token rejection, and tile delivery
- [x] 1.9 Keep documentation aligned with the delivered flow
