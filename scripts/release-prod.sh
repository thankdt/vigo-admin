#!/usr/bin/env bash
# Phát hành vigo-admin lên PROD (4 project Cloudflare Pages: vigo-admin | vigo-htx | vigo-kol | vigo-daily) CÓ RÀO.
# Quy trình đầy đủ + lý do từng rào: docs/DEPLOY.md. Hàm thuần: scripts/release-lib.ts (qua scripts/release-cli.ts).
#
#   prepare [--ref origin/main] [--allow-ref <ref>] [--first-ship]   AI chạy được — KHÔNG cần token, không đẩy gì lên PROD
#   ship [--dir <worktree>] [--allow-ref] [--first-ship]             CHỈ NGƯỜI, terminal thật, gõ cụm xác nhận
#   verify [--dir <worktree> | --sha <sha40>]                        AI chạy được — chỉ GET công khai 4 tên miền
#   cleanup --dir <worktree>                                         gỡ worktree tạm do prepare tạo
#   rollback-help                                                    in cách lùi bản trên Cloudflare
#
# Nền tảng: macOS/Linux, bash ≥ 3.2. Windows: chỉ qua WSL đầy đủ (Git Bash báo mode tệp sai ⇒ ship từ chối token).
# Mã thoát: 0 đạt · 1 dừng (rào chặn / lỗi) — thông báo nói rõ rào nào.
set -euo pipefail
umask 077

PROD_BUILD_ID_URL='https://admin.vigogroup.vn/build-id.txt'
HOSTS='admin.vigogroup.vn htx.vigogroup.vn kol.vigogroup.vn daily.vigogroup.vn'
CONFIRM_WORD='DAY-ADMIN-PROD'
TOKEN_FILE="${HOME}/.config/vigo/cloudflare.env"
WT_PREFIX='vigo-admin-release.'
VERIFY_ATTEMPTS=6
VERIFY_SLEEP="${RELEASE_VERIFY_SLEEP:-5}"
case "$VERIFY_SLEEP" in '' | *[!0-9]*) VERIFY_SLEEP=5 ;; esac

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
CLI="$SCRIPT_DIR/release-cli.ts"
ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null) || {
  echo "✗ $SCRIPT_DIR không nằm trong repo git" >&2
  exit 1
}
ROOT=$(cd "$ROOT" && pwd -P)

red() { if [ -t 2 ]; then printf '\033[31m%s\033[0m\n' "$*" >&2; else printf '%s\n' "$*" >&2; fi; }
die() { red "✗ $*"; exit 1; }
step() { printf '\n== %s\n' "$*"; }
ok() { printf '  ✓ %s\n' "$*"; }

is_sha40() { [[ $1 =~ ^[0-9a-f]{40}$ ]]; }

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

rollback_help() {
  cat <<'EOF'

Lùi bản (NGƯỜI làm, cả 4 project — chúng độc lập nhau):
  Cloudflare Dashboard → Workers & Pages → vigo-admin | vigo-htx | vigo-kol | vigo-daily
    → Deployments → chọn bản trước → Rollback (làm cả 4)
  Sau đó: scripts/release-prod.sh verify   (build-id.txt trên admin. phải là sha của bản cũ)
EOF
}

# --- Rào "PROD có code chưa vào ref đích" -------------------------------------------------------------------
# Đọc /build-id.txt công khai trên admin.vigogroup.vn. Pages trả index.html (200) cho URL không có tệp, nên chỉ nhận
# đúng 40 hex (cùng luật với parseBuildId/prodGate ở release-lib.ts — sửa thì sửa cả hai).
PROD_SHA=''
read_prod_sha() {
  local body t
  body=$(curl -fsS --max-time 15 "${PROD_BUILD_ID_URL}?t=$(date +%s)" 2>/dev/null || true)
  t=$(printf '%s' "$body" | tr -d '[:space:]')
  if is_sha40 "$t"; then PROD_SHA=$t; else PROD_SHA=''; fi
}

prod_gate() { # $1 = sha đích, $2 = 1 nếu người đã xác nhận --first-ship
  read_prod_sha
  if [ -n "$PROD_SHA" ]; then
    git -C "$ROOT" cat-file -e "${PROD_SHA}^{commit}" 2>/dev/null ||
      die "PROD đang chạy $PROD_SHA nhưng commit này không có trong repo cục bộ — PROD có code chưa vào main? (thử \`git fetch origin\`; vẫn thiếu thì DỪNG, hỏi người đã ship bản đó)"
    git -C "$ROOT" merge-base --is-ancestor "$PROD_SHA" "$1" ||
      die "PROD đang chạy $PROD_SHA — KHÔNG phải tổ tiên của $1. Ship bản này sẽ XOÁ code đang chạy trên PROD. DỪNG: đưa code đó vào main trước."
    ok "PROD $PROD_SHA là tổ tiên của bản đích"
  elif [ "$2" = 1 ]; then
    red "⚠ PROD chưa có build-id.txt (lần ship đầu theo đường này). --first-ship = NGƯỜI xác nhận ref đích đã chứa MỌI THỨ"
    red "  đang chạy trên PROD (vd «Tìm nhanh» 4d360e4). Không chắc ⇒ dừng lại và hỏi người ship bản trước."
  else
    die "không đọc được build-id.txt hợp lệ từ $PROD_BUILD_ID_URL — lần ship đầu? NGƯỜI kiểm main đã chứa mọi thứ đang chạy trên PROD (vd «Tìm nhanh» 4d360e4) rồi chạy lại với --first-ship"
  fi
}

# --- worktree phát hành ------------------------------------------------------------------------------------
resolve_worktree() { # in đường dẫn thật nếu $1 là worktree phát hành của repo này, không thì báo lỗi (gọi: x=$(resolve_worktree d) || exit 1)
  local want line p
  [ -d "$1" ] || die "không có thư mục $1"
  want=$(cd "$1" && pwd -P)
  [ "$want" != "$ROOT" ] || die "$1 là checkout đang dùng, không phải worktree phát hành do prepare tạo"
  case "$(basename "$want")" in "$WT_PREFIX"*) ;; *) die "$1 không phải worktree do prepare tạo (tên phải bắt đầu bằng $WT_PREFIX)" ;; esac
  while IFS= read -r line; do
    case "$line" in
      worktree\ *)
        p=${line#worktree }
        if [ -d "$p" ] && [ "$(cd "$p" && pwd -P)" = "$want" ]; then
          printf '%s\n' "$want"
          return 0
        fi
        ;;
    esac
  done <<EOF
$(git -C "$ROOT" worktree list --porcelain)
EOF
  die "$1 không có trong \`git worktree list\` của $ROOT"
}

find_single_worktree() { # dùng khi ship/verify không có --dir: đúng 1 worktree phát hành thì lấy nó
  local line p found='' n=0
  while IFS= read -r line; do
    case "$line" in
      worktree\ *)
        p=${line#worktree }
        case "$(basename "$p")" in "$WT_PREFIX"*) found=$p; n=$((n + 1)) ;; esac
        ;;
    esac
  done <<EOF
$(git -C "$ROOT" worktree list --porcelain)
EOF
  [ "$n" -eq 1 ] || die "có $n worktree phát hành — chỉ rõ --dir <đường-dẫn> (xem \`git worktree list\`)"
  printf '%s\n' "$found"
}

# --- prepare -----------------------------------------------------------------------------------------------
PREP_WT=''
prepare_exit_hint() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ -n "$PREP_WT" ]; then
    red "prepare dừng (mã $rc). Worktree tạm còn ở $PREP_WT — dọn: scripts/release-prod.sh cleanup --dir $PREP_WT"
  fi
}

cmd_prepare() {
  local ref=origin/main allow_ref= first_ship=0 main_sha target_sha allow=0 wt base f p n baseline tsc_rc
  while [ $# -gt 0 ]; do
    case "$1" in
      --ref) [ $# -ge 2 ] || die "--ref cần giá trị"; ref=$2; shift 2 ;;
      --allow-ref) [ $# -ge 2 ] || die "--allow-ref cần giá trị (ref muốn build)"; allow_ref=$2; shift 2 ;;
      --first-ship) first_ship=1; shift ;;
      *) die "prepare: tham số lạ '$1'" ;;
    esac
  done
  if [ -n "$allow_ref" ]; then
    [ "$ref" = origin/main ] || [ "$ref" = "$allow_ref" ] || die "--ref '$ref' và --allow-ref '$allow_ref' khác nhau"
    ref=$allow_ref
  fi
  case "$ref" in -*) die "ref không được bắt đầu bằng '-': $ref" ;; esac

  step "1/9 cây làm việc sạch ($ROOT)"
  [ -z "$(git -C "$ROOT" status --porcelain)" ] || die "cây làm việc không sạch — commit/stash trước (script và lib chạy từ chính cây này)"
  ok "sạch"

  step "2/9 git fetch origin main"
  git -C "$ROOT" fetch --quiet origin main || die "git fetch origin main thất bại"
  main_sha=$(git -C "$ROOT" rev-parse --verify --quiet 'refs/remotes/origin/main^{commit}') || die "không có refs/remotes/origin/main"
  target_sha=$(git -C "$ROOT" rev-parse --verify --quiet "${ref}^{commit}") || die "ref '$ref' không tồn tại (ref nhánh khác: tự \`git fetch origin <nhánh>\` trước)"
  if [ "$target_sha" != "$main_sha" ]; then
    [ -n "$allow_ref" ] || die "ref đích $ref ($target_sha) ≠ origin/main ($main_sha). PROD chỉ build từ origin/main; muốn khác phải --allow-ref <ref>"
    red "⚠⚠ --allow-ref: build $ref ($target_sha) KHÁC origin/main ($main_sha). Bản này đưa lên PROD code chưa vào main —"
    red "   lần ship sau từ main sẽ bị rào chặn cho tới khi code này vào main. Ghi vào build-info (allowRef=true)."
    allow=1
  fi
  ok "đích $ref = $target_sha"

  step "3/9 rào PROD: bản đang chạy phải là tổ tiên của bản đích"
  prod_gate "$target_sha" "$first_ship"

  step "4/9 worktree tạm (không symlink node_modules)"
  base=${TMPDIR:-/tmp}
  base=${base%/}
  wt=$(mktemp -d "$base/${WT_PREFIX}XXXXXX") || die "mktemp thất bại"
  PREP_WT=$(cd "$wt" && pwd -P)
  trap prepare_exit_hint EXIT
  if ! git -C "$ROOT" worktree add --quiet --detach "$PREP_WT" "$target_sha"; then
    rmdir "$PREP_WT" 2>/dev/null || true
    PREP_WT=''
    die "git worktree add thất bại"
  fi
  ok "$PREP_WT @ $target_sha"
  mkdir -p "$PREP_WT/.release"

  step "5/9 npm ci + bản vá next + npm ls"
  (cd "$PREP_WT" && npm ci --no-audit --no-fund) || die "npm ci thất bại"
  n=0
  for f in "$PREP_WT"/patches/next+*.patch; do
    [ -f "$f" ] || continue
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      grep -F '[vigo patch]' "$PREP_WT/$p" >/dev/null 2>&1 || die "thiếu marker [vigo patch] ở $p — patch-package không áp? (bundle sẽ lộ RSC payload khi điều hướng lỗi)"
      n=$((n + 1))
    done <<EOF
$(sed -n 's#^+++ b/##p' "$f")
EOF
  done
  [ "$n" -ge 2 ] || die "chỉ thấy $n tệp vá của next (cần cả bản CJS và ESM) — kiểm patches/next+*.patch"
  ok "marker [vigo patch] có ở $n tệp của next"
  if (cd "$PREP_WT" && npm ls --all 2>&1 || true) | grep -E '(^|[[:space:]])invalid([[:space:]:]|$)' >/dev/null; then
    die "npm ls --all báo 'invalid' — cây phụ thuộc lệch package-lock (đúng kiểu lỗi node_modules cũ làm hỏng bundle PROD)"
  fi
  ok "npm ls: không có invalid"

  step "6/9 next build (KHÔNG có NEXT_PUBLIC_API_BASE_URL ⇒ API PROD)"
  (cd "$PREP_WT" && env -u NEXT_PUBLIC_API_BASE_URL npx next build) || die "next build thất bại"
  (cd "$PREP_WT" && npx tsx "$CLI" scan-bundle out) || die "bundle không đạt"

  step "7/9 cổng: npm test, npm run test:pages, npm run typecheck (so baseline)"
  (cd "$PREP_WT" && npm test -- --maxWorkers=50%) || die "npm test đỏ"
  (cd "$PREP_WT" && npm run test:pages) || die "npm run test:pages đỏ"
  tsc_rc=0
  (cd "$PREP_WT" && npm run typecheck) >"$PREP_WT/.release/typecheck.txt" 2>&1 || tsc_rc=$?
  baseline="$PREP_WT/scripts/typecheck-baseline.txt"
  [ -f "$baseline" ] || baseline="$SCRIPT_DIR/typecheck-baseline.txt"
  (cd "$PREP_WT" && npx tsx "$CLI" typecheck "$baseline" "$PREP_WT/.release/typecheck.txt" "$tsc_rc") ||
    die "typecheck có lỗi MỚI (toàn văn: $PREP_WT/.release/typecheck.txt)"

  step "8/9 ghi out/build-id.txt (công khai, chỉ sha) + .release/build-info.json (ngoài out/)"
  (cd "$PREP_WT" && npx tsx "$CLI" build-info-write "$PREP_WT" "$target_sha" "$ref" "$allow" "$first_ship" "${PROD_SHA:--}") ||
    die "ghi build-info thất bại"

  step "9/9 deploy-pages.ts --dry-run (dựng .pages-dist/<cổng>, KHÔNG đẩy)"
  (cd "$PREP_WT" && npx tsx scripts/deploy-pages.ts --dry-run) || die "dry-run thất bại"

  trap - EXIT
  local flags=''
  [ "$allow" = 1 ] && flags="$flags --allow-ref"
  [ "$first_ship" = 1 ] && flags="$flags --first-ship"
  cat <<EOF

PREPARE XONG — chưa có gì lên PROD.
  worktree : $PREP_WT
  sha      : $target_sha ($ref)

Bước tiếp — CHỈ NGƯỜI có token Cloudflare, trên terminal thật (AI KHÔNG chạy):
  cd $ROOT && npm run deploy:prod -- --dir $PREP_WT$flags
Sau đó dọn:
  scripts/release-prod.sh cleanup --dir $PREP_WT
EOF
}

# --- ship (CHỈ NGƯỜI) --------------------------------------------------------------------------------------
refuse_agent_env() {
  local v
  for v in CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_SESSION_ID AI_AGENT; do
    if [ -n "${!v:-}" ]; then
      die "ship từ chối: đang chạy trong môi trường tác tử AI (biến $v có giá trị). ship CHỈ cho NGƯỜI, trên terminal thật — AI dừng ở prepare/verify và đưa lệnh cho người."
    fi
  done
}

file_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then stat -c '%a' "$1"; else stat -f '%Lp' "$1"; fi
}

read_kv() { # $1 khoá, $2 tệp — parse bằng grep, KHÔNG source (tệp không được chạy như mã)
  local line
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1=" "$2" 2>/dev/null | sed -n '$p' || true)
  line=${line#*=}
  line=${line%$'\r'}
  if [ "${#line}" -ge 2 ]; then
    case "$line" in
      \"*\" | \'*\') line=${line:1:${#line}-2} ;;
    esac
  fi
  printf '%s' "$line"
}

CF_TOKEN=''
CF_ACCOUNT=''
load_token() {
  local mode
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    CF_TOKEN=$CLOUDFLARE_API_TOKEN
    CF_ACCOUNT=$CLOUDFLARE_ACCOUNT_ID
    ok "token lấy từ biến môi trường"
  else
    [ -e "$TOKEN_FILE" ] || die "không có CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID trong env và không có $TOKEN_FILE (mẫu: cloudflare-config.template; chmod 600)"
    [ ! -L "$TOKEN_FILE" ] || die "$TOKEN_FILE là symlink — từ chối; đặt tệp thật, chmod 600"
    mode=$(file_mode "$TOKEN_FILE")
    case "$mode" in
      *00) ;;
      *) die "$TOKEN_FILE có mode $mode — phải chỉ chủ sở hữu đọc được: chmod 600 \"$TOKEN_FILE\"" ;;
    esac
    CF_TOKEN=$(read_kv CLOUDFLARE_API_TOKEN "$TOKEN_FILE")
    CF_ACCOUNT=$(read_kv CLOUDFLARE_ACCOUNT_ID "$TOKEN_FILE")
    [ -n "$CF_TOKEN" ] && [ -n "$CF_ACCOUNT" ] || die "$TOKEN_FILE thiếu CLOUDFLARE_API_TOKEN hoặc CLOUDFLARE_ACCOUNT_ID"
    ok "token lấy từ $TOKEN_FILE (mode $mode)"
  fi
  # Chỉ deploy-pages.ts nhận token (truyền inline); mọi tiến trình con khác chạy không có nó.
  unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
}

require_tty() {
  [ -t 0 ] && [ -t 1 ] || die "ship cần terminal thật (stdin/stdout là TTY) — không chạy qua pipe/CI/tác tử."
  { : </dev/tty; } 2>/dev/null || die "không mở được /dev/tty"
}

cmd_ship() {
  local dir='' allow_flag=0 first_ship=0 head main_sha allow_rec ans
  refuse_agent_env
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir) [ $# -ge 2 ] || die "--dir cần giá trị"; dir=$2; shift 2 ;;
      --allow-ref) allow_flag=1; shift ;;
      --first-ship) first_ship=1; shift ;;
      *) die "ship: tham số lạ '$1'" ;;
    esac
  done

  step "1/6 token Cloudflare"
  load_token
  step "2/6 terminal thật"
  require_tty
  ok "TTY"

  step "3/6 worktree phát hành"
  [ -n "$dir" ] || dir=$(find_single_worktree) || exit 1
  dir=$(resolve_worktree "$dir") || exit 1
  head=$(git -C "$dir" rev-parse HEAD)
  [ -z "$(git -C "$dir" status --porcelain --untracked-files=no)" ] || die "worktree $dir có tệp đã track bị sửa sau prepare — chạy lại prepare"
  (cd "$dir" && npx tsx "$CLI" build-info-check "$dir" "$head") || die "build-info không khớp — chạy lại prepare"
  ok "$dir @ $head"

  step "4/6 bản đích so với origin/main + rào PROD"
  git -C "$ROOT" fetch --quiet origin main || die "git fetch origin main thất bại"
  main_sha=$(git -C "$ROOT" rev-parse --verify --quiet 'refs/remotes/origin/main^{commit}') || die "không có refs/remotes/origin/main"
  allow_rec=$(cd "$dir" && npx tsx "$CLI" build-info-get "$dir" allowRef) || die "không đọc được build-info"
  if [ "$head" != "$main_sha" ]; then
    [ "$allow_flag" = 1 ] && [ "$allow_rec" = true ] ||
      die "bản đích $head ≠ origin/main hiện tại $main_sha (main đã đi tiếp? chạy lại prepare). Cố ý ship ref khác main: prepare --allow-ref rồi ship --allow-ref."
    red "⚠⚠ ship bản KHÁC origin/main ($head) theo --allow-ref"
  fi
  prod_gate "$head" "$first_ship"

  step "5/6 xác nhận"
  printf '\nSắp đẩy %s lên 4 project PROD: %s\nGõ %s để tiếp tục (khác ⇒ huỷ): ' "$head" "$HOSTS" "$CONFIRM_WORD" >/dev/tty
  IFS= read -r ans </dev/tty || ans=''
  [ "$ans" = "$CONFIRM_WORD" ] || die "huỷ — không có gì được đẩy"

  step "6/6 deploy-pages.ts (wrangler ghim bản) rồi verify"
  if ! (cd "$dir" && CLOUDFLARE_API_TOKEN="$CF_TOKEN" CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT" npx tsx scripts/deploy-pages.ts); then
    red "✗ deploy-pages.ts lỗi — có thể đã đẩy MỘT PHẦN cổng. Kiểm 4 cổng bằng verify; cần thì lùi:"
    rollback_help
    exit 1
  fi
  CF_TOKEN=''
  CF_ACCOUNT=''
  if ! cmd_verify --sha "$head"; then
    red "✗ verify chưa đạt — chờ vài phút rồi chạy lại: scripts/release-prod.sh verify --sha $head"
    rollback_help
    exit 1
  fi
  printf '\nSHIP XONG: %s trên 4 cổng. Dọn: scripts/release-prod.sh cleanup --dir %s\n' "$head" "$dir"
  rollback_help
}

# --- verify (AI chạy được: chỉ GET công khai) ----------------------------------------------------------------
check_host() { # $1 host, $2 sha mong đợi ('' = không so); trả 0 nếu đạt
  local host=$1 want=$2 ts body chunk id
  ts=$(date +%s)
  body=$(curl -fsSL --max-time 15 "https://$host/?t=$ts" 2>/dev/null) || { echo "    $host: GET / lỗi"; return 1; }
  chunk=$(printf '%s' "$body" | grep -Eo '/_next/static/[^"'"'"' <>)]+\.js' | sed -n '1p' || true)
  [ -n "$chunk" ] || { echo "    $host: index.html không có chunk /_next/static/…"; return 1; }
  curl -fsSL --max-time 15 -o /dev/null "https://$host$chunk" 2>/dev/null || { echo "    $host: chunk $chunk lỗi"; return 1; }
  if [ "$host" = admin.vigogroup.vn ]; then
    id=$(curl -fsS --max-time 15 "https://$host/build-id.txt?t=$ts" 2>/dev/null | tr -d '[:space:]' || true)
    if [ -n "$want" ]; then
      [ "$id" = "$want" ] || { echo "    $host: build-id.txt = '${id:0:40}' ≠ $want"; return 1; }
    else
      echo "    $host: build-id.txt = '${id:0:40}' (không so — thiếu --sha/--dir)"
    fi
  fi
  return 0
}

cmd_verify() {
  local dir='' want='' host i failed=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir) [ $# -ge 2 ] || die "--dir cần giá trị"; dir=$2; shift 2 ;;
      --sha) [ $# -ge 2 ] || die "--sha cần giá trị"; want=$2; shift 2 ;;
      *) die "verify: tham số lạ '$1'" ;;
    esac
  done
  if [ -n "$want" ]; then
    is_sha40 "$want" || die "--sha phải đúng 40 hex"
  elif [ -n "$dir" ]; then
    dir=$(resolve_worktree "$dir") || exit 1
    [ -f "$dir/out/build-id.txt" ] || die "thiếu $dir/out/build-id.txt"
    want=$(tr -d '[:space:]' <"$dir/out/build-id.txt")
    is_sha40 "$want" || die "$dir/out/build-id.txt không phải sha 40 hex"
  fi
  step "verify 4 cổng${want:+ (mong đợi $want)}"
  for host in $HOSTS; do
    i=1
    while :; do
      if check_host "$host" "$want"; then
        ok "$host"
        break
      fi
      if [ "$i" -ge "$VERIFY_ATTEMPTS" ]; then
        failed="$failed $host"
        break
      fi
      i=$((i + 1))
      sleep "$VERIFY_SLEEP"
    done
  done
  if [ -n "$failed" ]; then
    red "✗ verify chưa đạt:$failed"
    return 1
  fi
  ok "4 cổng đạt"
}

# --- cleanup ------------------------------------------------------------------------------------------------
cmd_cleanup() {
  local dir=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir) [ $# -ge 2 ] || die "--dir cần giá trị"; dir=$2; shift 2 ;;
      *) die "cleanup: tham số lạ '$1'" ;;
    esac
  done
  [ -n "$dir" ] || die "cleanup cần --dir <worktree>"
  dir=$(resolve_worktree "$dir") || exit 1
  git -C "$ROOT" worktree remove --force "$dir" || die "git worktree remove thất bại"
  git -C "$ROOT" worktree prune
  ok "đã gỡ $dir"
}

main() {
  local sub=${1:-}
  [ $# -eq 0 ] || shift
  case "$sub" in
    prepare) cmd_prepare "$@" ;;
    ship) cmd_ship "$@" ;;
    verify) cmd_verify "$@" ;;
    cleanup) cmd_cleanup "$@" ;;
    rollback-help) rollback_help ;;
    -h | --help | help) usage ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
