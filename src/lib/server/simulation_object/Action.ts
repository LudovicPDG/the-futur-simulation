import { BaseSimulationObject } from './BaseSimulationObject';
import { ActionSchema, type ActionData } from '$lib/simulation/Action';
import { convertToPg, convertToPgNullable } from './PgConversion';
import { db } from '../utils/database';

export class ActionServer extends BaseSimulationObject<ActionData> {
	protected schema = ActionSchema;
	protected typeName = 'action';
	protected tableName = 'actions';

	async insert_in_db(action: ActionData): Promise<string> {
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
					convertToPg(action.name),
					action.type || 'action',
					convertToPg(action.description),
					convertToPgNullable(action.other),
					convertToPg(action.existence),
					action.originality,
					action.impact
				]
			);
			const id = factRes.rows[0].id;

			// 2. Insert into actions
			await client.query(
				`INSERT INTO actions (
					id,
					material_resource_used,
					material_resource_necessary,
					fund_used,
					fund_necessary,
					human_mobilized,
					human_necessary
				) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				[
					id,
					convertToPg(action.material_resource_used),
					convertToPg(action.material_resource_necessary),
					convertToPg(action.fund_used),
					convertToPg(action.fund_necessary),
					convertToPg(action.human_mobilized),
					convertToPg(action.human_necessary)
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

	async get_all(): Promise<ActionData[]> {
		const result = await db.query(`
			SELECT 
				f.id, f.type, f.name, f.description, to_jsonb(f.other) AS other, to_jsonb(f.existence) AS existence, f.originality, f.impact,
				to_jsonb(a.material_resource_used) AS material_resource_used, to_jsonb(a.material_resource_necessary) AS material_resource_necessary,
				to_jsonb(a.fund_used) AS fund_used, to_jsonb(a.fund_necessary) AS fund_necessary,
				to_jsonb(a.human_mobilized) AS human_mobilized, to_jsonb(a.human_necessary) AS human_necessary
			FROM actions a
			JOIN facts f ON a.id = f.id
		`);

		return result.rows.map((row) => ({
			id: row.id,
			type: 'action' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			existence: row.existence,
			originality: Number(row.originality),
			impact: Number(row.impact),
			material_resource_used: row.material_resource_used || [],
			material_resource_necessary: row.material_resource_necessary || [],
			fund_used: row.fund_used,
			fund_necessary: row.fund_necessary,
			human_mobilized: row.human_mobilized,
			human_necessary: row.human_necessary
		}));
	}

	static instance = new ActionServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<ActionData> {
		return ActionServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all(): Promise<ActionData[]> {
		return ActionServer.instance.get_all();
	}
}

export const Action = ActionServer;
