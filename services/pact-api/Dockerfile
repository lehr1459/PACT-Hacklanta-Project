# Local build only; deployment and publication require separate owner approval.
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
RUN node -e "const{execFileSync}=require('node:child_process');if(process.version!=='v24.22.1'||execFileSync('npm',['--version'],{encoding:'utf8'}).trim()!=='11.19.1')process.exit(1)"
WORKDIR /build/packages/pact-sdk
COPY packages/pact-sdk/package.json packages/pact-sdk/package-lock.json ./
RUN npm ci --no-audit --fund=false
COPY packages/pact-sdk/build.mjs packages/pact-sdk/tsconfig.json ./
COPY packages/pact-sdk/src ./src
RUN npm run build && npm ci --omit=dev --ignore-scripts --no-audit --fund=false
WORKDIR /build/services/pact-api
COPY services/pact-api/package.json services/pact-api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --fund=false
COPY services/pact-api/src ./src
COPY services/pact-api/migrations ./migrations
COPY services/pact-api/operations ./operations

FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runtime
ENV NODE_ENV=production PACT_HOSTED_PROFILE=hosted PACT_HOSTED_PROCESS_MODEL=single-persistent-process PACT_HOSTED_HOST=127.0.0.1 PACT_HOSTED_PORT=4100 PACT_HOSTED_CLOCK_DIRECTORY=/pact-clock
WORKDIR /pact/services/pact-api
COPY --from=build --chown=node:node /build/packages/pact-sdk/package.json /build/packages/pact-sdk/package-lock.json /pact/packages/pact-sdk/
COPY --from=build --chown=node:node /build/packages/pact-sdk/dist /pact/packages/pact-sdk/dist
COPY --from=build --chown=node:node /build/packages/pact-sdk/node_modules /pact/packages/pact-sdk/node_modules
COPY --from=build --chown=node:node /build/services/pact-api /pact/services/pact-api
RUN mkdir /pact-clock && chown node:node /pact-clock && chmod 700 /pact-clock
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node --input-type=module -e "const r=await fetch('http://127.0.0.1:'+process.env.PACT_HOSTED_PORT+'/v1/health/live');if(!r.ok)process.exit(1)"
CMD ["node","src/start.mjs"]
