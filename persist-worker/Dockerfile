FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
# Install all deps (including devDependencies for tsc + drizzle-kit)
RUN npm install
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src ./src
RUN npx tsc

# ── Generate migrations if they don't exist (CI safety) ──────────
RUN npx drizzle-kit generate --config=drizzle.config.ts || true

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
# Install ALL deps so drizzle-kit is available for `npm run db:migrate`
RUN npm install
COPY --from=builder /app/dist ./dist
# Copy migration files generated during build (or pre-committed)
COPY --from=builder /app/drizzle ./drizzle
# Copy drizzle.config.ts so drizzle-kit can find it
COPY drizzle.config.ts ./
CMD ["sh", "-c", "npm run db:migrate && node dist/index.js"]
