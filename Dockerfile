# Sử dụng Node.js 20 Alpine để tương thích với undici
FROM node:20-alpine

# Tạo thư mục app
WORKDIR /app

# Copy package files
COPY package*.json ./

# Cài đặt dependencies (chỉ production) và tối ưu cho free tier
RUN npm ci --only=production --no-audit --no-fund && \
  npm cache clean --force && \
  rm -rf /tmp/* /var/cache/apk/*

# Copy source code
COPY src/ ./src/

# Tạo user non-root để bảo mật
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Chuyển ownership cho user nodejs
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start command
CMD ["node", "src/app.js"]
