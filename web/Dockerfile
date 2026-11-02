# WireProof web app as one self-contained Next.js server.
#   docker build -t wireproof web/
#   docker run -p 3000:3000 --env-file web/.env.local -v wireproof-data:/data wireproof
# Then open /api/health on the host to check Meta's API answers from there.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
# WIREPROOF_HOSTED: no localhost bypass of the passcode, and "start again" restores the seeded job.
# TZ: report times are written on the server, in the time the owner and electrician live by.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 WIREPROOF_HOSTED=1 DATA_DIR=/data TZ=Africa/Lagos
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/seed ./seed
USER app
EXPOSE 3000
CMD ["node", "server.js"]
