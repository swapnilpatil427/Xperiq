FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3001

# Graceful stop: send SIGTERM, give 30s for in-flight requests to finish
STOPSIGNAL SIGTERM

CMD ["node", "src/index.js"]
