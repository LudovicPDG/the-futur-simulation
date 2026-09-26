import { BaseSimulationObject } from './BaseSimulationObject';
import { MaterialResourceSchema, type MaterialResourceData } from '$lib/simulation/Material_resouce';
import { convertToPg } from './Genie';
import { db } from '../utils/database';

export class MaterialResourceServer extends BaseSimulationObject<MaterialResourceData> {
	protected schema = MaterialResourceSchema;
	protected typeName = 'material_resource';
	protected tableName = 'material_resources';

	async insert_in_db(resource: MaterialResourceData): Promise<void> {
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
					convertToPg(resource.name),
					resource.type || 'material_resource',
					convertToPg(resource.description),
					convertToPg(resource.other),
					resource.impossibility,
					resource.probability_distribution,
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
				f.id, f.type, f.name, f.description, f.other, f.impossibility, f.probability_distribution, f.originality,
				m.number_of_units, m.financial_value, m.power
			FROM material_resources m
			JOIN facts f ON m.id = f.id
		`);

		return result.rows.map((row) => ({
			type: 'material_resource' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			impossibility: Number(row.impossibility),
			probability_distribution: row.probability_distribution,
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
