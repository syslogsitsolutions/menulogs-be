// Prisma 7.2.0 configuration file (JavaScript version for Docker)
// This is a JS version of prisma.config.ts for Docker builds
require('dotenv').config();

// Note: Prisma 7 expects defineConfig from 'prisma/config', but for JS compatibility
// we use a simple object export
module.exports = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
