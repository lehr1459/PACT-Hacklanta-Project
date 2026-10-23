# Consume ONLY the private context emitted by prepare-web.mjs; never the repository root.
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runtime
RUN node -e "const{execFileSync}=require('node:child_process');if(process.version!=='v24.22.1'||execFileSync('npm',['--version'],{encoding:'utf8'}).trim()!=='11.19.1')process.exit(1)"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /pact/packages/pact-sdk
COPY packages/pact-sdk/package.json packages/pact-sdk/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --fund=false
COPY packages/pact-sdk/dist ./dist
WORKDIR /pact/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --fund=false
COPY --chown=node:node web/.next ./.next
COPY --chown=node:node web/public ./public
COPY web/next.config.mjs ./next.config.mjs
COPY scripts/validation/environment.mjs /pact/scripts/validation/environment.mjs
COPY web-runtime-manifest.json /pact/web-runtime-manifest.json
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
CMD ["node","node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3000"]
