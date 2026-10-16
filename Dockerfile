# Runs the Trayful server in a container, apart from the rest of your computer.
# See "Running in Docker" in the README; compose.yaml has the settings to run it with.

FROM node:22-slim AS build
WORKDIR /trayful
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-slim
WORKDIR /trayful
RUN corepack enable
# Only what the server needs: the packages, and their runtime dependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages packages
COPY --from=build /trayful/packages/app/dist packages/app/dist
RUN pnpm install --frozen-lockfile --prod && rm -rf /root/.cache /root/.local/share/pnpm
USER node
EXPOSE 4317
ENTRYPOINT ["node", "packages/cli/bin/trayful.js"]
CMD ["play", "/projects", "--container"]
