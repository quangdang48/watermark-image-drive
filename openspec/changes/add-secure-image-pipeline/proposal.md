# Change: Add secure image upload and tile delivery pipeline

## Why

The project needs a concrete MVP implementation plan for authenticated image upload, Deep Zoom tile generation, and signed tile delivery so school photos can be viewed securely in the browser without exposing originals.

## What Changes

- Add a secure upload ingestion flow using Multer and JWT auth
- Add Sharp-based Deep Zoom processing and token generation
- Add local persistence for tiles and metadata
- Add signed tile delivery for OpenSeadragon viewers
- Document the phased rollout and acceptance criteria

## Impact

- Affected specs: secure-image-pipeline
- Affected code: upload route, auth middleware, image-processing service, tile-serving route, local storage helpers
