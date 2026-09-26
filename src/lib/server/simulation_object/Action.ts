import { BaseSimulationObject } from './BaseSimulationObject';
import { ActionSchema, type ActionData } from '$lib/simulation/Action';
import { convertToPg } from './Genie';
import { db } from '../utils/database';

export class ActionServer extends BaseSimulationObject<ActionData> {
	protected schema = ActionSchema;
	protected typeName = 'action';
	protected tableName = 'actions';

	async insert_in_db(action: ActionData): Promise<void> {
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
					convertToPg(action.name),
					action.type || 'action',
					convertToPg(action.description),
					convertToPg(action.other),
					action.impossibility,
					action.probability_distribution,
					action.originality
				]
			);
			const id = factRes.rows[0].id;

			// 2. Insert into actions
			await client.query(
				`INSERT INTO actions (
					id,
					material_resource_used,
					fund_used,
					human_mobilized
				) VALUES ($1, $2, $3, $4)`,
				[
					id,
					convertToPg(action.material_resource_used),
					convertToPg(action.fund_used),
					convertToPg(action.human_mobilized)
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

	async get_all(): Promise<ActionData[]> {
		const result = await db.query(`
			SELECT 
				f.id, f.type, f.name, f.description, f.other, f.impossibility, f.probability_distribution, f.originality,
				a.material_resource_used, a.fund_used, a.human_mobilized
			FROM actions a
			JOIN facts f ON a.id = f.id
		`);

		return result.rows.map((row) => ({
			type: 'action' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			impossibility: Number(row.impossibility),
			probability_distribution: row.probability_distribution,
			originality: Number(row.originality),
			material_resource_used: row.material_resource_used || [],
			fund_used: row.fund_used,
			human_mobilized: row.human_mobilized
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
