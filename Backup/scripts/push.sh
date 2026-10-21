#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
namespace="${1:-kyguy2}"
tag="${2:-latest}"
if [[ ! "$namespace" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || [[ ! "$tag" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]]; then
  echo 'Invalid Docker Hub namespace or tag.' >&2
  exit 1
fi
image="$namespace/fsbak:$tag"
docker info >/dev/null
npm ci
npm run check
npm test
docker build --pull --tag "$image" .
docker push "$image"
printf '\nPublished %s\nSet IMAGE=%s in .env to use it.\n' "$image" "$image"
