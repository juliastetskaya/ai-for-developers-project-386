#!/bin/sh
# Startup wrapper for the production image.
#
# Local Compose named volumes inherit the image directory ownership, but a PaaS
# volume (Render attach a persistent disk over /data) can arrive owned by root.
# SQLite then fails with SQLITE_CANTOPEN because the `node` user cannot write to
# the mount point. The image therefore starts as root, fixes the ownership of
# the data directory once, and immediately drops privileges: the application
# itself never runs as root.
set -eu

DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
