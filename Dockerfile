FROM node:18-alpine

WORKDIR /app

# Install server deps
COPY server/package*.json ./server/
RUN cd server && npm install --production

# Copy server code
COPY server/ ./server/

# Copy pre-built client
COPY server/public/ ./server/public/

WORKDIR /app/server

ENV NODE_ENV=production
# Railway injects $PORT — default 3000 for Railway
ENV PORT=3000

EXPOSE 3000

CMD ["node", "index.js"]
