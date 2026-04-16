import sharp from 'sharp';

const imageBuffer = await sharp({
  create: {
    width: 1400,
    height: 900,
    channels: 3,
    background: { r: 223, g: 236, b: 255 },
  },
})
  .composite([
    {
      input: Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
          <rect width="1400" height="900" fill="#dfe8ff" />
          <rect x="60" y="60" width="1280" height="780" rx="32" fill="#ffffff" stroke="#bdd1ff" stroke-width="8" />
          <text x="100" y="220" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#1f4aa8">Student Watermark Demo</text>
          <text x="100" y="310" font-family="Arial, sans-serif" font-size="36" fill="#4a628f">Enter a viewer name in Student mode to personalize the preview.</text>
          <text x="100" y="380" font-family="Arial, sans-serif" font-size="30" fill="#6a7da3">This image is preloaded for the watermark demo.</text>
        </svg>
      `),
    },
  ])
  .jpeg({ quality: 92 })
  .toBuffer();

const form = new FormData();
form.append('folder', 'Demo');
form.append('imageName', 'Watermark Demo');
form.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'watermark-demo.jpg');

const response = await fetch('http://localhost:3000/upload', {
  method: 'POST',
  body: form,
});

console.log(await response.text());
