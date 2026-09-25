import pg from 'pg';

const { Pool } = pg;

export const db = new Pool({
	host: process.env.POSTGRES_HOST,
	port: Number(process.env.POSTGRES_PORT),
	database: process.env.POSTGRES_DATABASE,
	user: process.env.POSTGRES_USER,
	password: process.env.POSTGRES_PASSWORD
});

export async function resetDatabase() {
	const client = await db.connect();

	try {
		await client.query('BEGIN');

		await client.query(`
			DROP TABLE IF EXISTS
				relations,
				proof_relations,
				proofs,
				interest_groups,
				persons,
				organizations,
				characters,
				rankings,
				evolutions,
				events,
				actions,
				material_resources,
				facts
			CASCADE;
		`);

		await client.query(`
			DROP TYPE IF EXISTS
				action_material_resource_t,
				ranking_element_t,
				other_fact_t,
				relation_connexion_t,
				evolution_t,
				translation_t
			CASCADE;
		`);

		await client.query('COMMIT');

		console.log('🗑️ Base réinitialisée.');
	} catch (error) {
		await client.query('ROLLBACK');
		console.log('Error!');
		throw error;
	} finally {
		console.log('release');
		client.release();
	}
}

resetDatabase();
