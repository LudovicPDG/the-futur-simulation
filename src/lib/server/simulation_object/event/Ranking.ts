import { BaseSimulationObject } from '../BaseSimulationObject';
import { RankingSchema, type RankingData } from '$lib/simulation/event/Ranking';
import { convertToPg, convertToPgNullable } from '../Genie';
import { db } from '../../utils/database';

export class RankingServer extends BaseSimulationObject<RankingData> {
	protected schema = RankingSchema;
	protected typeName = 'ranking';
	protected tableName = 'rankings';

	async insert_in_db(ranking: RankingData): Promise<string> {
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
					impossibility,
					probability_distribution,
					originality
				) VALUES ($1, $2, $3, $4, $5, $6, $7)
				RETURNING id`,
				[
					convertToPg(ranking.name),
					ranking.type || 'ranking',
					convertToPg(ranking.description),
					convertToPgNullable(ranking.other),
					ranking.impossibility,
					convertToPg(ranking.probability_distribution),
					ranking.originality
				]
			);
			const id = factRes.rows[0].id;

			// 2. Insert into events
			await client.query(`INSERT INTO events (id) VALUES ($1)`, [id]);

			// 3. Insert into rankings
			await client.query(
				`INSERT INTO rankings (
					id,
					rankings
				) VALUES ($1, $2)`,
				[id, convertToPg(ranking.rankings)]
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

	async get_all(): Promise<RankingData[]> {
		const result = await db.query(`
			SELECT 
				f.id, f.type, f.name, f.description, to_jsonb(f.other) AS other, f.impossibility, f.probability_distribution, f.originality,
				to_jsonb(r.rankings) AS rankings
			FROM rankings r
			JOIN events e ON r.id = e.id
			JOIN facts f ON e.id = f.id
		`);

		return result.rows.map((row) => ({
			id: row.id,
			type: 'ranking' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			impossibility: Number(row.impossibility),
			probability_distribution: row.probability_distribution,
			originality: Number(row.originality),
			rankings: row.rankings || []
		}));
	}

	static instance = new RankingServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<RankingData> {
		return RankingServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all(): Promise<RankingData[]> {
		return RankingServer.instance.get_all();
	}
}

export const Ranking = RankingServer;
