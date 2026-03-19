const fs = require('fs');
const path = require('path');

// Define the source and destination directories.
const srcDir = './dist/renderer/scripts';
const destDir = './src/renderer/scripts';

// Ensure the destination directory exists.
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Copy and transform JavaScript files.
function processJsFiles(src, dest) {
  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    if (fs.statSync(srcPath).isDirectory()) {
      // Recurse into directories.
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      // Skip the preload directory because preload scripts run in the Node.js environment.
      if (item !== 'preload') {
        processJsFiles(srcPath, destPath);
      }
    } else if (item.endsWith('.js')) {
      // Read the JavaScript file content.
      let content = fs.readFileSync(srcPath, 'utf8');
      
      // Remove ES module syntax and convert it to globals, except for preload scripts.
      const relativePath = path.relative(srcDir, srcPath);
      if (!relativePath.includes('preload')) {
        content = convertEs6ModulesToGlobals(content);
      }
      
      // Write the transformed file.
      fs.writeFileSync(destPath, content);
      console.log(`Processed: ${srcPath} -> ${destPath}`);
    }
  }
}

// Convert ES module syntax into global declarations.
function convertEs6ModulesToGlobals(content) {
  // Remove import statements.
  content = content.replace(/import\s+.*?\s+from\s+['"].*?['"];?\s*\n?/g, '');
  content = content.replace(/import\s+['"].*?['"];?\s*\n?/g, '');
  content = content.replace(/import\s+\{[\s\S]*?\}\s+from\s+['"].*?['"];?\s*\n?/g, '');
  
  // Remove export statements.
  content = content.replace(/export\s+default\s+/g, ''); // Handle export default.
  content = content.replace(/export\s+class\s+/g, 'class '); // Handle export class.
  content = content.replace(/export\s+function\s+/g, 'function '); // Handle export function.
  content = content.replace(/export\s+const\s+/g, 'const '); // Handle export const.
  content = content.replace(/export\s+let\s+/g, 'let '); // Handle export let.
  content = content.replace(/export\s+var\s+/g, 'var '); // Handle export var.
  content = content.replace(/export\s*\{/g, ''); // Remove export {.
  content = content.replace(/\};?\s*$/, '};'); // Make sure classes and objects end cleanly.
  content = content.replace(/;\s*export\s*\{/g, ';'); // Handle trailing export {.
  
  // Ensure the result ends cleanly to avoid syntax issues.
  if (!content.endsWith(';') && !content.endsWith('}') && !content.endsWith('\n') && !content.endsWith('>')) {
    content += ';';
  }
  
  return content;
}

processJsFiles(srcDir, destDir);

console.log('JavaScript file processing complete.');
