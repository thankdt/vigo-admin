#!/usr/bin/env bash
# Phát hành vigo-admin lên PROD (4 project Cloudflare Pages: vigo-admin | vigo-htx | vigo-kol | vigo-daily) CÓ RÀO.
# Quy trình đầy đủ + lý do từng rào: docs/DEPLOY.md. Hàm thuần: scripts/release-lib.ts (qua scripts/release-cli.ts).
#
#   prepare [--ref origin/main] [--allow-ref <ref>] [--first-ship]   KHÔNG cần token, không đẩy gì (2 cờ là của NGƯỜI)
#   ship [--dir <wt>] [--allow-ref] [--first-ship] [--preflight]      CHỈ NGƯỜI, terminal thật, gõ cụm xác nhận
#   verify [--dir <worktree> | --sha <sha40>]                        AI chạy được — chỉ GET công khai 4 tên miền
#   cleanup --dir <worktree>                                         gỡ worktree tạm do prepare tạo
#   rollback-help                                                    in cách lùi bản trên Cloudflare
# Các kiểm của ship (môi trường AI, TTY, cụm xác nhận) là CHỐNG LỠ TAY, không phải rào chống tác tử cố ý (cùng uid).
# Nền tảng: macOS/Linux, bash ≥ 3.2. Windows: chỉ qua WSL đầy đủ (Git Bash báo mode tệp sai ⇒ ship từ chối token).
# Mã thoát: 0 đạt · 1 dừng (rào chặn / lỗi) — thông báo nói rõ rào nào.
set -euo pipefail
umask 077

PROD_BUILD_ID_URL='https://admin.vigogroup.vn/build-id.txt'
HOSTS='admin.vigogroup.vn htx.vigogroup.vn kol.vigogroup.vn daily.vigogroup.vn'
CONFIRM_WORD='DAY-ADMIN-PROD'
CONFIRM_WORD_OFF_MAIN='DAY-ADMIN-NGOAI-MAIN' # ship bản KHÁC origin/main (--allow-ref) đòi cụm KHÁC — không gõ theo thói quen được
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
  Sau đó: scripts/release-prod.sh verify --sha <sha bản cũ>   (build-id.txt của CẢ 4 cổng phải là sha đó;
          không có --sha thì verify lấy build-id của admin làm chuẩn và đòi 3 cổng kia trùng)
EOF
}

# --- Rào "PROD có code chưa vào ref đích" -------------------------------------------------------------------
# Đọc /build-id.txt công khai trên admin.vigogroup.vn. Pages trả index.html (200) cho URL không có tệp, nên chỉ nhận
# đúng 40 hex. Bản duy nhất của luật này (test: release-prod.node.test.ts).
PROD_SHA=''
read_prod_sha() {
  local body t
  body=$(curl -fsS --max-time 15 "${PROD_BUILD_ID_URL}?t=$(date +%s)" 2>/dev/null || true)
  t=$(printf '%s' "$body" | tr -d '[:space:]')
  if is_sha40 "$t"; then PROD_SHA=$t; else PROD_SHA=''; fi
}

prod_gate() { # $1 = sha đích, $2 = 1 nếu NGƯỜI đã xác nhận --first-ship
  read_prod_sha
  if [ -n "$PROD_SHA" ]; then
    git -C "$ROOT" cat-file -e "${PROD_SHA}^{commit}" 2>/dev/null ||
      die "PROD đang chạy $PROD_SHA nhưng commit này không có trong repo cục bộ — PROD có code chưa vào main? (thử \`git fetch origin\`; nhánh đã xoá sau khi merge: \`git fetch origin '+refs/pull/*/head:refs/remotes/origin/pr/*'\`; vẫn thiếu thì DỪNG, hỏi người đã ship bản đó)"
    if git -C "$ROOT" merge-base --is-ancestor "$PROD_SHA" "$1"; then
      ok "PROD $PROD_SHA là tổ tiên của bản đích"
    elif [ "$2" = 1 ]; then
      red "⚠⚠ PROD đang chạy $PROD_SHA — KHÔNG phải tổ tiên của $1. Đi tiếp vì --first-ship = NGƯỜI đã so tay và xác nhận"
      red "   bản đích chứa MỌI THỨ đang chạy trên PROD (vd nhánh từng ship bằng --allow-ref rồi bị squash/rebase-merge vào main)."
    else
      die "PROD đang chạy $PROD_SHA — KHÔNG phải tổ tiên của $1. Ship bản này có thể XOÁ code đang chạy trên PROD. DỪNG.
  Thường gặp: nhánh từng ship bằng --allow-ref đã được squash/rebase-merge (sha cũ không bao giờ thành tổ tiên).
  Lối thoát DUY NHẤT — NGƯỜI (AI không dùng cờ này): so tay \`git diff $PROD_SHA $1 --stat\` và \`git log --oneline $1..$PROD_SHA\`,
  chắc chắn mọi thay đổi đang chạy trên PROD đã có trong bản đích, rồi chạy lại với --first-ship."
    fi
  elif [ "$2" = 1 ]; then
    red "⚠ PROD chưa có build-id.txt (lần ship đầu theo đường này). --first-ship = NGƯỜI xác nhận ref đích đã chứa MỌI THỨ"
    red "  đang chạy trên PROD (vd «Tìm nhanh» 4d360e4). Không chắc ⇒ dừng lại và hỏi người ship bản trước."
  else
    die "không đọc được build-id.txt hợp lệ từ $PROD_BUILD_ID_URL — lần ship đầu? NGƯỜI kiểm main đã chứa mọi thứ đang chạy trên PROD (vd «Tìm nhanh» 4d360e4) rồi chạy lại với --first-ship"
  fi
}

# --- worktree phát hành ------------------------------------------------------------------------------------
resolve_worktree() { # in đường dẫn thật nếu $1 là worktree phát hành của repo này, không thì báo lỗi (gọi: x=$(resolve_worktree d) || exit 1)
  # ROOT có thể CHÍNH LÀ worktree phát hành: lệnh ship mà prepare in ra chạy bản script nằm TRONG worktree đó.
  local want line p
  [ -d "$1" ] || die "không có thư mục $1"
  want=$(cd "$1" && pwd -P)
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
    red "prepare dừng (mã $rc) — worktree này KHÔNG ship được (chưa có .release/build-info.json). Dọn: $(cleanup_cmd "$PREP_WT")"
  fi
}

main_worktree() { git -C "$ROOT" worktree list --porcelain | sed -n '1s/^worktree //p'; }
cleanup_cmd() { # $1 worktree phát hành. Script đang chạy TỪ chính worktree đó (lệnh ship in ra) ⇒ in lệnh git trần.
  if [ "$1" = "$ROOT" ]; then
    printf 'git -C %q worktree remove --force %q' "$(main_worktree)" "$1"
  else
    printf 'bash %q cleanup --dir %q' "$ROOT/scripts/release-prod.sh" "$1"
  fi
}

cmd_prepare() {
  local ref=origin/main allow_ref= first_ship=0 main_sha target_sha allow=0 wt base f p n baseline tsc_rc ship_cmd
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

  step "1/10 cây làm việc sạch ($ROOT)"
  [ -z "$(git -C "$ROOT" status --porcelain)" ] || die "cây làm việc không sạch — commit/stash trước (script và lib chạy từ chính cây này)"
  ok "sạch"

  step "2/10 git fetch origin main"
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

  step "3/10 rào PROD: bản đang chạy phải là tổ tiên của bản đích"
  prod_gate "$target_sha" "$first_ship"

  step "4/10 worktree tạm (không symlink node_modules)"
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

  step "5/10 npm ci + bản vá next + npm ls"
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

  step "6/10 next build (KHÔNG có NEXT_PUBLIC_API_BASE_URL ⇒ API PROD)"
  (cd "$PREP_WT" && env -u NEXT_PUBLIC_API_BASE_URL npx next build) || die "next build thất bại"
  (cd "$PREP_WT" && npx tsx "$CLI" scan-bundle out) || die "bundle không đạt"

  step "7/10 cổng: npm test, npm run test:pages, npm run typecheck (so baseline)"
  (cd "$PREP_WT" && npm test -- --maxWorkers=50%) || die "npm test đỏ"
  (cd "$PREP_WT" && npm run test:pages) || die "npm run test:pages đỏ"
  tsc_rc=0
  (cd "$PREP_WT" && npm run typecheck) >"$PREP_WT/.release/typecheck.txt" 2>&1 || tsc_rc=$?
  baseline="$PREP_WT/scripts/typecheck-baseline.txt"
  [ -f "$baseline" ] || baseline="$SCRIPT_DIR/typecheck-baseline.txt"
  (cd "$PREP_WT" && npx tsx "$CLI" typecheck "$baseline" "$PREP_WT/.release/typecheck.txt" "$tsc_rc") ||
    die "typecheck có lỗi MỚI (toàn văn: $PREP_WT/.release/typecheck.txt)"

  step "8/10 ghi out/build-id.txt (công khai, chỉ sha)"
  (cd "$PREP_WT" && npx tsx "$CLI" build-id-write "$PREP_WT" "$target_sha") || die "ghi build-id.txt thất bại"

  step "9/10 deploy-pages.ts --dry-run (dựng .pages-dist/<cổng>, KHÔNG đẩy)"
  (cd "$PREP_WT" && npx tsx scripts/deploy-pages.ts --dry-run) || die "dry-run thất bại"

  # build-info.json là "vé" để ship: ghi SAU CÙNG, để prepare chết ở bất kỳ bước nào trước đó thì worktree không ship được.
  step "10/10 ghi .release/build-info.json (ngoài out/) — bước cuối"
  (cd "$PREP_WT" && npx tsx "$CLI" build-info-write "$PREP_WT" "$target_sha" "$ref" "$allow" "$first_ship" "${PROD_SHA:--}") ||
    die "ghi build-info thất bại"

  trap - EXIT
  # Lệnh ship chạy bản script NẰM TRONG worktree (đúng bản vừa prepare) — checkout chính có đổi nhánh (nhánh cũ: build =
  # deploy, deploy:prod bỏ qua --dir) thì lệnh này vẫn đúng; nhánh không có script ⇒ lỗi to, không deploy.
  # KHÔNG tự kèm --allow-ref/--first-ship: đó là lời xác nhận của NGƯỜI, người tự gõ thêm sau khi tự kiểm.
  ship_cmd=$(printf 'bash %q ship --dir %q' "$PREP_WT/scripts/release-prod.sh" "$PREP_WT")
  cat <<EOF

PREPARE XONG — chưa có gì lên PROD.
  worktree : $PREP_WT
  sha      : $target_sha ($ref)

Bước tiếp — CHỈ NGƯỜI, trên terminal thật (AI KHÔNG chạy). Khuyến nghị: người ship tự chạy prepare trên máy mình
rồi ship worktree của chính mình, thay vì ship worktree do AI chuẩn bị (docs/DEPLOY.md §3.2).
  $ship_cmd
EOF
  if [ "$allow" = 1 ]; then
    red "  ⚠ bản này KHÁC origin/main: ship sẽ dừng trừ khi NGƯỜI tự thêm --allow-ref (và gõ $CONFIRM_WORD_OFF_MAIN)."
  fi
  if [ "$first_ship" = 1 ]; then
    red "  ⚠ prepare dùng --first-ship: ship cũng cần --first-ship — NGƯỜI tự thêm sau khi tự kiểm lại lời xác nhận đó."
  fi
  cat <<EOF
Sau đó dọn:
  $(cleanup_cmd "$PREP_WT")
EOF
}

# --- ship (CHỈ NGƯỜI) --------------------------------------------------------------------------------------
# Mọi kiểm ở đây (biến môi trường tác tử, TTY, cụm xác nhận, mode 600) là CHỐNG LỠ TAY: tác tử chạy cùng uid lách được
# (env -u, `script` cấp PTY, đọc tệp token). Rào thật nằm ngoài script: token chỉ ở máy người phát hành, người đó không
# để AI chạy không người trông trên máy ấy, xoay token khi nghi ngờ (docs/DEPLOY.md §4).
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

# Nguồn token, theo thứ tự: (1) env CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID; (2) tệp ~/.config/vigo/cloudflare.env
# mode 600; (3) không có cả hai ⇒ NHẬP TAY từ /dev/tty (không hiện, không lưu) — KHUYẾN NGHỊ cho máy có chạy AI.
CF_TOKEN=''
CF_ACCOUNT=''
TOKEN_FROM_TTY=0
load_token() {
  local mode
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    CF_TOKEN=$CLOUDFLARE_API_TOKEN
    CF_ACCOUNT=$CLOUDFLARE_ACCOUNT_ID
    ok "token lấy từ biến môi trường"
  elif [ -e "$TOKEN_FILE" ] || [ -L "$TOKEN_FILE" ]; then
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
  else
    TOKEN_FROM_TTY=1
    ok "không có token trong env và không có $TOKEN_FILE — sẽ hỏi nhập tay từ terminal SAU các kiểm (không hiện, không lưu)"
  fi
  # Chỉ deploy-pages.ts nhận token (truyền inline); mọi tiến trình con khác chạy không có nó.
  unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
}

restore_echo() { stty echo </dev/tty 2>/dev/null || true; }

read_secret_tty() { # $1 lời nhắc; in giá trị ra stdout. Tắt echo TRƯỚC khi in lời nhắc (dán sớm cũng không hiện).
  local v
  stty -echo </dev/tty 2>/dev/null || die "không tắt được echo của terminal — không nhập token kiểu này"
  printf '%s' "$1" >/dev/tty
  IFS= read -r v </dev/tty || v=''
  restore_echo
  printf '\n' >/dev/tty
  v=${v%$'\r'}
  printf '%s' "$v"
}

require_tty() {
  [ -t 0 ] && [ -t 1 ] || die "ship cần terminal thật (stdin/stdout là TTY) — không chạy qua pipe/CI/tác tử."
  { : </dev/tty; } 2>/dev/null || die "không mở được /dev/tty"
}

# Mọi kiểm KHÔNG cần token/TTY (dùng chung cho ship và ship --preflight). Đặt SHIP_DIR, SHIP_HEAD, SHIP_MAIN, SHIP_REF.
SHIP_DIR=''
SHIP_HEAD=''
SHIP_MAIN=''
SHIP_REF=''
ship_checks() { # $1 dir ('' = tự tìm), $2 allow_flag, $3 first_ship
  local dir=$1 allow_rec
  step "3/6 worktree phát hành"
  [ -n "$dir" ] || dir=$(find_single_worktree) || exit 1
  dir=$(resolve_worktree "$dir") || exit 1
  SHIP_HEAD=$(git -C "$dir" rev-parse HEAD)
  [ -z "$(git -C "$dir" status --porcelain --untracked-files=no)" ] || die "worktree $dir có tệp đã track bị sửa sau prepare — chạy lại prepare"
  (cd "$dir" && npx tsx "$CLI" build-info-check "$dir" "$SHIP_HEAD") || die "build-info không khớp — chạy lại prepare"
  SHIP_REF=$(cd "$dir" && npx tsx "$CLI" build-info-get "$dir" ref) || die "không đọc được build-info"
  ok "$dir @ $SHIP_HEAD ($SHIP_REF)"
  SHIP_DIR=$dir

  step "4/6 bản đích so với origin/main + rào PROD"
  git -C "$ROOT" fetch --quiet origin main || die "git fetch origin main thất bại"
  SHIP_MAIN=$(git -C "$ROOT" rev-parse --verify --quiet 'refs/remotes/origin/main^{commit}') || die "không có refs/remotes/origin/main"
  allow_rec=$(cd "$dir" && npx tsx "$CLI" build-info-get "$dir" allowRef) || die "không đọc được build-info"
  if [ "$SHIP_HEAD" != "$SHIP_MAIN" ]; then
    [ "$2" = 1 ] && [ "$allow_rec" = true ] ||
      die "bản đích $SHIP_HEAD ≠ origin/main hiện tại $SHIP_MAIN (main đã đi tiếp? chạy lại prepare). Cố ý ship ref khác main: việc của NGƯỜI — prepare --allow-ref rồi ship --allow-ref."
    red "⚠⚠ ship bản NGOÀI main ($SHIP_REF = $SHIP_HEAD) theo --allow-ref"
  fi
  prod_gate "$SHIP_HEAD" "$3"
}

cmd_ship() {
  local dir='' allow_flag=0 first_ship=0 preflight=0 ans word
  refuse_agent_env
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir) [ $# -ge 2 ] || die "--dir cần giá trị"; dir=$2; shift 2 ;;
      --allow-ref) allow_flag=1; shift ;;
      --first-ship) first_ship=1; shift ;;
      --preflight) preflight=1; shift ;;
      *) die "ship: tham số lạ '$1'" ;;
    esac
  done

  if [ "$preflight" = 1 ]; then
    # Chạy đúng các kiểm 3/6–4/6 của ship rồi thoát: không đọc token, không cần TTY, không đẩy gì.
    unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
    step "preflight: bỏ qua 1/6 token, 2/6 terminal, 5/6 xác nhận, 6/6 đẩy"
    ship_checks "$dir" "$allow_flag" "$first_ship"
    printf '\nPREFLIGHT ĐẠT: %s (%s) — chưa đọc token, chưa đẩy gì.\n' "$SHIP_HEAD" "$SHIP_REF"
    return 0
  fi

  step "1/6 token Cloudflare"
  load_token
  step "2/6 terminal thật"
  require_tty
  trap restore_echo EXIT
  ok "TTY"

  ship_checks "$dir" "$allow_flag" "$first_ship"
  dir=$SHIP_DIR

  if [ "$TOKEN_FROM_TTY" = 1 ]; then
    step "nhập token tay (không hiện, không lưu)"
    CF_TOKEN=$(read_secret_tty 'Dán token Cloudflare (Pages:Edit) rồi Enter — không hiện, không lưu: ')
    CF_ACCOUNT=$(read_secret_tty 'Nhập Cloudflare account ID rồi Enter — không hiện: ')
    [ -n "$CF_TOKEN" ] && [ -n "$CF_ACCOUNT" ] || die "token hoặc account ID trống — huỷ, không có gì được đẩy"
    ok "đã nhận token (không in)"
  fi

  step "5/6 xác nhận"
  word=$CONFIRM_WORD
  if [ "$SHIP_HEAD" != "$SHIP_MAIN" ]; then
    word=$CONFIRM_WORD_OFF_MAIN
    printf '\n⚠⚠ BẢN NÀY NGOÀI main: ref %s = %s, KHÁC origin/main %s.\n   Lần ship sau từ main sẽ bị rào chặn tới khi code này vào main (bằng MERGE COMMIT, đừng squash).\n' \
      "$SHIP_REF" "$SHIP_HEAD" "$SHIP_MAIN" >/dev/tty
  fi
  printf '\nSắp đẩy %s (ref %s) lên 4 project PROD: %s\nGõ %s để tiếp tục (khác ⇒ huỷ): ' "$SHIP_HEAD" "$SHIP_REF" "$HOSTS" "$word" >/dev/tty
  IFS= read -r ans </dev/tty || ans=''
  ans=${ans%$'\r'}
  [ "$ans" = "$word" ] || die "huỷ — không có gì được đẩy"

  step "6/6 deploy-pages.ts (wrangler ghim bản) rồi verify"
  if ! (cd "$dir" && CLOUDFLARE_API_TOKEN="$CF_TOKEN" CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT" npx tsx scripts/deploy-pages.ts); then
    CF_TOKEN=''
    CF_ACCOUNT=''
    red "✗ deploy-pages.ts lỗi — có thể đã đẩy MỘT PHẦN cổng. Kiểm 4 cổng bằng verify; cần thì lùi:"
    rollback_help
    exit 1
  fi
  CF_TOKEN=''
  CF_ACCOUNT=''
  if ! cmd_verify --sha "$SHIP_HEAD"; then
    red "✗ verify chưa đạt — chờ vài phút rồi chạy lại: scripts/release-prod.sh verify --sha $SHIP_HEAD"
    rollback_help
    exit 1
  fi
  printf '\nSHIP XONG: %s trên 4 cổng. Dọn: %s\n' "$SHIP_HEAD" "$(cleanup_cmd "$dir")"
  rollback_help
}

# --- verify (AI chạy được: chỉ GET công khai) ----------------------------------------------------------------
# out/ (kể cả build-id.txt) được chép NGUYÊN vào cả 4 cổng (pages-lib.ts preparePortalDir) ⇒ cổng nào cũng có
# /build-id.txt; so ở CẢ 4 để bắt deploy dở / lùi lệch một cổng.
LAST_ID=''
check_host() { # $1 host, $2 sha mong đợi ('' = không so); trả 0 nếu đạt; đặt LAST_ID = build-id đọc được
  local host=$1 want=$2 ts body chunk id
  ts=$(date +%s)
  body=$(curl -fsSL --max-time 15 "https://$host/?t=$ts" 2>/dev/null) || { echo "    $host: GET / lỗi"; return 1; }
  chunk=$(printf '%s' "$body" | grep -Eo '/_next/static/[^"'"'"' <>)]+\.js' | sed -n '1p' || true)
  [ -n "$chunk" ] || { echo "    $host: index.html không có chunk /_next/static/…"; return 1; }
  curl -fsSL --max-time 15 -o /dev/null "https://$host$chunk" 2>/dev/null || { echo "    $host: chunk $chunk lỗi"; return 1; }
  id=$(curl -fsS --max-time 15 "https://$host/build-id.txt?t=$ts" 2>/dev/null | tr -d '[:space:]' || true)
  LAST_ID=$id
  if [ -n "$want" ]; then
    [ "$id" = "$want" ] || { echo "    $host: build-id.txt = '${id:0:40}' ≠ $want"; return 1; }
  else
    echo "    $host: build-id.txt = '${id:0:40}' (không so — thiếu --sha/--dir)"
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
        if [ -z "$want" ] && is_sha40 "$LAST_ID"; then
          want=$LAST_ID
          echo "    (không có --sha/--dir: lấy build-id của $host = $want làm chuẩn cho các cổng còn lại)"
        fi
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
  [ "$dir" != "$ROOT" ] || die "đang chạy script TRONG chính worktree cần gỡ — dùng: $(cleanup_cmd "$dir")"
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
