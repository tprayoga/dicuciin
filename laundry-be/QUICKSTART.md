# Quick Start Guide

## Langkah Cepat Menjalankan Project

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Docker Services
```bash
docker-compose up -d
```

Pastikan Docker Desktop sudah berjalan. Ini akan menjalankan:
- PostgreSQL (port 5432)
- Redis (port 6379)
- MQTT Broker (port 1883)

### 3. Setup Environment
File `.env` sudah tersedia. Jika belum ada, copy dari `.env.example`:
```bash
cp .env.example .env
```

### 4. Generate Prisma Client
```bash
npm run prisma:generate
```

### 5. Run Database Migration
```bash
npm run prisma:migrate
```

Ketik nama migration, misalnya: `init`

### 6. Seed Database
```bash
npm run prisma:seed
```

Ini akan membuat:
- Super Admin (email: admin@laundry.local, password: Password123!)
- 1 Outlet default
- 3 Service laundry dengan harga

### 7. Start Development Server
```bash
npm run start:dev
```

Server akan berjalan di: http://localhost:3000

### 8. Akses Swagger Documentation
Buka browser: http://localhost:3000/api/docs

### 9. Test Login
Gunakan Swagger untuk test endpoint:

**POST /api/v1/auth/login**
```json
{
  "identifier": "admin@laundry.local",
  "password": "Password123!"
}
```

Copy `accessToken` dari response.

### 10. Authorize di Swagger
1. Klik tombol "Authorize" di kanan atas Swagger
2. Masukkan: `Bearer <accessToken>`
3. Klik "Authorize"

Sekarang Anda bisa test semua endpoint yang memerlukan authentication!

## Troubleshooting

### Docker tidak berjalan
```bash
# Start Docker Desktop terlebih dahulu
# Kemudian jalankan:
docker-compose up -d
```

### Port sudah digunakan
Edit `.env` dan ubah `APP_PORT` ke port lain, misalnya 3001

### Database connection error
```bash
# Restart PostgreSQL
docker-compose restart postgres
```

### Prisma Client error
```bash
# Generate ulang Prisma Client
npm run prisma:generate
```

## Commands Berguna

```bash
# View database dengan GUI
npm run prisma:studio

# Stop Docker services
docker-compose down

# View Docker logs
docker-compose logs -f

# Rebuild project
npm run build

# Run linter
npm run lint
```

## Next Steps

1. Buat user baru via endpoint `/api/v1/auth/register`
2. Buat outlet baru
3. Tambah service dan pricing
4. Buat order
5. Test wallet transaction
6. Test promo validation

Selamat coding! 🚀
