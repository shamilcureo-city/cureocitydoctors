import type { Knex } from 'knex';
import { config } from './index.js';

export const databaseConfig: Knex.Config = {
  client: 'pg',
  connection: config.databaseUrl,
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: '../db/migrations',
    tableName: 'knex_migrations',
    extension: 'ts',
  },
  seeds: {
    directory: '../db/seeds',
    extension: 'ts',
  },
};

export default databaseConfig;
