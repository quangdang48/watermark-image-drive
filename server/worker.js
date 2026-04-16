import { startUploadWorker } from './services/uploadQueue.js';

startUploadWorker();

console.log('Dedicated upload worker started.');
