# 🚀 MenuLogs Backend - Complete Setup Guide

## Prerequisites Installation

### 1. Install Docker (Recommended - Easiest Option)

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install docker.io docker-compose-v2 -y
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to docker group (avoid sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### 2. Alternative: Manual PostgreSQL & Redis Installation

#### Install PostgreSQL 16
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres psql -c "CREATE DATABASE menulogs;"
sudo -u postgres psql -c "CREATE USER postgres WITH PASSWORD 'password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE menulogs TO postgres;"
```

#### Install Redis
```bash
# Ubuntu/Debian
sudo apt install redis-server -y
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify
redis-cli ping  # Should return PONG
```

---

## 🎯 Quick Start (Choose One Method)

### Method A: Using Docker (Recommended)

```bash
# 1. Start infrastructure
cd backend
docker compose up -d

# 2. Wait for containers to be ready (10 seconds)
sleep 10

# 3. Install dependencies
npm install

# 4. Generate Prisma client
npx prisma generate

# 5. Run database migrations
npx prisma migrate dev --name init

# 6. Seed database with demo data
npm run prisma:seed

# 7. Start development server
npm run dev
```

### Method B: Manual Setup

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Configure database
# Edit .env file with your PostgreSQL credentials
DATABASE_URL="postgresql://postgres:password@localhost:5432/menulogs"

# 3. Generate Prisma client
npx prisma generate

# 4. Run migrations
npx prisma migrate dev --name init

# 5. Seed database
npm run prisma:seed

# 6. Start server
npm run dev
```

---

## ✅ Verification

### 1. Check Health
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2024-...",
  "uptime": 1.234
}
```

### 2. Test Login
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@restaurant.com",
    "password": "demo123"
  }'
```

### 3. Open Prisma Studio (Database GUI)
```bash
npm run prisma:studio
```
Opens at: http://localhost:5555

---

## 🔧 Environment Configuration

Create `.env` file in backend directory:

```env
# Server
NODE_ENV=development
PORT=5000
API_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173

# Database (Docker setup)
DATABASE_URL=postgresql://postgres:password@localhost:5432/menulogs

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Secrets (Change in production!)
JWT_SECRET=dev-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# AWS S3 (Optional - for file uploads)
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=ap-south-1
AWS_S3_BUCKET=menulogs-uploads
AWS_S3_ENDPOINT=
AWS_S3_FORCE_PATH_STYLE=false

# Razorpay (Optional - for payments)
RAZORPAY_KEY_ID=your-key
RAZORPAY_KEY_SECRET=your-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
RAZORPAY_CURRENCY=INR

# Email Configuration (Zoho/ZeptoMail)
EMAIL_PROVIDER=zeptomail
EMAIL_FROM=noreply@menulogs.com
EMAIL_FROM_NAME=MenuLogs
EMAIL_REPLY_TO=support@menulogs.com

# ZeptoMail API Token (Recommended for transactional emails)
# Get token from: ZeptoMail Dashboard → Mail Agents → SMTP & API Info → API Tab → Send Mail Token
ZEPTOMAIL_API_TOKEN=your-send-mail-token-here
ZEPTOMAIL_BOUNCE_ADDRESS=bounce@menulogs.in

# SMTP Configuration (Alternative - if not using ZeptoMail)
# SMTP_HOST=smtp.zoho.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=noreply@menulogs.com
# SMTP_PASS=your-app-password

# Logging (Optional)
LOG_LEVEL=info
LOG_DIR=logs
LOG_ERROR_FILE=logs/error.log
LOG_COMBINED_FILE=logs/combined.log

# Rate Limiting (Optional)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 🐳 Docker Commands

```bash
# Start containers
docker compose up -d

# View logs
docker compose logs -f

# Stop containers
docker compose down

# Stop and remove volumes (⚠️ deletes data)
docker compose down -v

# Restart specific service
docker compose restart postgres
docker compose restart redis

# Check container status
docker ps

# Access PostgreSQL shell
docker exec -it menulogs-postgres psql -U postgres -d menulogs

# Access Redis CLI
docker exec -it menulogs-redis redis-cli
```

---

## 📊 Database Management

### Create New Migration
```bash
# After changing schema.prisma
npx prisma migrate dev --name your_migration_name
```

### Reset Database (⚠️ Deletes all data)
```bash
npx prisma migrate reset
```

### Seed Database
```bash
npm run prisma:seed
```

### Open Database GUI
```bash
npm run prisma:studio
```

---

## 🐛 Common Issues & Fixes

### Issue 1: Port 5432 already in use
```bash
# Find process using port
sudo lsof -i :5432

# Option A: Stop local PostgreSQL
sudo systemctl stop postgresql

# Option B: Change Docker port
# Edit docker-compose.yml:
ports:
  - '5433:5432'
# Update DATABASE_URL in .env
```

### Issue 2: Port 6379 already in use
```bash
# Stop local Redis
sudo systemctl stop redis-server
```

### Issue 3: Port 5000 already in use
```bash
# Change port in .env
PORT=5001
```

### Issue 4: Database connection failed
```bash
# Check containers are running
docker ps

# Check container logs
docker compose logs postgres

# Restart containers
docker compose restart
```

### Issue 5: Prisma generate fails
```bash
# Clean and regenerate
rm -rf node_modules/.prisma
npx prisma generate
```

---

## 🧪 Demo Data

After seeding, you'll have:

### Demo User
- **Email:** demo@restaurant.com
- **Password:** demo123

### Sample Business
- Name: Fine Dining Group
- Locations: 1 (Downtown Branch)

### Sample Menu
- Categories: Starters, Main Course, Desserts
- Menu Items: 2 sample items
- Banners: 1 promotional banner

---

## 📱 Testing with Frontend

1. Start backend (port 5000)
2. Start frontend (port 5173)
3. Login with demo credentials
4. Test all features

---

## 🚀 Production Deployment

### Pre-deployment Checklist

- [ ] Change JWT secrets
- [ ] Use production database
- [ ] Set up Redis cluster
- [ ] Configure S3 bucket
- [ ] Set up Razorpay production
- [ ] Enable HTTPS
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Set up CI/CD
- [ ] Load test API

### Recommended Hosting

- **API:** AWS EC2, DigitalOcean, Railway, Render
- **Database:** AWS RDS, Supabase, Neon
- **Redis:** AWS ElastiCache, Redis Cloud
- **Storage:** AWS S3, DigitalOcean Spaces

---

## 📞 Support

If you encounter issues:

1. Check logs: `docker compose logs -f`
2. Verify environment variables
3. Check database connection
4. Review error messages
5. Check firewall/security settings

---

**Happy coding! 🎉**

