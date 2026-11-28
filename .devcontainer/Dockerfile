# The image for developing Trayful in a container: Node and pnpm, git and gh,
# and Claude Code. The build context is the repository root, so Node follows
# .nvmrc. No credentials go in here; see devcontainer.json for where logins live.
FROM mcr.microsoft.com/devcontainers/base:noble

# The newest Node release of the major in .nvmrc, checked against its SHASUMS.
COPY .nvmrc /tmp/.nvmrc
RUN set -eu; \
    major="$(tr -d 'v \n' < /tmp/.nvmrc)"; \
    case "$(dpkg --print-architecture)" in amd64) arch=x64 ;; arm64) arch=arm64 ;; *) echo "unsupported architecture" >&2; exit 1 ;; esac; \
    base="https://nodejs.org/dist/latest-v${major}.x"; \
    file="$(curl -fsSL "$base/SHASUMS256.txt" | awk -v a="linux-${arch}.tar.xz" '$2 ~ a"$" { print $2 }')"; \
    cd /tmp; \
    curl -fsSLO "$base/$file"; \
    curl -fsSL "$base/SHASUMS256.txt" | grep " $file\$" | sha256sum -c -; \
    tar -xJf "$file" -C /usr/local --strip-components=1 --exclude='*.md' --exclude=LICENSE; \
    rm "$file" /tmp/.nvmrc; \
    corepack enable; \
    node --version

# gh, and once `gh auth login` has run, git pushes to GitHub with that login.
# Chromium and its system libraries come later, when the container is created,
# so they follow the Playwright version pinned in package.json.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/* \
    && git config --system credential.https://github.com.helper '!gh auth git-credential'

# Global npm packages go in a folder the `vscode` user owns, so Claude Code can
# update itself.
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=/usr/local/share/npm-global/bin:$PATH
RUN mkdir -p "$NPM_CONFIG_PREFIX" && chown vscode:vscode "$NPM_CONFIG_PREFIX"

USER vscode
# The volumes mount on these folders and take their owner from them.
RUN npm install -g @anthropic-ai/claude-code \
    && mkdir -p /home/vscode/.claude /home/vscode/.config/gh /home/vscode/.local/share/pnpm
