import { env } from '$env/dynamic/private';

import pg from 'pg';

const { Pool } = pg;

export const db = new Pool({
	host: env.POSTGRES_HOST,
	port: Number(env.POSTGRES_PORT),
	database: env.POSTGRES_DATABASE,
	user: env.POSTGRES_USER,
	password: env.POSTGRES_PASSWORD
});
