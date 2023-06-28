#!/bin/bash

# Install Node.js v18.16.1
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 18.16.1

# Install dependencies
npm install

# Build the project
npm run build

# Start the project
npm start