FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 4000
# Apply migrations on boot, then start the API + WebSocket server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
