// Copy src/renderer/index.html and styles to dist/renderer/
const fs = require('fs');
const path = require('path');

const distRenderer = path.join(__dirname, 'dist', 'renderer');
if (!fs.existsSync(distRenderer)) fs.mkdirSync(distRenderer, { recursive: true });

// Copy index.html
const srcHtml = path.join(__dirname, 'src', 'renderer', 'index.html');
const destHtml = path.join(distRenderer, 'index.html');
fs.copyFileSync(srcHtml, destHtml);
console.log(`Copied: src/renderer/index.html -> dist/renderer/index.html`);

// Copy styles directory
const srcStyles = path.join(__dirname, 'src', 'renderer', 'styles');
const destStyles = path.join(distRenderer, 'styles');
if (fs.existsSync(srcStyles)) {
  if (!fs.existsSync(destStyles)) fs.mkdirSync(destStyles, { recursive: true });
  for (const file of fs.readdirSync(srcStyles)) {
    fs.copyFileSync(path.join(srcStyles, file), path.join(destStyles, file));
    console.log(`Copied style: ${file}`);
  }
}

console.log('Done.');
