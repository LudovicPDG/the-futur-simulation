import { BaseSimulationObject } from '../BaseSimulationObject';
import { EventSchema, type EventData } from '$lib/simulation/event/event';
import { convertToPg, convertToPgNullable } from '../Genie';
import { db } from '../../utils/database';

export class EventServer extends BaseSimulationObject<EventData> {
	protected schema = EventSchema;
	protected typeName = 'event';
	protected tableName = 'events';

	async insert_in_db(event: EventData): Promise<string> {
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
					convertToPg(event.name),
					'event',
					convertToPg(event.description),
					convertToPgNullable(event.other),
					convertToPg(event.existence),
					event.originality
				]
			);
			const id = factRes.rows[0].id;

			// 2. Insert into events
			await client.query(`INSERT INTO events (id) VALUES ($1)`, [id]);

			await client.query('COMMIT');
			return id;
		} catch (e) {
			await client.query('ROLLBACK');
			throw e;
		} finally {
			client.release();
		}
	}

	async get_all(): Promise<EventData[]> {
		const result = await db.query(`
			SELECT 
				f.id, f.type, f.name, f.description, to_jsonb(f.other) AS other, to_jsonb(f.existence) AS existence, f.originality
			FROM events e
			JOIN facts f ON e.id = f.id
			WHERE lower(f.type) = 'event'
		`);

		return result.rows.map((row) => ({
			id: row.id,
			type: 'event' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			existence: row.existence,
			originality: Number(row.originality)
		}));
	}

	static instance = new EventServer();

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<EventData> {
		return EventServer.instance.create(model_name, level_of_reasoning, prompt);
	}

	static async get_all(): Promise<EventData[]> {
		return EventServer.instance.get_all();
	}
}

export const Event = EventServer;
