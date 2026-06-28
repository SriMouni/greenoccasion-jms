FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run data:sync
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Backend serves the API and the built admin SPA (frontend/dist).
CMD ["node", "--import", "tsx", "backend/server.ts"]
