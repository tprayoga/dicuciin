# Laundry Multi-Platform Backend API

Backend API untuk sistem laundry multi-platform yang mendukung Web Admin/Outlet, Mobile App Customer, dan Kiosk Self-Service.

## 🚀 Tech Stack

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Cache**: Redis
- **Queue**: BullMQ
- **IoT Protocol**: MQTT (Eclipse Mosquitto)
- **Authentication**: JWT
- **Authorization**: Role-Based Access Control (RBAC)
- **Documentation**: Swagger/OpenAPI
- **Container**: Docker Compose

## 📋 Features

- ✅ Authentication & Authorization (JWT + RBAC)
- ✅ User Management (Multi-role support)
- ✅ Customer & Member Management
- ✅ Outlet/Branch Management
- ✅ Laundry Services & Pricing
- ✅ Order Management
- ✅ Payment Processing
- ✅ Digital Wallet System
- ✅ Promo & Discount Management
- ✅ Kiosk Self-Service Integration
- ✅ IoT Device Integration (Scales, Printers, Smart Lockers, Machines)
- ✅ Health Check Monitoring

## 🏗️ Architecture

Modular Monolith architecture dengan struktur sebagai berikut:

```
src/
├── common/                 # Shared modules
│   ├── prisma/            # Prisma ORM service
│   ├── decorators/        # Custom decorators (@Roles, @Public)
│   ├── guards/            # Auth guards (JWT, Roles)
│   ├── filters/           # Exception filters
│   ├── interceptors/      # Response interceptors
│   └── utils/             # Utility functions
├── modules/               # Feature modules
│   ├── auth/             # Authentication & authorization
│   ├── users/            # User management
│   ├── outlets/          # Outlet/branch management
│   ├── customers/        # Customer management
│   ├── services/         # Laundry services & pricing
│   ├── orders/           # Order processing
│   ├── payments/         # Payment handling
│   ├── wallets/          # Digital wallet
│   ├── promos/           # Promo & discount
│   ├── kiosks/           # Kiosk management
│   ├── iot/              # IoT device integration
│   └── health/           # Health check
├── app.module.ts
└── main.ts
```

## 🔐 User Roles

- `SUPER_ADMIN` - Full system access
- `OWNER` - Business owner access
- `ADMIN_OUTLET` - Outlet administrator
- `CASHIER` - Cashier operations
- `OPERATOR` - Laundry operations
- `TECHNICIAN` - Technical support
- `CUSTOMER` - Customer access

## 📦 Installation

### Prerequisites

- Node.js >= 18.x
- Docker & Docker Compose
- npm or yarn

### Steps

1. **Clone repository**
```bash
cd laundry-be
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**
```bash
cp .env.example .env
```

Edit `.env` file sesuai kebutuhan.

4. **Start Docker services**
```bash
npm run docker:up
```

Services yang akan berjalan:
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MQTT Broker: `localhost:1883`

5. **Run database migration**
```bash
npm run prisma:migrate
```

6. **Seed database**
```bash
npm run prisma:seed
```

7. **Start development server**
```bash
npm run start:dev
```

Application akan berjalan di: `http://localhost:3000`

## 📚 API Documentation

Swagger documentation tersedia di:
```
http://localhost:3000/api/docs
```

## 🔑 Default Credentials

Setelah seed, gunakan credentials berikut untuk login:

**Super Admin:**
- Email: `admin@laundry.local`
- Password: `Password123!`

## 🛠️ Available Scripts

```bash
# Development
npm run start:dev          # Start development server with watch mode
npm run start:debug        # Start with debug mode

# Build
npm run build              # Build production bundle
npm run start:prod         # Start production server

# Testing
npm run test               # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run tests with coverage
npm run test:e2e           # Run e2e tests

# Code Quality
npm run lint               # Run ESLint
npm run format             # Format code with Prettier

# Database
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate     # Run database migration
npm run prisma:studio      # Open Prisma Studio
npm run prisma:seed        # Seed database

# Docker
npm run docker:up          # Start Docker services
npm run docker:down        # Stop Docker services
```

## 🌐 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user profile

### Users
- `GET /api/v1/users` - List users (Admin only)
- `GET /api/v1/users/:id` - Get user detail
- `PATCH /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user

### Outlets
- `POST /api/v1/outlets` - Create outlet
- `GET /api/v1/outlets` - List outlets
- `GET /api/v1/outlets/:id` - Get outlet detail
- `PATCH /api/v1/outlets/:id` - Update outlet
- `DELETE /api/v1/outlets/:id` - Delete outlet

### Customers
- `GET /api/v1/customers` - List customers
- `GET /api/v1/customers/:id` - Get customer detail
- `GET /api/v1/customers/:id/orders` - Get customer orders
- `GET /api/v1/customers/:id/wallet` - Get customer wallet

### Services
- `POST /api/v1/services` - Create service
- `GET /api/v1/services` - List services
- `POST /api/v1/services/prices` - Create service price
- `GET /api/v1/services/prices` - List service prices

### Orders
- `POST /api/v1/orders` - Create order
- `GET /api/v1/orders` - List orders
- `GET /api/v1/orders/:id` - Get order detail
- `PATCH /api/v1/orders/:id/status` - Update order status
- `POST /api/v1/orders/:id/cancel` - Cancel order

### Wallets
- `GET /api/v1/wallets/customer/:customerId` - Get wallet
- `GET /api/v1/wallets/customer/:customerId/transactions` - Get transactions
- `POST /api/v1/wallets/customer/:customerId/topup` - Top up wallet
- `POST /api/v1/wallets/customer/:customerId/pay` - Pay with wallet
- `POST /api/v1/wallets/customer/:customerId/refund` - Refund to wallet

### Promos
- `GET /api/v1/promos` - List promos
- `GET /api/v1/promos/:id` - Get promo detail
- `POST /api/v1/promos/validate` - Validate promo code

### Kiosks
- `GET /api/v1/kiosks` - List kiosks
- `GET /api/v1/kiosks/:id` - Get kiosk detail
- `POST /api/v1/kiosks/:id/session/start` - Start kiosk session
- `POST /api/v1/kiosks/session/:sessionId/end` - End kiosk session

### IoT Devices
- `GET /api/v1/iot/devices` - List devices
- `GET /api/v1/iot/devices/:id` - Get device detail
- `POST /api/v1/iot/devices/:id/heartbeat` - Device heartbeat
- `POST /api/v1/iot/devices/:id/commands` - Send command to device
- `GET /api/v1/iot/devices/:id/events` - Get device events

### Health Check
- `GET /api/v1/health` - System health status

## 🔌 IoT Integration

### MQTT Topics

```
laundry/device/{deviceCode}/command    # Send commands to device
laundry/device/{deviceCode}/event      # Receive events from device
laundry/device/{deviceCode}/heartbeat  # Device heartbeat
```

### Supported Device Types

- `KIOSK` - Self-service kiosk
- `DIGITAL_SCALE` - Digital weighing scale
- `RECEIPT_PRINTER` - Receipt printer
- `LABEL_PRINTER` - Label printer
- `SMART_LOCKER` - Smart locker system
- `WASHING_MACHINE` - Washing machine
- `DRYER_MACHINE` - Dryer machine
- `QR_SCANNER` - QR code scanner

## 💾 Database Schema

### Core Models

- **User** - System users with roles
- **Customer** - Customer profiles with member codes
- **Outlet** - Laundry outlets/branches
- **Service** - Laundry service types
- **ServicePrice** - Pricing per outlet
- **Order** - Customer orders
- **OrderItem** - Order line items
- **Payment** - Payment records
- **Wallet** - Customer digital wallet
- **WalletTransaction** - Wallet transaction history
- **Promo** - Promotional campaigns
- **Kiosk** - Self-service kiosks
- **IotDevice** - IoT device registry
- **IotCommand** - Commands sent to devices
- **IotEvent** - Events from devices

## 🔒 Security Features

- JWT-based authentication
- Role-based access control (RBAC)
- Password hashing with bcrypt
- Request validation with class-validator
- CORS enabled with credentials
- Helmet for security headers
- Rate limiting ready
- SQL injection protection via Prisma

## 📊 Monitoring

- Health check endpoint for service monitoring
- Database connection status
- Redis connection status
- Timestamp for uptime tracking

## 🚧 Development Tips

### Prisma Studio

Buka Prisma Studio untuk melihat dan mengedit data:
```bash
npm run prisma:studio
```

### Database Reset

Untuk reset database dan seed ulang:
```bash
npx prisma migrate reset
```

### Generate Prisma Client

Setelah mengubah schema:
```bash
npm run prisma:generate
```

## 📝 Environment Variables

```env
# Application
APP_NAME=Laundry Backend API
APP_ENV=development
APP_PORT=3000
ALLOWED_ORIGINS=http://localhost:3001

# Database
DATABASE_URL=postgresql://laundry:laundry_password@localhost:5432/laundry_db

# JWT
JWT_ACCESS_SECRET=your-access-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MQTT
MQTT_URL=mqtt://localhost:1883

# Security
BCRYPT_SALT_ROUNDS=10
```

`ALLOWED_ORIGINS` mendukung beberapa origin dipisah koma, contoh:
`https://admin.dicuciin.com,https://ops.dicuciin.com`.
Wildcard juga didukung, contoh: `https://*.dicuciin.com`.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

ISC

## 👥 Support

Untuk bantuan dan pertanyaan, silakan buka issue di repository ini.

---

**Built with ❤️ using NestJS**
