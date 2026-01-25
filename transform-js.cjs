const fs = require('fs');
const path = require('path');

// 定义源目录和目标目录
const srcDir = './dist/renderer/scripts';
const destDir = './src/renderer/scripts';

// 确保目标目录存在
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// 复制并转换JavaScript文件
function processJsFiles(src, dest) {
  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    if (fs.statSync(srcPath).isDirectory()) {
      // 如果是目录，递归处理
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      // 跳过预加载目录，因为预加载脚本需要在Node.js环境中运行
      if (item !== 'preload') {
        processJsFiles(srcPath, destPath);
      }
    } else if (item.endsWith('.js')) {
      // 读取JavaScript文件内容
      let content = fs.readFileSync(srcPath, 'utf8');
      
      // 移除ES6模块语法并转换为全局变量（但不处理预加载脚本）
      const relativePath = path.relative(srcDir, srcPath);
      if (!relativePath.includes('preload')) {
        content = convertEs6ModulesToGlobals(content);
      }
      
      // 写入目标文件
      fs.writeFileSync(destPath, content);
      console.log(`Processed: ${srcPath} -> ${destPath}`);
    }
  }
}

// 将ES6模块语法转换为全局变量
function convertEs6ModulesToGlobals(content) {
  // 移除 import 语句
  content = content.replace(/import\s+.*?\s+from\s+['"].*?['"];?\s*\n?/g, '');
  content = content.replace(/import\s+['"].*?['"];?\s*\n?/g, '');
  content = content.replace(/import\s+\{[\s\S]*?\}\s+from\s+['"].*?['"];?\s*\n?/g, '');
  
  // 移除 export 语句
  content = content.replace(/export\s+default\s+/g, ''); // 处理 export default
  content = content.replace(/export\s+class\s+/g, 'class '); // 处理 export class
  content = content.replace(/export\s+function\s+/g, 'function '); // 处理 export function
  content = content.replace(/export\s+const\s+/g, 'const '); // 处理 export const
  content = content.replace(/export\s+let\s+/g, 'let '); // 处理 export let
  content = content.replace(/export\s+var\s+/g, 'var '); // 处理 export var
  content = content.replace(/export\s*\{/g, ''); // 移除 export { 
  content = content.replace(/\};?\s*$/, '};'); // 确保类或对象正确结束
  content = content.replace(/;\s*export\s*\{/g, ';'); // 处理行末的 export {
  
  // 确保内容以分号结尾，避免语法错误
  if (!content.endsWith(';') && !content.endsWith('}') && !content.endsWith('\n') && !content.endsWith('>')) {
    content += ';';
  }
  
  return content;
}

processJsFiles(srcDir, destDir);

console.log('JavaScript文件处理完成！');