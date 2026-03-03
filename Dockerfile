FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npx tsx src/server.ts"]
