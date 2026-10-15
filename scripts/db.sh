#!/usr/bin/env bash
# Local Postgres control script for development.
#
#   ./scripts/db.sh install|init|start|stop|status|psql|reset
#
# Notes
#  • The DATA directory lives outside the repo (default /home/user/pgdata), so it
#    is never committed and survives across sessions.
#  • The BINARIES are apt packages and do NOT survive a fresh sandbox session,
#    so this script reinstalls them on demand (`install`, and implicitly from
#    `start`/`init`). That keeps "new session" a one-command recovery:
#        npm run db:start
#  • The cluster is driven with pg_ctl rather than Debian's systemd wrapper
#    because sandboxes have no init system.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
PGDATA_DIR="${PGDATA_DIR:-/home/user/pgdata}"
DB_NAME="${DB_NAME:-clubhub}"
DB_USER="${DB_USER:-clubhub}"
DB_PASSWORD="${DB_PASSWORD:-clubhub}"
PORT="${PGPORT:-5432}"

# ─────────────────────────── helpers ───────────────────────────

ensure_binaries() {
  if [ -x "$PGBIN/pg_ctl" ]; then return 0; fi

  echo "Postgres binaries missing at $PGBIN — installing (binaries do not persist across sessions)…" >&2

  if command -v apt-get >/dev/null 2>&1; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null 2>&1 || true
  elif command -v brew >/dev/null 2>&1; then
    brew install postgresql@17 >/dev/null 2>&1 || true
  fi

  if [ ! -x "$PGBIN/pg_ctl" ]; then
    # Debian may resolve a different major version — take the newest available.
    local candidate
    candidate="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
    if [ -n "$candidate" ]; then PGBIN="$candidate"; fi
  fi

  [ -x "$PGBIN/pg_ctl" ] || {
    echo "Could not locate pg_ctl. Install PostgreSQL 17 manually and re-run." >&2
    exit 1
  }
}

require_cluster() {
  if [ ! -s "$PGDATA_DIR/PG_VERSION" ]; then
    echo "No cluster at $PGDATA_DIR — run: $0 init" >&2
    exit 1
  fi
  local cluster_major binary_major
  cluster_major="$(cat "$PGDATA_DIR/PG_VERSION")"
  binary_major="$("$PGBIN/postgres" --version | grep -oE '[0-9]+' | head -1)"
  if [ "$cluster_major" != "$binary_major" ]; then
    echo "Cluster is version $cluster_major but the installed binary is $binary_major." >&2
    echo "Install the matching major (e.g. PGBIN=/usr/lib/postgresql/$cluster_major/bin), or re-init with: $0 reset-data" >&2
    exit 1
  fi
}

# Workspace snapshots do not preserve EMPTY directories, and Postgres refuses to
# start without several of them ("could not open directory pg_notify"). Every
# one of them is recreated empty, so data files are untouched.
repair_layout() {
  local dirs="pg_notify pg_stat pg_stat_tmp pg_snapshots pg_commit_ts pg_dynshmem
              pg_serial pg_replslot pg_twophase pg_tblspc pg_wal/archive_status
              pg_logical/snapshots pg_logical/mappings
              pg_multixact/members pg_multixact/offsets"
  local created=0 dir
  for dir in $dirs; do
    if [ ! -d "$PGDATA_DIR/$dir" ]; then
      mkdir -p "$PGDATA_DIR/$dir"
      chmod 0700 "$PGDATA_DIR/$dir"
      created=$((created + 1))
    fi
  done
  if [ "$created" -gt 0 ]; then
    echo "Repaired data directory (recreated $created missing directory/directories)"
  fi
  return 0
}

# ─────────────────────────── commands ───────────────────────────

case "${1:-start}" in
  install)
    ensure_binaries
    echo "Postgres binaries ready: $PGBIN ($("$PGBIN/postgres" --version))"
    ;;

  init)
    ensure_binaries
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
    ensure_binaries
    require_cluster
    repair_layout
    # Postgres refuses to start unless the data directory is private. Session
    # restores can widen these bits, so normalise them on every start.
    chmod 0700 "$PGDATA_DIR"
    if "$PGBIN/pg_ctl" -D "$PGDATA_DIR" status >/dev/null 2>&1; then
      echo "Postgres already running on port $PORT"
    else
      # A session that ended without stopping Postgres leaves postmaster.pid
      # behind with a dead PID, which blocks startup ("another server might be
      # running"). Clear it only when the process is genuinely gone.
      if [ -f "$PGDATA_DIR/postmaster.pid" ]; then
        stale_pid="$(head -1 "$PGDATA_DIR/postmaster.pid" | tr -d '[:space:]')"
        if [ -n "$stale_pid" ] && ! kill -0 "$stale_pid" 2>/dev/null; then
          echo "Clearing stale postmaster.pid (process $stale_pid is gone)"
          rm -f "$PGDATA_DIR/postmaster.pid"
        fi
      fi
      "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -l "$PGDATA_DIR/server.log" -w start >/dev/null
      echo "Postgres started on port $PORT (log: $PGDATA_DIR/server.log)"
    fi
    ;;

  stop)
    ensure_binaries
    require_cluster
    "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -m fast -w stop >/dev/null
    echo "Postgres stopped"
    ;;

  status)
    ensure_binaries
    require_cluster
    "$PGBIN/pg_ctl" -D "$PGDATA_DIR" status || true
    PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h localhost -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
      "select 'rows: tenants='||(select count(*) from tenants)
              ||' users='||(select count(*) from users)
              ||' clubs='||(select count(*) from clubs)
              ||' events='||(select count(*) from events);" 2>/dev/null || true
    ;;

  psql)
    ensure_binaries
    shift || true
    PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h localhost -p "$PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
    ;;

  reset)
    ensure_binaries
    require_cluster
    PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h localhost -p "$PORT" -U "$DB_USER" \
      -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE);"
    PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h localhost -p "$PORT" -U "$DB_USER" \
      -d postgres -c "CREATE DATABASE $DB_NAME;"
    echo "Database $DB_NAME recreated empty — now run: npx prisma migrate deploy && npm run db:seed"
    ;;

  *)
    echo "Usage: $0 {install|init|start|stop|status|psql|reset}" >&2
    exit 1
    ;;
esac
