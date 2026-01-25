// 由于HTML文件引用的是 ./scripts/main.js，我们需要将编译后的文件移动到正确的位置
const fs = require('fs');
const path = require('path');

// 定义源目录和目标目录
const srcDir = './dist/renderer/scripts';
const destDir = './src/renderer/scripts';

// 确保目标目录存在
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// 复制编译后的JavaScript文件到src目录
function copyJsFiles(src, dest) {
  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    if (fs.statSync(srcPath).isDirectory()) {
      // 如果是目录，递归复制
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyJsFiles(srcPath, destPath);
    } else if (item.endsWith('.js')) {
      // 如果是JS文件，复制到目标目录
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

copyJsFiles(srcDir, destDir);

console.log('JavaScript文件复制完成！');