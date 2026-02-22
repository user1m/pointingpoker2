FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm install

# Copy source
COPY . .

# Build
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Copy only the built output
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./

# Expose port (Railway sets $PORT automatically)
ENV PORT=3000
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
