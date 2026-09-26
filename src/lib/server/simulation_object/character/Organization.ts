import { BaseSimulationObject } from '../BaseSimulationObject';
import { OrganizationSchema, type OrganizationData } from '$lib/simulation/character/Organization';
import { convertToPg } from '../Genie';
import { db } from '../../utils/database';

export class OrganizationServer extends BaseSimulationObject<OrganizationData> {
	protected schema = OrganizationSchema;
	protected typeName = 'organization';
	protected tableName = 'organizations';

	async insert_in_db(organization: OrganizationData): Promise<void> {
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
					convertToPg(organization.name),
					organization.type || 'organization',
					convertToPg(organization.description),
					convertToPg(organization.other),
					organization.impossibility,
					organization.probability_distribution,
					organization.originality
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
					convertToPg(organization.financial_resource),
					convertToPg(organization.power)
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
					convertToPg(organization.human_resource)
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

	async get_all(): Promise<OrganizationData[]> {
		const result = await db.query(`
			SELECT 
				f.id, f.type, f.name, f.description, f.other, f.impossibility, f.probability_distribution, f.originality,
				c.financial_resource, c.power,
				o.human_resource
			FROM organizations o
			JOIN characters c ON o.id = c.id
			JOIN facts f ON c.id = f.id
			WHERE f.type = 'organization'
		`);

		return result.rows.map((row) => ({
			type: 'organization' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			impossibility: Number(row.impossibility),
			probability_distribution: row.probability_distribution,
			originality: Number(row.originality),
			financial_resource: row.financial_resource,
			power: row.power || [],
			human_resource: row.human_resource
		}));
	}

	static instance = new OrganizationServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<OrganizationData> {
		return OrganizationServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all(): Promise<OrganizationData[]> {
		return OrganizationServer.instance.get_all();
	}
}

export const Organization = OrganizationServer;
