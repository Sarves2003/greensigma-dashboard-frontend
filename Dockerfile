# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install nginx
RUN apk add --no-cache nginx

# Copy built app
COPY --from=builder /app/dist/sigma-dashboard /usr/share/nginx/html

# Configure nginx
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
