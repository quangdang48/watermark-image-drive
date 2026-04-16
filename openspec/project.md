# Project Context

## Purpose

Secure Photo Gallery is a lightweight web application for schools and teachers to share student event photos with parents through personalized browser links. The product goal is simple access on mobile and desktop without app installation while reducing casual downloading and deterring redistribution through per-parent watermarking and expiring access.

## Tech Stack

- Backend: Node.js 20 with Express 4
- Frontend: Vanilla JavaScript, HTML, and CSS
- Image viewer: OpenSeadragon 5.x with canvas-based Deep Zoom rendering
- Image processing: Sharp with libvips, SVG watermark composition, and DZI tile generation
- Authentication and security: JWT-based sessions plus HMAC-SHA256 signed tile tokens and auth cookies
- Storage: Local filesystem under data/tiles/
- Database: JSON flat-file under data/db.json
- Deployment direction: MVP runs locally as a lightweight Node service, with PM2, Docker, Cloudflare CDN, Cloudflare R2, and edge verification as future scaling options

## Project Conventions

### Code Style

Prefer straightforward, explicit code over heavy abstraction. Keep modules small and maintainable for a single developer. Use descriptive camelCase names for variables and functions such as albumId, parentId, shareId, and imageIdx. Preserve readability in security-sensitive code and always validate inputs and file paths.

### Architecture Patterns

Use a lightweight REST-based Node and Express backend with a self-contained browser viewer. The core upload pipeline is receive and validate, rotate and resize, apply personalized watermark, generate DZI tiles, then persist metadata. Never serve original images directly; serve only signed, short-lived tiles and manifest data. Use opaque share IDs, same-origin cookie auth, and canvas rendering as core security and anti-download patterns.

### Testing Strategy

Prioritize real end-to-end verification for the critical flow: upload, link generation, manifest access, tile access, watermark presence, mobile viewing, and token expiry. Add regression coverage around token signing and verification, share ID generation, path traversal protection, and image-processing helpers as the codebase grows. Verify behavior with actual browser flows rather than mock-only tests.

### Git Workflow

Use short-lived feature branches and small, focused commits with clear intent. For new capabilities, breaking changes, or architecture changes, create an OpenSpec change proposal first, validate it, and wait for approval before implementation. Keep project documentation and specs updated alongside code changes.

## Domain Context

This system is designed for student and parent photo sharing in a school context. Each parent receives a personalized access link and a separately watermarked tile set. The goal is not perfect DRM; it is to block the vast majority of casual download attempts and deter advanced misuse through visible attribution and expiring access.

## Important Constraints

- Must work well on mobile and desktop browsers with zero app-install friction
- Must not expose the original full-resolution image as a direct download
- Must remain lightweight, low-cost, and maintainable by one developer
- Must accept that screenshots cannot be fully prevented in a browser environment
- Must avoid leaking internal identifiers in public URLs or token payloads
- Must use expiring, signed access for sensitive student image content
- Large parent-by-image uploads can become expensive, so async job processing may be needed later

## External Dependencies

- OpenSeadragon for zoomable canvas image viewing
- Sharp and libvips for resize, watermark, and DZI tile generation
- Multer for multipart upload handling
- JWT and Node crypto libraries for authentication and signing
- Optional production services: PM2, Docker, Cloudflare CDN, Cloudflare R2, and Cloudflare Workers
