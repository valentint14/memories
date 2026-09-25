#!/bin/sh
# Aduce ultimele imagini publicate de CI și repornește doar containerele schimbate.
# Rulat de mână sau periodic (docs/livrare-server-propriu.md › Actualizări automate).
set -eu
cd "$(dirname "$0")"
docker compose pull --quiet
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
