#!/usr/bin/env bash
# ==============================================================================
# deploy.sh — 1-command PROD deploy cho vigo-backend (k3s) & vigo-admin (Pages)
# Chạy trực tiếp trên máy .84 (ssh vigo@118.70.127.254) hoặc Mac mini (.182)
#
# Cách dùng:
#   ~/deploy.sh            # Ở ~: deploy cả backend + admin (origin/main)
#                          # Ở trong vigo-backend: chỉ deploy backend
#                          # Ở trong vigo-admin: chỉ deploy admin
#   ~/deploy.sh backend    # Chỉ deploy vigo-backend lên k3s PROD
#   ~/deploy.sh admin      # Chỉ deploy vigo-admin lên 4 cổng Cloudflare Pages
#   ~/deploy.sh all        # Deploy cả backend + admin
# ==============================================================================
set -euo pipefail

export PATH="${HOME}/.local/node22/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"

if [ $# -ge 1 ]; then
  TARGET="$1"
else
  case "$PWD" in
    *vigo-backend*) TARGET="backend" ;;
    *vigo-admin*)   TARGET="admin" ;;
    *)              TARGET="all" ;;
  esac
fi

CF_ENV="${HOME}/.config/vigo/cloudflare.env"
K3S_NODES=("192.168.1.111" "192.168.1.112" "192.168.1.113")

if [ -d "${HOME}/vigo-backend/.git" ]; then
  BACKEND_DIR="${HOME}/vigo-backend"
elif [ -e "/Volumes/External/Projects/vigo-backend-wt-release/.git" ]; then
  BACKEND_DIR="/Volumes/External/Projects/vigo-backend-wt-release"
else
  BACKEND_DIR="/Volumes/External/Projects/vigo-backend"
fi

if [ -d "${HOME}/vigo-admin/.git" ]; then
  ADMIN_DIR="${HOME}/vigo-admin"
else
  ADMIN_DIR="/Volumes/External/Projects/vigo-admin"
fi

ensure_docker() {
  if ! docker info >/dev/null 2>&1; then
    if [ "$(uname -s)" = "Darwin" ]; then
      echo ">>> Đang bật Docker Desktop..."
      open -a Docker
      for _ in {1..30}; do
        if docker info >/dev/null 2>&1; then
          echo ">>> Docker đã sẵn sàng."
          return 0
        fi
        sleep 2
      done
    fi
    echo "LỖI: Docker chưa chạy hoặc user chưa có quyền docker." >&2
    exit 1
  fi
}

deploy_backend() {
  echo "============================================================"
  echo ">>> [BACKEND] Kéo code mới nhất origin/main (${BACKEND_DIR})..."
  echo "============================================================"
  ensure_docker
  cd "$BACKEND_DIR"
  git fetch origin main
  git checkout -f main
  git reset --hard origin/main

  local sha8
  sha8="$(git rev-parse --short=8 HEAD)"
  local img="docker.io/library/vigo-backend:rel-${sha8}"
  echo ">>> [BACKEND] Build image ${img} (commit $(git log -1 --oneline))..."
  if docker buildx version >/dev/null 2>&1; then
    docker buildx build --platform linux/amd64 --provenance=false --load -t "$img" .
  else
    DOCKER_BUILDKIT=1 docker build --platform linux/amd64 -t "$img" .
  fi

  for node in "${K3S_NODES[@]}"; do
    echo ">>> [BACKEND] Nạp ${img} lên node ${node}..."
    docker save "$img" | gzip | ssh -o StrictHostKeyChecking=no "vigoops@${node}" "gunzip | sudo k3s ctr images import -"
  done

  echo ">>> [BACKEND] Rollout trên cụm k3s PROD..."
  ssh -o StrictHostKeyChecking=no "vigoops@${K3S_NODES[0]}" "
    sudo k3s kubectl -n vigo set image deployment/vigo-api vigo-backend=${img} &&
    sudo k3s kubectl -n vigo set image cronjob/vigo-check-drivers *=${img} &&
    sudo k3s kubectl -n vigo set image cronjob/vigo-handle-bookings *=${img} &&
    sudo k3s kubectl -n vigo set image cronjob/vigo-scan-pooling *=${img} &&
    sudo k3s kubectl -n vigo rollout status deployment/vigo-api --timeout=180s
  "

  echo ">>> [BACKEND] Kiểm tra health PROD:"
  curl -fsS https://api.vigogroup.vn/health/deep && echo ""
  echo ">>> [BACKEND] HOÀN TẤT (${img})!"
}

deploy_admin() {
  echo "============================================================"
  echo ">>> [ADMIN] Chuẩn bị bản phát hành origin/main (${ADMIN_DIR})..."
  echo "============================================================"
  if [ ! -f "$CF_ENV" ]; then
    echo "LỖI: Không tìm thấy $CF_ENV" >&2
    exit 1
  fi

  cd "$ADMIN_DIR"
  git fetch origin main
  git checkout -f main
  git reset --hard origin/main
  npm run release:prepare

  local prep_wt
  prep_wt="$(ls -dt /private/var/folders/*/*/T/vigo-admin-release.* /tmp/vigo-admin-release.* 2>/dev/null | head -n 1 || true)"
  if [ -z "$prep_wt" ] || [ ! -d "$prep_wt" ]; then
    echo "LỖI: Không tìm thấy worktree vừa prepare." >&2
    exit 1
  fi

  echo ">>> [ADMIN] Đẩy 4 cổng (admin, htx, kol, daily) lên Cloudflare Pages từ ${prep_wt}..."
  (
    set -a
    # shellcheck disable=SC1090
    source "$CF_ENV"
    set +a
    cd "$prep_wt"
    env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_SESSION_ID -u AI_AGENT \
      npx tsx scripts/deploy-pages.ts
  )

  bash "$ADMIN_DIR/scripts/release-prod.sh" verify --dir "$prep_wt"
  bash "$ADMIN_DIR/scripts/release-prod.sh" cleanup --dir "$prep_wt"
  echo ">>> [ADMIN] HOÀN TẤT!"
}

case "$TARGET" in
  backend)
    deploy_backend
    ;;
  admin)
    deploy_admin
    ;;
  all)
    deploy_backend
    deploy_admin
    ;;
  *)
    echo "Cách dùng: $0 [all|backend|admin]" >&2
    exit 1
    ;;
esac
