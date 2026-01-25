# 使用官方Node.js运行时作为基础镜像
FROM node:18-bullseye

# 安装Electron所需的系统依赖
RUN apt-get update && \
    apt-get install -y \
    libgtk-3-dev \
    libnss3 \
    libasound2 \
    libxss1 \
    libgconf-2-4 \
    libxtst6 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libxcb-present0 \
    libxcb-sync1 \
    libxcb-xfixes0 \
    libxcb-shape0 \
    libxcb-randr0 \
    libxcb-image0 \
    libxcb-keysyms1 \
    libxcb-render-util0 \
    libxcb-util1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxkbcommon0 \
    libxkbcommon-x11-0 \
    libdrm2 \
    libxshmfence1 \
    libgbm1 && \
    rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /usr/src/app

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./

# 复制依赖安装脚本
COPY install-deps.sh ./
RUN chmod +x install-deps.sh

# 安装项目依赖
RUN ./install-deps.sh

# 如果是生产环境，可以使用下面的命令来仅安装生产依赖
# RUN npm ci --only=production

# 复制源代码到工作目录
COPY . .

# 编译TypeScript代码
RUN npm run compile

# 暴露应用运行的端口（如果有的话）
EXPOSE 3000

# 启动应用的命令
CMD [ "npm", "start" ]