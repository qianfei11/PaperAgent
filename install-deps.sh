#!/bin/bash
# 初始化脚本 - install-deps.sh

# 安装项目依赖
npm install

# 安装额外的开发依赖
npm install --save-dev @types/uuid

echo "依赖安装完成！"