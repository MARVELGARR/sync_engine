FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
# Install all deps (including devDependencies for tsc + drizzle-kit).
# --include=dev because ENV NODE_ENV=production would otherwise omit devDeps.
RUN npm install --include=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
RUN npx tsc

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
# Install ALL deps so drizzle-kit is available for `npm run db:migrate`.
# --include=dev overrides NODE_ENV=production pruning.
RUN npm install --include=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
# Copy pre-committed migration files (do NOT regenerate during build)
COPY --from=builder /app/drizzle ./drizzle
# Copy drizzle.config.ts so drizzle-kit can find it
COPY drizzle.config.ts ./
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && node dist/index.js"]
