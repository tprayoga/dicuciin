# Deploy Guide (VM)

Panduan ini untuk deploy `laundry-admin` + `laundry-be` pada 1 VM Ubuntu.

## 1) Rekomendasi Spek VM

- Dev/Staging: 2 vCPU, 4 GB RAM, 40 GB SSD
- Production kecil: 4 vCPU, 8 GB RAM, 80 GB SSD (recommended)
- Production menengah: 8 vCPU, 16 GB RAM, 160 GB SSD

## 2) Struktur Deploy

- FE (Nuxt): port `3001` via PM2
- BE (Nest): port `3000` via PM2
- Infra (docker compose): PostgreSQL, Redis, MQTT
- Reverse proxy: Nginx

## 3) Bootstrap VM

Di VM (user biasa dengan sudo):

```bash
cd /opt
sudo mkdir -p dicuciin && sudo chown -R $USER:$USER dicuciin
cd /opt/dicuciin

# copy repo ke VM
# (opsi A) git clone langsung
# git clone <repo-url> .

# jalankan bootstrap
bash deploy/scripts/bootstrap-vm.sh
```

Logout/login lagi agar group docker aktif.

## 4) Konfigurasi Backend

```bash
cd /opt/dicuciin/laundry-be
cp .env.example .env
```

Wajib edit `.env`:

- `APP_ENV=production`
- `APP_PORT=3000`
- `DATABASE_URL=postgresql://laundry:<password-kuat>@localhost:5432/laundry_db?schema=public`
- `JWT_ACCESS_SECRET=<random-kuat>`
- `JWT_REFRESH_SECRET=<random-kuat>`
- `REDIS_HOST=localhost`
- `REDIS_PORT=6379`
- `MQTT_URL=mqtt://localhost:1883`
- `ALLOWED_ORIGINS=https://admin.dicuciin.com` ← domain frontend production
- `PROFIT_MARGIN_PERCENT=80` ← margin laba estimasi (default 80%)

## 5) Konfigurasi PM2

Edit file `deploy/ecosystem.config.cjs`:

- Ubah domain API di `NUXT_PUBLIC_API_BASE`
- Jika path project bukan `/opt/dicuciin`, ubah `cwd` FE/BE

## 6) First Deploy

```bash
cd /opt/dicuciin

# jalankan update pipeline
bash deploy/scripts/deploy-update.sh
```

Opsional seed ulang data:

```bash
RUN_SEED=true bash deploy/scripts/deploy-update.sh
```

## 7) Nginx Reverse Proxy

```bash
sudo cp /opt/dicuciin/deploy/nginx/dicuciin.conf /etc/nginx/sites-available/dicuciin
sudo ln -s /etc/nginx/sites-available/dicuciin /etc/nginx/sites-enabled/dicuciin
```

Edit `/etc/nginx/sites-available/dicuciin`:

- `admin.example.com` -> domain FE
- `api.example.com` -> domain BE

Lalu:

```bash
sudo nginx -t
sudo systemctl restart nginx
```

## 8) SSL HTTPS

```bash
sudo certbot --nginx -d admin.example.com -d api.example.com
```

## 9) Verifikasi

```bash
pm2 ls
pm2 logs laundry-be --lines 100
pm2 logs laundry-admin --lines 100
curl -fsS http://127.0.0.1:3000/api/v1/health
```

- API docs: `https://api.example.com/api/docs`
- Admin FE: `https://admin.example.com`

## 10) Update Harian

Setiap ada update code:

```bash
cd /opt/dicuciin
bash deploy/scripts/deploy-update.sh
```

## 11) Rekomendasi Operasional

- Pakai managed backup untuk volume PostgreSQL
- Jangan expose port 5432/6379/1883 ke publik
- Gunakan firewall (ufw/security group): buka hanya 22,80,443
- Simpan secret di vault/secret manager jika memungkinkan
