#!/usr/bin/env bash
# Local Postgres control script for development.
#
# Data lives OUTSIDE the repo (../pgdata) so it is never committed, and the
# cluster is managed directly with pg_ctl rather than Debian's systemd wrapper
# (there is no init system in this sandbox).
#
#   ./scripts/db.sh start|stop|status|psql|reset
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
PGDATA_DIR="${PGDATA_DIR:-/home/user/pgdata}"
DB_NAME="${DB_NAME:-clubhub}"
DB_USER="${DB_USER:-clubhub}"
DB_PASSWORD="${DB_PASSWORD:-clubhub}"
PORT="${PGPORT:-5432}"

require_cluster() {
  if [ ! -s "$PGDATA_DIR/PG_VERSION" ]; then
    echo "No cluster at $PGDATA_DIR — run: $0 init" >&2
    exit 1
  fi
}

case "${1:-start}" in
  init)
    if [ -s "$PGDATA_DIR/PG_VERSION" ]; then
      echo "Cluster already initialised at $PGDATA_DIR"
      exit 0
    fi
    mkdir -p "$PGDATA_DIR"
    "$PGBIN/initdb" -D "$PGDATA_DIR" -U postgres --auth=trust \
      --encoding=UTF8 --locale=C.UTF-8 >/dev/null
    cat >>"$PGDATA_DIR/postgresql.conf" <<EOF

# ── ClubHub dev settings ──────────────────────────────
listen_addresses = 'localhost'
port = $PORT
unix_socket_directories = '/tmp'
fsync = off
synchronous_commit = off
full_page_writes = off
max_connections = 50
EOF
    "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -l "$PGDATA_DIR/server.log" -w start >/dev/null
    "$PGBIN/psql" -h localhost -p "$PORT" -U postgres -c \
      "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD' CREATEDB;"
    "$PGBIN/psql" -h localhost -p "$PORT" -U postgres -c \
      "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    echo "Cluster ready: postgresql://$DB_USER@localhost:$PORT/$DB_NAME"
    ;;

  start)
    require_cluster
    if "$PGBIN/pg_ctl" -D "$PGDATA_DIR" status >/dev/null 2>&1; then
      echo "Postgres already running on port $PORT"
    else
      "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -l "$PGDATA_DIR/server.log" -w start >/dev/null
      echo "Postgres started on port $PORT (log: $PGDATA_DIR/server.log)"
    fi
    ;;

  stop)
    require_cluster
    "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -m fast -w stop >/dev/null
    echo "Postgres stopped"
    ;;

  status)
    require_cluster
    "$PGBIN/pg_ctl" -D "$PGDATA_DIR" status || true
    ;;

  psql)
    shift || true
    PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h localhost -p "$PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
    ;;

  reset)
    require_cluster
    PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h localhost -p "$PORT" -U "$DB_USER" \
      -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE);"
    PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h localhost -p "$PORT" -U "$DB_USER" \
      -d postgres -c "CREATE DATABASE $DB_NAME;"
    echo "Database $DB_NAME recreated empty — now run: npx prisma migrate deploy"
    ;;

  *)
    echo "Usage: $0 {init|start|stop|status|psql|reset}" >&2
    exit 1
    ;;
esac
