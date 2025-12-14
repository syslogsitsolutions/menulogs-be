# 🚀 MenuLogs Backend API

Modern, scalable backend API for MenuLogs - A SaaS restaurant menu management platform.

## 📋 Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL + Prisma ORM
- **Cache:** Redis
- **Storage:** AWS S3
- **Payment:** Razorpay
- **Authentication:** JWT (Access + Refresh tokens)
- **Validation:** Zod
- **Security:** Helmet, CORS, Rate Limiting

## 🏗️ Architecture

```
backend/
├── src/
│   ├── config/          # Database, Redis, S3, Razorpay configs
│   ├── controllers/     # Route handlers
│   ├── middleware/      # Auth, error handling, rate limiting
│   ├── routes/          # API route definitions
│   ├── services/        # Business logic
│   ├── utils/           # Helper functions (JWT, password, logger)
│   ├── types/           # TypeScript type definitions
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entry point
├── prisma/
│   ├── schema.prisma    # Database schema (14 tables)
│   └── seed.ts          # Seed data
└── package.json
```

## 📦 Installation

### Prerequisites
- Node.js 20+
- PostgreSQL 16
- Redis 7
- Docker (optional, recommended)

### Option 1: Using Docker (Recommended)

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Seed database
npm run prisma:seed

# Start development server
npm run dev
```

### Option 2: Manual Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Set up database:**
```bash
# Create PostgreSQL database
createdb menulogs

# Run migrations
npx prisma migrate dev --name init

# Seed database
npm run prisma:seed
```

4. **Start server:**
```bash
npm run dev
```

## 🔧 Environment Variables

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:password@localhost:5432/menulogs
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
FRONTEND_URL=http://localhost:5173
```

## 🎯 API Endpoints

### Authentication
```
POST   /api/v1/auth/signup          - Create account
POST   /api/v1/auth/login           - Login
POST   /api/v1/auth/refresh         - Refresh access token
POST   /api/v1/auth/logout          - Logout
GET    /api/v1/auth/me              - Get current user
```

### Business Management
```
GET    /api/v1/businesses           - List businesses
POST   /api/v1/businesses           - Create business
GET    /api/v1/businesses/:id       - Get business
PUT    /api/v1/businesses/:id       - Update business
DELETE /api/v1/businesses/:id       - Delete business
```

### Location Management
```
GET    /api/v1/locations            - List locations
POST   /api/v1/locations            - Create location
GET    /api/v1/locations/:id        - Get location
PUT    /api/v1/locations/:id        - Update location
DELETE /api/v1/locations/:id        - Delete location
```

### Category Management
```
GET    /api/v1/categories/locations/:locationId  - List categories
POST   /api/v1/categories/locations/:locationId  - Create category
PUT    /api/v1/categories/:id                    - Update category
DELETE /api/v1/categories/:id                    - Delete category
PATCH  /api/v1/categories/:id/visibility         - Toggle visibility
```

### Menu Items Management
```
GET    /api/v1/menu-items/locations/:locationId  - List items
POST   /api/v1/menu-items/locations/:locationId  - Create item
PUT    /api/v1/menu-items/:id                    - Update item
DELETE /api/v1/menu-items/:id                    - Delete item
PATCH  /api/v1/menu-items/:id/availability       - Update availability
```

### Banner Management
```
GET    /api/v1/banners/locations/:locationId     - List banners
POST   /api/v1/banners/locations/:locationId     - Create banner
PUT    /api/v1/banners/:id                       - Update banner
DELETE /api/v1/banners/:id                       - Delete banner
PATCH  /api/v1/banners/:id/toggle                - Toggle active status
```

## 🔐 Authentication

The API uses JWT-based authentication with access and refresh tokens:

1. **Access Token**: Short-lived (15 minutes), sent in `Authorization: Bearer <token>` header
2. **Refresh Token**: Long-lived (7 days), stored in httpOnly cookie

### Example Request
```bash
# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@restaurant.com", "password": "demo123"}'

# Protected request
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer <access_token>"
```

## 🗄️ Database Schema

14 tables with optimized relationships:

- **User** - Account information
- **Session** - JWT refresh tokens
- **Business** - Restaurant business
- **Location** - Restaurant branches
- **Category** - Menu categories
- **MenuItem** - Menu items
- **Banner** - Promotional banners
- **Subscription** - Location subscriptions
- **Invoice** - Billing invoices
- **PaymentMethod** - Saved payment methods
- **Analytics** - Usage analytics
- **MenuItemView** - Item view tracking
- **Activity** - User activity log
- **Upload** - File uploads (S3)

## 📊 Available Scripts

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript
npm start            # Run production server
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate     # Run migrations
npm run prisma:studio      # Open Prisma Studio
npm run prisma:seed        # Seed database
npm run lint         # Run ESLint
npm run format       # Format with Prettier
npm test             # Run tests
```

## 🧪 Testing

### Demo Credentials
```
Email: demo@restaurant.com
Password: demo123
```

### Health Check
```bash
curl http://localhost:5000/health
```

## 🔒 Security Features

- ✅ Helmet.js security headers
- ✅ CORS configured
- ✅ Rate limiting (general, auth, public)
- ✅ Password hashing (bcrypt)
- ✅ JWT authentication
- ✅ HttpOnly cookies
- ✅ Input validation (Zod)
- ✅ SQL injection prevention (Prisma)
- ✅ Error handling middleware

## 🚀 Deployment

### Production Checklist

1. Set `NODE_ENV=production`
2. Use strong JWT secrets
3. Configure production database
4. Set up Redis cluster
5. Configure AWS S3 credentials
6. Set up Razorpay production keys
7. Enable HTTPS
8. Set up monitoring & logging
9. Configure backup strategy
10. Set up CI/CD pipeline

### Environment-specific configs

```bash
# Production
DATABASE_URL=postgresql://user:pass@prod-host:5432/menulogs
REDIS_HOST=redis-prod.example.com
NODE_ENV=production
```

## 📝 Development

### Code Style
- TypeScript strict mode enabled
- ESLint + Prettier configured
- Follow Airbnb style guide

### Commit Convention
```
feat: Add new feature
fix: Bug fix
docs: Documentation
style: Formatting
refactor: Code refactoring
test: Add tests
chore: Maintenance
```

## 🐛 Troubleshooting

### Database Connection Error
```bash
# Check PostgreSQL is running
docker ps

# Restart containers
docker-compose restart
```

### Port Already in Use
```bash
# Change PORT in .env
PORT=5001
```

### Prisma Schema Changes
```bash
# Create migration
npx prisma migrate dev --name your_migration_name

# Reset database (⚠️ deletes all data)
npx prisma migrate reset
```

## 📚 Resources

- [Express.js Docs](https://expressjs.com/)
- [Prisma Docs](https://www.prisma.io/docs/)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)
- [Zod Docs](https://zod.dev/)

## 📄 License

MIT

---

**Built with ❤️ for MenuLogs SaaS Platform**

