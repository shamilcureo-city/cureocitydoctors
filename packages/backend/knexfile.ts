import 'dotenv/config';
import type { Knex } from 'knex';

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/cureocity_dev';

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: databaseUrl,
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './src/db/migrations',
      tableName: 'knex_migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './src/db/seeds',
      extension: 'ts',
    },
  },

  production: {
    client: 'pg',
    connection: {
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    },
    pool: { min: 2, max: 20 },
    migrations: {
      directory: './src/db/migrations',
      tableName: 'knex_migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './src/db/seeds',
      extension: 'ts',
    },
  },
};

export default config;
