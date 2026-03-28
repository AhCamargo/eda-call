FROM node:22-slim

RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Install packages in a temp dir, then move node_modules to /node_modules
# so the bind mount (./frontend:/app) can never override them.
WORKDIR /tmp/install
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN corepack enable && pnpm install && mv node_modules /node_modules

WORKDIR /app

EXPOSE 5173

# Node resolves /node_modules automatically (traverses up to the filesystem root).
CMD ["/node_modules/.bin/vite", "--host", "0.0.0.0", "--port", "5173"]
