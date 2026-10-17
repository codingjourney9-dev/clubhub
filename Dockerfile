# ClubHub — production image.
#
# Three stages:
#   deps    → exact dependency tree from package-lock.json
#   builder → prisma generate + next build (standalone output), and the stage
#             used to run migrations (it is the only stage with the CLI)
#   runner  → just node, the standalone server, static assets and public files
#
# Node 20 matches package.json `engines` and the version the app was tested on.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
# The repo pins legacy-peer-deps (see .npmrc); copy it or `npm ci` refuses.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma 7 generates its typed client into src/generated (gitignored), so it must
# be regenerated here — `postinstall` already does it, this makes it explicit and
# independent of npm lifecycle behaviour.
RUN npx prisma generate
# `next build` never connects to the database (env validation is lazy), so no
# DATABASE_URL is needed at image-build time. That is deliberate: the same image
# is promoted through environments.
ENV BUILD_STANDALONE=1
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Defence in depth: `next build` copies a project-root .env into the standalone
# output. .dockerignore already keeps it out of the build context; this makes an
# image that contains secrets impossible even if that file is ever missed.
RUN rm -f /app/.env /app/.env.local /app/.env.production

# Run unprivileged. `node` already exists in the official image (uid 1000).
USER node

# Standalone bundles the server and its traced dependencies, but NOT the static
# assets or public/ — those are copied in explicitly below. Missing them is the
# classic "the page loads unstyled" container bug.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

EXPOSE 3000

# `node` is always present; curl/wget are not in the slim image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# server.js is emitted by output: "standalone".
CMD ["node", "server.js"]
