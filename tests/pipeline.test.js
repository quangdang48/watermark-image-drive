import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../server/app.js';

delete process.env.JWT_PUBLIC_KEY;
delete process.env.TILE_TOKEN_SECRET;
delete process.env.TOKEN_TTL_SECONDS;

async function createImageBuffer() {
  return sharp({
    create: {
      width: 512,
      height: 512,
      channels: 3,
      background: { r: 20, g: 80, b: 140 },
    },
  })
    .jpeg()
    .toBuffer();
}

test('serves teacher and student views from simple paths', async () => {
  const app = createApp();

  const teacherResponse = await request(app)
    .get('/teacher');

  const studentResponse = await request(app)
    .get('/student');

  assert.equal(teacherResponse.status, 200);
  assert.match(teacherResponse.text, /Photo Gallery/);
  assert.match(teacherResponse.text, /Upload Image/);
  assert.doesNotMatch(teacherResponse.text, /Rename selected image|Rename selected folder|Save Changes/);
  assert.equal(studentResponse.status, 200);
  assert.match(studentResponse.text, /Photo Gallery/);
  assert.match(studentResponse.text, /Student/);
});

test('uploads an image without JWT configuration', async () => {
  const app = createApp();
  const image = await createImageBuffer();

  const uploadResponse = await request(app)
    .post('/upload')
    .attach('image', image, 'sample.jpg');

  assert.equal(uploadResponse.status, 200);
  assert.equal(uploadResponse.body.status, 'ok');
  assert.ok(uploadResponse.body.imageId);
  assert.ok(Array.isArray(uploadResponse.body.levels));
  assert.ok(uploadResponse.body.levels.length > 0);
});

test('stores folder and image labels for uploaded images and lists them for the UI', async () => {
  const app = createApp();
  const image = await createImageBuffer();

  const uploadResponse = await request(app)
    .post('/upload')
    .field('folder', 'class-a')
    .field('imageName', 'portrait-1')
    .attach('image', image, 'sample.jpg');

  assert.equal(uploadResponse.status, 200);
  assert.equal(uploadResponse.body.folder, 'class-a');
  assert.equal(uploadResponse.body.imageName, 'portrait-1');

  const libraryResponse = await request(app)
    .get('/upload/library');

  assert.equal(libraryResponse.status, 200);
  assert.ok(Array.isArray(libraryResponse.body.folders));
  assert.ok(libraryResponse.body.folders.some((folder) => (
    folder.folderId === 'class-a'
      && Array.isArray(folder.images)
      && folder.images.some((entry) => entry.imageId === uploadResponse.body.imageId && entry.imageName === 'portrait-1')
  )));
});

test('updates image name and folder for library management', async () => {
  const app = createApp();
  const image = await createImageBuffer();
  const sourceFolder = `class-a-${Date.now()}`;
  const targetFolder = `class-b-${Date.now()}`;

  const uploadResponse = await request(app)
    .post('/upload')
    .field('folder', sourceFolder)
    .field('imageName', 'portrait-1')
    .attach('image', image, 'sample.jpg');

  assert.equal(uploadResponse.status, 200);

  const updateResponse = await request(app)
    .patch(`/upload/${uploadResponse.body.imageId}`)
    .send({ folder: targetFolder, imageName: 'portrait-2' });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.folder, targetFolder);
  assert.equal(updateResponse.body.imageName, 'portrait-2');

  const libraryResponse = await request(app)
    .get('/upload/library');

  assert.equal(libraryResponse.status, 200);
  assert.ok(libraryResponse.body.folders.some((folder) => (
    folder.folderId === targetFolder
      && folder.images.some((entry) => entry.imageId === uploadResponse.body.imageId && entry.imageName === 'portrait-2')
  )));
});

test('creates empty folders and lists them in the library', async () => {
  const app = createApp();
  const folderId = `new-folder-${Date.now()}`;

  const createResponse = await request(app)
    .post('/upload/folders')
    .send({ folderName: folderId });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.folderId, folderId);
  assert.equal(createResponse.body.imageCount, 0);

  const libraryResponse = await request(app)
    .get('/upload/library');

  assert.equal(libraryResponse.status, 200);
  assert.ok(libraryResponse.body.folders.some((folder) => (
    folder.folderId === folderId
      && Array.isArray(folder.images)
      && folder.images.length === 0
  )));
});

test('renames and deletes folders through the management API', async () => {
  const app = createApp();
  const image = await createImageBuffer();
  const sourceFolder = `events-2026-${Date.now()}`;
  const renamedFolder = `${sourceFolder}-archive`;

  const firstUpload = await request(app)
    .post('/upload')
    .field('folder', sourceFolder)
    .field('imageName', 'group-1')
    .attach('image', image, 'sample-1.jpg');

  const secondUpload = await request(app)
    .post('/upload')
    .field('folder', sourceFolder)
    .field('imageName', 'group-2')
    .attach('image', image, 'sample-2.jpg');

  assert.equal(firstUpload.status, 200);
  assert.equal(secondUpload.status, 200);

  const renameResponse = await request(app)
    .patch(`/upload/folders/${sourceFolder}`)
    .send({ nextFolderName: renamedFolder });

  assert.equal(renameResponse.status, 200);
  assert.equal(renameResponse.body.folderId, renamedFolder);
  assert.equal(renameResponse.body.updatedCount, 2);

  const deleteResponse = await request(app)
    .delete(`/upload/folders/${renamedFolder}`);

  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.deletedCount, 2);

  const libraryResponse = await request(app)
    .get('/upload/library');

  assert.equal(libraryResponse.status, 200);
  assert.ok(!libraryResponse.body.folders.some((folder) => folder.folderId === renamedFolder));
});

test('returns uploaded image metadata by id', async () => {
  const app = createApp();
  const image = await createImageBuffer();

  const uploadResponse = await request(app)
    .post('/upload')
    .attach('image', image, 'sample.jpg');

  assert.equal(uploadResponse.status, 200);

  const { imageId } = uploadResponse.body;

  const imageResponse = await request(app)
    .get(`/upload/${imageId}`);

  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.body.status, 'ok');
  assert.equal(imageResponse.body.imageId, imageId);
  assert.equal(imageResponse.body.dziUrl, `/tiles/${imageId}/image.dzi`);
  assert.ok(imageResponse.body.metadata);
});

test('allows teachers to download an uploaded image', async () => {
  const app = createApp();
  const image = await createImageBuffer();

  const uploadResponse = await request(app)
    .post('/upload')
    .field('folder', 'downloads')
    .field('imageName', 'class-photo')
    .attach('image', image, 'sample.jpg');

  assert.equal(uploadResponse.status, 200);

  const downloadResponse = await request(app)
    .get(`/upload/${uploadResponse.body.imageId}/download`);

  assert.equal(downloadResponse.status, 200);
  assert.match(downloadResponse.headers['content-type'], /image\//);
  assert.match(downloadResponse.headers['content-disposition'], /attachment/);
});

test('serves manifest and tiles without security tokens', async () => {
  const app = createApp();
  const image = await createImageBuffer();

  const uploadResponse = await request(app)
    .post('/upload')
    .attach('image', image, 'sample.jpg');

  assert.equal(uploadResponse.status, 200);

  const { imageId } = uploadResponse.body;

  const manifestResponse = await request(app)
    .get(`/tiles/${imageId}/image.dzi`);

  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.text, /Image/);

  const tileResponse = await request(app)
    .get(`/tiles/${imageId}/0/0_0`);

  assert.equal(tileResponse.status, 200);
  assert.match(tileResponse.headers['content-type'], /image\/jpeg/);

  const legacyTileResponse = await request(app)
    .get(`/tiles/${imageId}/image_files/0/0_0.jpg`);

  assert.equal(legacyTileResponse.status, 200);
  assert.match(legacyTileResponse.headers['content-type'], /image\/jpeg/);
});

test('renders a personalized watermark when a viewer name is supplied for a tile', async () => {
  const app = createApp();
  const image = await createImageBuffer();

  const uploadResponse = await request(app)
    .post('/upload')
    .attach('image', image, 'sample.jpg');

  assert.equal(uploadResponse.status, 200);

  const { imageId } = uploadResponse.body;

  const baseTileResponse = await request(app)
    .get(`/tiles/${imageId}/0/0_0.jpg`);

  const watermarkedTileResponse = await request(app)
    .get(`/tiles/${imageId}/0/0_0.jpg`)
    .query({ viewerName: 'Parent Demo' });

  assert.equal(baseTileResponse.status, 200);
  assert.equal(watermarkedTileResponse.status, 200);
  assert.match(watermarkedTileResponse.headers['content-type'], /image\/jpeg/);
  assert.notDeepEqual(watermarkedTileResponse.body, baseTileResponse.body);
});
