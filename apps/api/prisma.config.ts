import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations go over the direct connection when there is one — a pooled
    // Neon endpoint cannot hold the locks DDL requires.
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
});
