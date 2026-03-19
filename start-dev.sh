#!/bin/bash

# Build the project.
echo "Building PaperAgent..."
npm run dev:build

# Check whether the build succeeded.
if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

echo "Build successful!"

# Install Electron globally if it is not available yet.
if ! npm list -g electron >/dev/null 2>&1; then
    echo "Installing Electron globally..."
    npm install -g electron
fi

# Start the app.
echo "Starting PaperAgent..."
electron . --dev
