import knex from 'knex';
import { config } from '../config/index.js';

export const db = knex({
  client: 'pg',
  connection: config.databaseUrl,
  pool: { min: 2, max: 10 },
});
