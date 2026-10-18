import { BaseSimulationObject } from './BaseSimulationObject';
import {
	MaterialResourceSchema,
	type MaterialResourceData
} from '$lib/simulation/Material_resouce';
import { convertToPg, convertToPgNullable } from './Genie';
import { db } from '../utils/database';

export class MaterialResourceServer extends BaseSimulationObject<MaterialResourceData> {
	protected schema = MaterialResourceSchema;
	protected typeName = 'material_resource';
	protected tableName = 'material_resources';

	async insert_in_db(resource: MaterialResourceData): Promise<string> {
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
					originality
				) VALUES ($1, $2, $3, $4, $5, $6)
				RETURNING id`,
				[
					convertToPg(resource.name),
					resource.type || 'material_resource',
					convertToPg(resource.description),
					convertToPgNullable(resource.other),
					convertToPg(resource.existence),
					resource.originality
				]
			);
			const id = factRes.rows[0].id;

			// 2. Insert into material_resources
			await client.query(
				`INSERT INTO material_resources (
					id,
					number_of_units,
					financial_value,
					power
				) VALUES ($1, $2, $3, $4)`,
				[
					id,
					convertToPg(resource.number_of_units),
					convertToPg(resource.financial_value),
					convertToPg(resource.power)
				]
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

	async get_all(): Promise<MaterialResourceData[]> {
		const result = await db.query(`
			SELECT 
				f.id, f.type, f.name, f.description, to_jsonb(f.other) AS other, to_jsonb(f.existence) AS existence, f.originality,
				to_jsonb(m.number_of_units) AS number_of_units, to_jsonb(m.financial_value) AS financial_value, to_jsonb(m.power) AS power
			FROM material_resources m
			JOIN facts f ON m.id = f.id
		`);

		return result.rows.map((row) => ({
			id: row.id,
			type: 'material_resource' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			existence: row.existence,
			originality: Number(row.originality),
			number_of_units: row.number_of_units,
			financial_value: row.financial_value,
			power: row.power || []
		}));
	}

	static instance = new MaterialResourceServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<MaterialResourceData> {
		return MaterialResourceServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all(): Promise<MaterialResourceData[]> {
		return MaterialResourceServer.instance.get_all();
	}
}

export const MaterialResource = MaterialResourceServer;
