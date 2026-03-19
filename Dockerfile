# Use the official Node.js runtime as the base image.
FROM node:18-bullseye

# Install the system dependencies required by Electron.
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

# Set the working directory.
WORKDIR /usr/src/app

# Copy package.json and package-lock.json if present.
COPY package*.json ./

# Copy the dependency installation script.
COPY install-deps.sh ./
RUN chmod +x install-deps.sh

# Install project dependencies.
RUN ./install-deps.sh

# For production-only installs, use the command below instead.
# RUN npm ci --only=production

# Copy the source tree into the image.
COPY . .

# Compile the TypeScript sources.
RUN npm run compile

# Expose the application port if needed.
EXPOSE 3000

# Start the application.
CMD [ "npm", "start" ]
