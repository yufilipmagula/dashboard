# ── Stage 1: build the Vite client ────────────────────────────────────────────
FROM node:22-alpine AS client-build

WORKDIR /app

ARG NPM_TOKEN
ARG NPM_AUTH
ARG NPM_REGISTRY_URL=https://artifactory.mocca.yunextraffic.cloud/artifactory/api/npm/its-npm/

# Copy workspace root files (lockfile + root package.json)
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

# Install all workspace dependencies.
# Supports either:
# - NPM_TOKEN for //registry.../:_authToken=<token>
# - NPM_AUTH for //registry.../:_auth=<base64(user:pass)>
RUN REG_PATH="${NPM_REGISTRY_URL#https://}" && \
		REG_PATH="${REG_PATH#http://}" && \
		REG_PATH="${REG_PATH%/}/" && \
		printf "@yunex:registry=%s\nalways-auth=true\n" "$NPM_REGISTRY_URL" > .npmrc && \
		if [ -n "$NPM_TOKEN" ]; then \
			printf "//%s:_authToken=%s\n" "$REG_PATH" "$NPM_TOKEN" >> .npmrc; \
		elif [ -n "$NPM_AUTH" ]; then \
			printf "//%s:_auth=%s\n" "$REG_PATH" "$NPM_AUTH" >> .npmrc; \
		else \
			echo "Set NPM_TOKEN or NPM_AUTH to install private dependencies"; \
			exit 1; \
		fi && \
		npm ci && \
		rm -f .npmrc

# Copy client source and build
COPY client/ client/
RUN npm run build --workspace=client

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./
COPY server/package.json server/

# Install production dependencies only (server workspace)
RUN npm ci --workspace=server --omit=dev

# Copy server source
COPY server/ server/

# Copy built client from stage 1
COPY --from=client-build /app/client/dist server/public

EXPOSE 3001

CMD ["node", "server/index.js"]
