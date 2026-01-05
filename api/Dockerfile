# Use a basic Linux image (Debian) so we can run the smart installer
FROM debian:bullseye-slim

# Install necessary tools
RUN apt-get update && apt-get install -y curl unzip && rm -rf /var/lib/apt/lists/*

# Install Bun via the official script
# This script automatically detects your CPU (No AVX2) and installs the "baseline" version
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to the system path
ENV BUN_INSTALL="/root/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Set up the app directory
WORKDIR /app

# Copy config files first (for better caching)
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Copy the rest of the source code
COPY . .

# Expose the port (Change 3000 if your server.serve port is different)
EXPOSE 3000

# Start the app
CMD ["bun", "index.ts"]