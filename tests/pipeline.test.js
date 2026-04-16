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
  assert.equal(studentResponse.status, 200);
  assert.match(studentResponse.text, /Photo Gallery/);
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
