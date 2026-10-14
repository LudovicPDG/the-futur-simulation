import { BaseSimulationObject } from './BaseSimulationObject';
import { FactSchema, type FactData } from '$lib/simulation/fact';
import { convertToPg, convertToPgNullable } from './Genie';
import { db } from '../utils/database';

export class FactServer extends BaseSimulationObject<FactData> {
	protected schema = FactSchema;
	protected typeName = 'fact';
	protected tableName = 'facts';

	async insert_in_db(fact: FactData): Promise<string> {
		const result = await db.query(
			`INSERT INTO facts (
				name,
				type,
				description,
				other,
				impossibility,
				start_probability_distribution,
				end_probability_distribution,
				originality
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id`,
			[
				convertToPg(fact.name),
				fact.type || 'fact',
				convertToPg(fact.description),
				convertToPgNullable(fact.other),
				fact.impossibility,
				convertToPg(fact.start_probability_distribution),
				convertToPg(fact.end_probability_distribution),
				fact.originality
			]
		);
		return result.rows[0].id;
	}

	async get_all(): Promise<FactData[]> {
		const result = await db.query(`
			SELECT facts.*, to_jsonb(facts.other) AS other_json
			FROM facts
			WHERE type = 'fact'
		`);

		return result.rows.map((row) => ({
			id: row.id,
			name: row.name,
			type: row.type || 'fact',
			description: row.description,
			other: row.other_json,
			impossibility: Number(row.impossibility),
			start_probability_distribution: row.start_probability_distribution,
			end_probability_distribution: row.end_probability_distribution,
			originality: Number(row.originality)
		}));
	}

	static instance = new FactServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<FactData> {
		return FactServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all_facts(): Promise<FactData[]> {
		return FactServer.instance.get_all();
	}
}

export const Fact = FactServer;
