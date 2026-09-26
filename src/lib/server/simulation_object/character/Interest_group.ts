import { BaseSimulationObject } from '../BaseSimulationObject';
import { InterestGroupSchema, type InterestGroupData } from '$lib/simulation/character/Interest_group';
import { convertToPg } from '../Genie';
import { db } from '../../utils/database';

export class InterestGroupServer extends BaseSimulationObject<InterestGroupData> {
	protected schema = InterestGroupSchema;
	protected typeName = 'interest_group';
	protected tableName = 'interest_groups';

	async insert_in_db(group: InterestGroupData): Promise<void> {
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
					convertToPg(group.name),
					group.type || 'interest_group',
					convertToPg(group.description),
					convertToPg(group.other),
					group.impossibility,
					group.probability_distribution,
					group.originality
				]
			);
			const id = factRes.rows[0].id;

			// 2. Insert into characters
			await client.query(
				`INSERT INTO characters (
					id,
					financial_resource,
					power
				) VALUES ($1, $2, $3)`,
				[
					id,
					convertToPg(group.financial_resource),
					convertToPg(group.power)
				]
			);

			// 3. Insert into organizations
			await client.query(
				`INSERT INTO organizations (
					id,
					human_resource
				) VALUES ($1, $2)`,
				[
					id,
					convertToPg(group.human_resource)
				]
			);

			// 4. Insert into interest_groups
			await client.query(
				`INSERT INTO interest_groups (
					id,
					willing,
					satisfaction
				) VALUES ($1, $2, $3)`,
				[
					id,
					convertToPg(group.willing),
					convertToPg(group.satisfaction)
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

	async get_all(): Promise<InterestGroupData[]> {
		const result = await db.query(`
			SELECT 
				f.id, f.type, f.name, f.description, f.other, f.impossibility, f.probability_distribution, f.originality,
				c.financial_resource, c.power,
				o.human_resource,
				ig.willing, ig.satisfaction
			FROM interest_groups ig
			JOIN organizations o ON ig.id = o.id
			JOIN characters c ON o.id = c.id
			JOIN facts f ON c.id = f.id
		`);

		return result.rows.map((row) => ({
			type: 'interest_group' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			impossibility: Number(row.impossibility),
			probability_distribution: row.probability_distribution,
			originality: Number(row.originality),
			financial_resource: row.financial_resource,
			power: row.power || [],
			human_resource: row.human_resource,
			willing: row.willing || [],
			satisfaction: row.satisfaction
		}));
	}

	static instance = new InterestGroupServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<InterestGroupData> {
		return InterestGroupServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all(): Promise<InterestGroupData[]> {
		return InterestGroupServer.instance.get_all();
	}
}

export const InterestGroup = InterestGroupServer;
