FROM node:20-alpine AS base
WORKDIR /app

# Copy root and backend package metadata
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Install dependencies at root workspace level, including dev dependencies needed to build
RUN npm install --include=dev

# Copy repository code and build backend
COPY . .
RUN npm exec --workspace=@acme/backend prisma generate --schema=apps/backend/prisma/schema.prisma
WORKDIR /app/apps/backend
RUN npm run build

EXPOSE 4000
ENV NODE_ENV=production
CMD ["npm", "start"]
