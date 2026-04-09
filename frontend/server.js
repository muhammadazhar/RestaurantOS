const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BUILD_DIR = path.join(__dirname, 'build');

console.log(`Build dir: ${BUILD_DIR}`);
console.log(`Build dir exists: ${fs.existsSync(BUILD_DIR)}`);

app.use(express.static(BUILD_DIR));

app.get('*', (req, res) => {
  const indexFile = path.join(BUILD_DIR, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(503).send('Build not found. Run npm run build first.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend running on port ${PORT}`);
});
