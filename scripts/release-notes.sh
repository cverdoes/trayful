#!/usr/bin/env bash
# Prints the CHANGELOG.md section for one version, without its heading:
#   scripts/release-notes.sh 0.2.0
# A pre-release such as 0.2.0-rc.1 uses its own section if there is one, else 0.2.0's.
# Fails when CHANGELOG.md has no notes for the version.
set -euo pipefail

version="${1:?usage: scripts/release-notes.sh <version>}"
changelog="$(dirname "$0")/../CHANGELOG.md"

section() {
  awk -v heading="## $1" '
    $0 == heading { found = 1; next }
    found && /^## / { exit }
    found { print }
  ' "$changelog" | sed -e '/./,$!d'
}

notes=$(section "$version")
if [ -z "${notes//[[:space:]]/}" ]; then
  notes=$(section "${version%%-*}")
fi
if [ -z "${notes//[[:space:]]/}" ]; then
  echo "CHANGELOG.md has no notes under \"## $version\". Add them before tagging v$version." >&2
  exit 1
fi
printf '%s\n' "$notes"
