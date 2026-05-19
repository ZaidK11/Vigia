FROM node:22-alpine

WORKDIR /app

# Install server deps
COPY server/package*.json ./server/
RUN cd server && npm install --production

# Copy server code
COPY server/ ./server/

# Copy pre-built client (built locally before pushing)
COPY server/public/ ./server/public/

WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=3007

EXPOSE 3007

CMD ["node", "index.js"]
