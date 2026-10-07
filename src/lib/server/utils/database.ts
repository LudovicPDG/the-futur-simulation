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

// pg cannot parse arrays of composite types, so skew_normal_parameter_t[] comes back as a raw
// literal like {"(2035,7,0.8,0.45)","(2040,3,0,0.5)"}. Register a parser that turns it into objects.
function parseSkewNormalArray(value: string) {
	return [...value.matchAll(/\(([^)]*)\)/g)].map((match) => {
		const [xi, omega, alpha, weight] = match[1].split(',').map(Number);
		return { xi, omega, alpha, weight };
	});
}

try {
	const result = await db.query(`SELECT 'skew_normal_parameter_t[]'::regtype::oid AS oid`);
	pg.types.setTypeParser(result.rows[0].oid, parseSkewNormalArray);
} catch (e) {
	console.error('Could not register skew_normal_parameter_t[] parser', e);
}
