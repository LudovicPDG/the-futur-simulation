import {
	POSTGRES_HOST,
	POSTGRES_PORT,
	POSTGRES_DATABASE,
	POSTGRES_USER,
	POSTGRES_PASSWORD
} from '$env/static/private';

import pg from 'pg';

const { Pool } = pg;

export const db = new Pool({
	host: POSTGRES_HOST,
	port: Number(POSTGRES_PORT),
	database: POSTGRES_DATABASE,
	user: POSTGRES_USER,
	password: POSTGRES_PASSWORD
});
