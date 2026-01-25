#!/bin/bash

# 构建项目
echo "Building PaperAgent..."
npm run dev:build

# 检查构建是否成功
if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

echo "Build successful!"

# 安装Electron（如果尚未安装）
if ! npm list -g electron >/dev/null 2>&1; then
    echo "Installing Electron globally..."
    npm install -g electron
fi

# 启动应用
echo "Starting PaperAgent..."
electron . --dev