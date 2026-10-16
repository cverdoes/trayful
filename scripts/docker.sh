#!/usr/bin/env bash
# Starts the Trayful server in a container (see "Run it in Docker" in the README).
#
#   scripts/docker.sh              serves examples/
#   scripts/docker.sh ~/games      serves another project, or folder of projects
#
# Set TRAYFUL_PORT to use another port than 4317. Stop it with Ctrl+C.
set -euo pipefail

usage() {
  echo "Usage: scripts/docker.sh [games-folder]" >&2
  exit 2
}

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case $# in
  0) games="$repo/examples" ;;
  1) [[ $1 == -h || $1 == --help ]] && usage
     [[ -d $1 ]] || { echo "No folder at $1." >&2; exit 1; }
     games="$(cd "$1" && pwd)" ;;
  *) usage ;;
esac

command -v docker >/dev/null || {
  echo "Docker is not installed: see https://docs.docker.com/get-docker/" >&2
  exit 1
}

echo "Serving $games at http://localhost:${TRAYFUL_PORT:-4317}"
cd "$repo"
# Save tables as you, so the files in the games folder stay yours.
TRAYFUL_PROJECTS="$games" TRAYFUL_USER="$(id -u):$(id -g)" exec docker compose up --build
