# ============================================
# Stage 1: Build the frontend
# ============================================
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copy package files for dependency caching
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source code and build
COPY . .
RUN npm run build

# ============================================
# Stage 2: Build the backend
# ============================================
FROM node:20-alpine AS backend-build

WORKDIR /app/server

# Copy backend package files
COPY server/package.json server/package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy backend source and compile
COPY server/ .
RUN npx tsc --outDir dist

# ============================================
# Stage 3: Production - Frontend (nginx)
# ============================================
FROM nginx:alpine AS frontend

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built frontend assets
COPY --from=frontend-build /app/dist /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:80/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# ============================================
# Stage 4: Production - Backend (node)
# ============================================
FROM node:20-alpine AS backend

RUN apk add --no-cache ca-certificates tzdata python3 make g++ chromium nss freetype harfbuzz font-noto-cjk
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy backend compiled code and dependencies
COPY --from=backend-build /app/server/dist ./dist
COPY --from=backend-build /app/server/node_modules ./node_modules
COPY --from=backend-build /app/server/ai-helper/skills ./ai-helper/skills
COPY server/package.json ./

# Runtime-writable directories for SQLite, logs, and AI helper artifacts.
RUN mkdir -p /app/data /app/logs /app/ai-helper/generated /app/ai-helper/projects /app/ai-helper/logs && \
    chown -R nodejs:nodejs /app/data /app/logs /app/ai-helper

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health || exit 1

# Switch to non-root user
USER nodejs

EXPOSE 3001

CMD ["node", "dist/index.js"]
