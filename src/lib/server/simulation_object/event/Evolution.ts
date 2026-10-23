import { BaseSimulationObject } from '../BaseSimulationObject';
import { EvolutionSchema, type EvolutionData } from '$lib/simulation/event/Evolution';
import { convertToPg, convertToPgNullable } from '../Genie';
import { db } from '../../utils/database';

export class EvolutionServer extends BaseSimulationObject<EvolutionData> {
	protected schema = EvolutionSchema;
	protected typeName = 'evolution';
	protected tableName = 'evolutions';

	async insert_in_db(evolution: EvolutionData): Promise<string> {
		const client = await db.connect();
		try {
			await client.query('BEGIN');
			// 1. Insert into facts
			const factRes = await client.query(
				`INSERT INTO facts (
					name,
					type,
					description,
					other,
					existence,
					originality,
					impact
				) VALUES ($1, $2, $3, $4, $5, $6, $7)
				RETURNING id`,
				[
					convertToPg(evolution.name),
					evolution.type || 'evolution',
					convertToPg(evolution.description),
					convertToPgNullable(evolution.other),
					convertToPg(evolution.existence),
					evolution.originality,
					evolution.impact
				]
			);
			const id = factRes.rows[0].id;

			// 2. Insert into events
			await client.query(`INSERT INTO events (id) VALUES ($1)`, [id]);

			// 3. Insert into evolutions
			await client.query(
				`INSERT INTO evolutions (
					id,
					evolution,
					unit
				) VALUES ($1, $2, $3)`,
				[id, JSON.stringify(evolution.evolution), evolution.unit]
			);

			await client.query('COMMIT');
			return id;
		} catch (e) {
			await client.query('ROLLBACK');
			throw e;
		} finally {
			client.release();
		}
	}

	async get_all(): Promise<EvolutionData[]> {
		const result = await db.query(`
			SELECT 
				f.id, f.type, f.name, f.description, to_jsonb(f.other) AS other, to_jsonb(f.existence) AS existence, f.originality, f.impact,
				ev.evolution, ev.unit
			FROM evolutions ev
			JOIN events e ON ev.id = e.id
			JOIN facts f ON e.id = f.id
		`);

		return result.rows.map((row) => ({
			id: row.id,
			type: 'evolution' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			existence: row.existence,
			originality: Number(row.originality),
			impact: Number(row.impact),
			evolution: row.evolution,
			unit: row.unit
		}));
	}

	static instance = new EvolutionServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<EvolutionData> {
		return EvolutionServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all(): Promise<EvolutionData[]> {
		return EvolutionServer.instance.get_all();
	}
}

export const Evolution = EvolutionServer;
