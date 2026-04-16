## ADDED Requirements

### Requirement: Authenticated image upload ingestion

The system SHALL accept multipart image uploads only from callers presenting a valid RS-256 bearer token.

#### Scenario: Reject invalid token before processing

- **WHEN** a client sends `POST /upload` with an invalid, expired, or missing token
- **THEN** the system returns `401 Unauthorized`
- **AND** the image is not decoded or stored

#### Scenario: Reject unsupported uploads

- **WHEN** a client uploads a file exceeding the allowed size or unsupported MIME type
- **THEN** the system returns `400 Bad Request`
- **AND** no processing artifacts are created

### Requirement: Deep Zoom processing pipeline

The system SHALL decode uploaded images, extract metadata, generate pyramid levels, and produce `256 x 256` Deep Zoom tiles with a `.dzi` manifest.

#### Scenario: Successful tile generation

- **WHEN** a valid authenticated image upload is received
- **THEN** Sharp processes the image using a high-quality resize kernel
- **AND** tile output is written for each pyramid level
- **AND** the manifest for OpenSeadragon is generated

### Requirement: Signed tile access

The system SHALL require a valid HMAC-SHA256 token with a time-to-live for each tile request.

#### Scenario: Serve tile to authorized viewer

- **WHEN** a viewer requests `GET /tiles/:id/:z/:x_y` with a valid unexpired token
- **THEN** the system verifies the signature
- **AND** streams the requested tile content

#### Scenario: Reject expired or tampered token

- **WHEN** the tile token is expired or the signature is invalid
- **THEN** the system returns `403 Forbidden`
- **AND** no tile bytes are streamed

### Requirement: Persist image metadata and response contract

The system SHALL store tile metadata locally and return the generated image identifier after processing completes.

#### Scenario: Return image identifier on success

- **WHEN** the upload pipeline finishes successfully
- **THEN** the system writes image and token metadata to the local database
- **AND** responds with `200 OK` including the generated `imageId`
