## Context

This MVP needs to securely move an uploaded image from authenticated ingestion to browser-based Deep Zoom viewing. The application must stay lightweight, avoid direct original-image delivery, and remain easy for one developer to operate.

## Goals / Non-Goals

- Goals:
  - Secure uploads with early rejection of bad input
  - Deep Zoom tile generation for efficient pan and zoom
  - Signed tile delivery with short-lived access
  - Simple local persistence for MVP deployment
- Non-Goals:
  - Distributed job queues in the first iteration
  - Cloud object storage in the first iteration
  - Perfect screenshot prevention

## Decisions

- Decision: use Express + Multer for multipart ingestion.
  - Why: simple, proven, and fits the current stack.
- Decision: verify RS-256 JWT before processing any image bytes.
  - Why: reduces wasted compute and protects sensitive content paths.
- Decision: use Sharp/libvips to generate Deep Zoom tiles and metadata.
  - Why: fast native pipeline with strong resize support.
- Decision: sign tile access using HMAC-SHA256 tokens with TTL.
  - Why: allows stateless verification on each tile request.
- Decision: store tiles on local disk and metadata in `data/db.json`.
  - Why: fits MVP scope and keeps operations simple.

## Risks / Trade-offs

- Large uploads may increase request latency.
  - Mitigation: keep processing synchronous for MVP but isolate the pipeline for future async jobs.
- JSON flat-file writes can become a bottleneck.
  - Mitigation: use atomic writes and keep records small.
- Token leakage still allows temporary reuse.
  - Mitigation: keep TTL short and bind claims to image and viewer context where practical.

## Migration Plan

1. Add middleware and routes.
2. Implement the processing and token services.
3. Persist generated output locally.
4. Connect the viewer to the signed tile endpoint.
5. Validate the end-to-end flow with real browser checks.

## Open Questions

- Whether upload processing should remain blocking or move to a background job after initial MVP testing.
- Whether the tile token should be passed as a query string, cookie, or signed header for the viewer flow.
