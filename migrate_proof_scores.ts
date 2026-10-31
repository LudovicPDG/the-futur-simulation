import pg from 'pg';
import { pathToFileURL } from 'node:url';

const { Pool } = pg;

const db = new Pool({
	host: process.env.POSTGRES_HOST,
	port: Number(process.env.POSTGRES_PORT),
	database: process.env.POSTGRES_DATABASE,
	user: process.env.POSTGRES_USER,
	password: process.env.POSTGRES_PASSWORD
});

const SCORES = ['veracity', 'uncertainty', 'impact'] as const;
const DEFAULTS = { veracity: '50', uncertainty: '50', impact: '0' };

/**
 * The SQL that turns the given score columns into functions of the time t (text expressions, without uncertainty):
 * each number becomes a constant expression ("80"), and a score saved as a function with an uncertainty keeps its
 * function only.
 */
export function migrationSql(todo: readonly string[]) {
	return `
		ALTER TABLE proofs
			DROP CONSTRAINT IF EXISTS proofs_veracity_check,
			DROP CONSTRAINT IF EXISTS proofs_uncertainty_check,
			${todo.map((score) => `ALTER COLUMN ${score} DROP DEFAULT`).join(',\n\t\t\t')},
			${todo
				.map(
					(score) =>
						`ALTER COLUMN ${score} TYPE TEXT USING CASE WHEN pg_typeof(${score})::text = 'jsonb' THEN ${score}::jsonb->>'function' ELSE ${score}::text END`
				)
				.join(',\n\t\t\t')},
			${todo
				.map((score) => `ALTER COLUMN ${score} SET DEFAULT '${DEFAULTS[score as keyof typeof DEFAULTS]}'`)
				.join(',\n\t\t\t')};
	`;
}

/** The SQL that keeps only the function of the scores saved as a JSON function with an uncertainty. */
export function keepFunctionOnlySql(score: string) {
	return `UPDATE proofs SET ${score} = ${score}::jsonb->>'function' WHERE ${score} LIKE '{%'`;
}

/** Turns the veracity, the uncertainty and the impact of the existing proofs into functions of the time t. */
async function migrate() {
	const columns = await db.query(
		`SELECT column_name, data_type FROM information_schema.columns
		WHERE table_name = 'proofs' AND column_name = ANY($1)`,
		[SCORES]
	);
	const todo = SCORES.filter(
		(score) => columns.rows.find((row) => row.column_name === score)?.data_type !== 'text'
	);
	if (todo.length > 0) await db.query(migrationSql(todo));
	// Scores saved as a function with an uncertainty keep their function only.
	for (const score of SCORES) await db.query(keepFunctionOnlySql(score));
	console.log('✅ Proof scores are functions of the time, without uncertainty.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	migrate()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
