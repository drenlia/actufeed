# Multi-stage build for React/Vite application

# Stage 1: Build the application
FROM node:20.19-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Serve the application
FROM node:20.19-alpine AS runner

WORKDIR /app

# Copy package files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Install dependencies (including Express for backend proxy)
RUN npm ci --ignore-scripts

# Copy built files, server, server helpers (lib/), and config from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/vite.config.js ./

# Expose port 3072 (backend server serves both API and static files)
EXPOSE 3072

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3072

# Start backend server (serves both API and static files)
CMD ["node", "server.js"]
