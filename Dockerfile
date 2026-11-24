# Runs the Trayful server in a container, apart from the rest of your computer.
# See docs/guide/docker.md; compose.yaml has the settings to run it with. The Release
# workflow publishes it for amd64 and arm64 as ghcr.io/cverdoes/trayful.

# Builds the same bundle as the npm package. It is plain JavaScript, the same on every
# platform, so it is built once on the machine running the build.
FROM --platform=$BUILDPLATFORM node:22-slim AS build
WORKDIR /trayful
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm package

FROM node:22-slim
# git for a git-backed Trayful (--data); certificates for its HTTPS remotes.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# The bundle and what it ships with: the browser app, the starter project, docs and skill.
COPY --from=build /trayful/packages/cli/dist /trayful
# The examples, so a container started without a folder of its own has something to play.
COPY --chown=node:node examples /projects
USER node
EXPOSE 4317
ENTRYPOINT ["node", "/trayful/trayful.js"]
CMD ["play", "/projects", "--container"]
