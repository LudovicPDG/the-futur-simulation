import { BaseSimulationObject } from '../BaseSimulationObject';
import { PersonSchema, type PersonData } from '$lib/simulation/character/Person';
import { convertToPg } from '../Genie';
import { db } from '../../utils/database';

export class PersonServer extends BaseSimulationObject<PersonData> {
	protected schema = PersonSchema;
	protected typeName = 'person';
	protected tableName = 'persons';

	async insert_in_db(person: PersonData): Promise<void> {
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
					convertToPg(person.name),
					person.type || 'person',
					convertToPg(person.description),
					convertToPg(person.other),
					person.impossibility,
					person.probability_distribution,
					person.originality
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
					convertToPg(person.financial_resource),
					convertToPg(person.power)
				]
			);

			// 3. Insert into persons
			await client.query(
				`INSERT INTO persons (id) VALUES ($1)`,
				[id]
			);

			await client.query('COMMIT');
		} catch (e) {
			await client.query('ROLLBACK');
			throw e;
		} finally {
			client.release();
		}
	}

	async get_all(): Promise<PersonData[]> {
		const result = await db.query(`
			SELECT 
				f.id, f.type, f.name, f.description, f.other, f.impossibility, f.probability_distribution, f.originality,
				c.financial_resource, c.power
			FROM persons p
			JOIN characters c ON p.id = c.id
			JOIN facts f ON c.id = f.id
		`);

		return result.rows.map((row) => ({
			type: 'person' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			impossibility: Number(row.impossibility),
			probability_distribution: row.probability_distribution,
			originality: Number(row.originality),
			financial_resource: row.financial_resource,
			power: row.power || []
		}));
	}

	static instance = new PersonServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<PersonData> {
		return PersonServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all(): Promise<PersonData[]> {
		return PersonServer.instance.get_all();
	}
}

export const Person = PersonServer;
