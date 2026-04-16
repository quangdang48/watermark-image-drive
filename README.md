# Secure Photo Gallery

A lightweight Node.js and Express photo gallery for uploading, browsing, previewing, and downloading images through Deep Zoom tiles.

## Features

- Teacher and Student views
- Folder-based image library management
- Image upload, rename, move, and delete flows
- Deep Zoom tile generation with Sharp
- OpenSeadragon-based viewer
- Personalized tile watermark demo in Student view
- Local JSON metadata storage

## Tech Stack

- Node.js
- Express
- Sharp
- Vanilla JavaScript
- OpenSeadragon

## Project Structure

```text
.
├─ public/              # Frontend UI
├─ server/              # Express app, routes, services
├─ data/                # Local JSON DB and generated tiles
├─ scripts/             # Reset and demo seeding scripts
├─ tests/               # Node test suite
└─ docs/                # Notes and planning docs
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npm start
```

The app runs on:

- Teacher view: http://localhost:3000/teacher
- Student view: http://localhost:3000/student

## Useful Scripts

```bash
npm start         # Run the server
npm test          # Run automated tests
node scripts/resetData.js
node scripts/seedDemo.js
```

## Watermark Demo

To try the personalized watermark flow:

1. Open the Student view.
2. Enter a name in the watermark input.
3. Click **Apply Name**.
4. Open an image from the library.
5. The preview tiles will render with a right-corner watermark using that name.

## Storage Model

- Image metadata is stored in `data/db.json`
- Generated Deep Zoom tiles are stored under `data/tiles/`

## Notes

This project is currently a local demo/MVP and is suitable for experimenting with protected image delivery, tile-based viewing, and watermarking ideas.
