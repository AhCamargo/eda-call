FROM node:22-alpine3.22

RUN apk upgrade --no-cache

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
