#!/bin/bash
# Bootstrap script - install-deps.sh

# Install project dependencies.
npm install

# Install the extra development dependency.
npm install --save-dev @types/uuid

echo "Dependency installation complete."
