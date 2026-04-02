FROM node:22-alpine3.22

RUN apk upgrade --no-cache

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --no-frozen-lockfile

COPY . .

EXPOSE 5000

CMD ["pnpm", "run", "start"]
