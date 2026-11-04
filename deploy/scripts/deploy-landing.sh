#!/usr/bin/env bash
set -euo pipefail

# Deploy landing page statis (dicuciin-landing/) ke folder web nginx.
#
# Pemakaian (di VM):
#   bash deploy/scripts/deploy-landing.sh
#   WEB_ROOT=/var/www/dicuciin bash deploy/scripts/deploy-landing.sh
#
# Opsional purge cache Cloudflare setelah deploy:
#   CF_ZONE_ID=<zone-id> CF_API_TOKEN=<token-purge-cache> bash deploy/scripts/deploy-landing.sh

ROOT_DIR="${ROOT_DIR:-/opt/dicuciin}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-dicuciin.com}"
WEB_ROOT="${WEB_ROOT:-}"
SRC_DIR="$ROOT_DIR/dicuciin-landing"

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is not installed (sudo apt install rsync)"
  exit 1
fi

echo "==> Update source code ($BRANCH)"
cd "$ROOT_DIR"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# Kalau WEB_ROOT tidak diisi, ambil `root` dari server block nginx untuk $DOMAIN.
if [ -z "$WEB_ROOT" ]; then
  WEB_ROOT="$(sudo nginx -T 2>/dev/null | awk -v d="$DOMAIN" '
    /server_name/ { hit = 0; for (i = 2; i <= NF; i++) { gsub(";", "", $i); if ($i == d) hit = 1 } }
    hit && $1 == "root" { gsub(";", "", $2); print $2; exit }
  ')"
fi

if [ -z "$WEB_ROOT" ]; then
  echo "Folder web untuk $DOMAIN tidak ditemukan di konfigurasi nginx."
  echo "Jalankan ulang dengan WEB_ROOT=/path/folder/web"
  exit 1
fi

if [ ! -f "$WEB_ROOT/index.html" ]; then
  echo "$WEB_ROOT/index.html tidak ada. Pastikan WEB_ROOT benar sebelum menimpa."
  exit 1
fi

echo "==> Backup $WEB_ROOT"
BACKUP_DIR="$ROOT_DIR/backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/landing_$(date +%Y%m%d_%H%M%S).tar.gz"
sudo tar -czf "$BACKUP_FILE" -C "$WEB_ROOT" .
echo "Backup: $BACKUP_FILE"

echo "==> Salin $SRC_DIR -> $WEB_ROOT"
# Tanpa --delete: file lain di folder web (mis. verifikasi domain) tidak ikut terhapus.
sudo rsync -a --chmod=D755,F644 "$SRC_DIR/" "$WEB_ROOT/"

if [ -n "${CF_ZONE_ID:-}" ] && [ -n "${CF_API_TOKEN:-}" ]; then
  echo "==> Purge cache Cloudflare"
  curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' >/dev/null
fi

echo "==> Cek halaman"
for page in "" cara-pemesanan.html syarat-ketentuan.html kebijakan-privasi.html kebijakan-refund.html; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/$page" || true)"
  echo "  $code https://$DOMAIN/$page"
done

echo "Selesai. Jika masih tampil versi lama, purge cache di Cloudflare."
