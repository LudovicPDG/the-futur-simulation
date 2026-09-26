import { BaseSimulationObject } from '../BaseSimulationObject';
import { EventSchema, type EventData } from '$lib/simulation/event/event';
import { convertToPg } from '../Genie';
import { db } from '../../utils/database';

export class EventServer extends BaseSimulationObject<EventData> {
	protected schema = EventSchema;
	protected typeName = 'event';
	protected tableName = 'events';

	async insert_in_db(event: EventData): Promise<void> {
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
					convertToPg(event.name),
					event.type || 'event',
					convertToPg(event.description),
					convertToPg(event.other),
					event.impossibility,
					event.probability_distribution,
					event.originality
				]
			);
			const id = factRes.rows[0].id;

			// 2. Insert into events
			await client.query(
				`INSERT INTO events (id) VALUES ($1)`,
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

	async get_all(): Promise<EventData[]> {
		const result = await db.query(`
			SELECT 
				f.id, f.type, f.name, f.description, f.other, f.impossibility, f.probability_distribution, f.originality
			FROM events e
			JOIN facts f ON e.id = f.id
			WHERE f.type = 'event'
		`);

		return result.rows.map((row) => ({
			type: 'event' as const,
			name: row.name,
			description: row.description,
			other: row.other,
			impossibility: Number(row.impossibility),
			probability_distribution: row.probability_distribution,
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
