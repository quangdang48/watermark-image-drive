import { createApp } from './app.js';
import { startUploadWorker } from './services/uploadQueue.js';

const port = Number(process.env.PORT || 3000);
const app = createApp();

startUploadWorker();

app.listen(port, () => {
  console.log(`Secure gallery server listening on http://localhost:${port}`);
});
