FROM node:20-alpine AS base
WORKDIR /app

# Copy root workspace manifests and backend package manifest
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Install dependencies for the monorepo
RUN npm install

# Copy full repo and build backend
COPY . .
WORKDIR /app/apps/backend
RUN npm run build

EXPOSE 4000
ENV NODE_ENV=production
CMD ["npm", "start"]
