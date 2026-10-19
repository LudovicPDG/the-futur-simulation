import { z } from 'zod';
import { BaseSimulationObject } from './BaseSimulationObject';
import { convertToPg } from './Genie';
import { db } from '../utils/database';
import { TitledItemSchema } from '$lib/simulation/Translation';
import { OtherValueSchema, type FactData } from '$lib/simulation/fact';

/** The lists of a fact to which the user can ask the genie to add a value. */
export const VALUE_LIST_FIELDS = ['power', 'willing', 'other'] as const;
export type ValueListField = (typeof VALUE_LIST_FIELDS)[number];

export function isValueListField(field: unknown): field is ValueListField {
	return VALUE_LIST_FIELDS.includes(field as ValueListField);
}

/** Where each list is stored and the schema of one of its entries. */
const LISTS = {
	power: {
		tables: ['characters', 'material_resources'],
		type: 'titled_item_t',
		schema: TitledItemSchema,
		description:
			'one new capability: a short title (different from the existing ones) and its description'
	},
	willing: {
		tables: ['interest_groups'],
		type: 'titled_item_t',
		schema: TitledItemSchema,
		description:
			'one new willingness: a short title (different from the existing ones) and its description'
	},
	other: {
		tables: ['facts'],
		type: 'other_fact_t',
		schema: OtherValueSchema,
		description:
			'one new piece of other information: its name (different from the existing ones) and its value'
	}
} as const;

/** A value added by the user to a list of an existing fact (a capability, a willingness, an other information). */
export class ValueServer extends BaseSimulationObject<FactData> {
	protected schema = z.any();
	protected typeName = 'value';
	protected tableName = 'facts';

	async insert_in_db(): Promise<void> {
		throw new Error('A value is added to a fact with add()');
	}

	async get_all(): Promise<FactData[]> {
		return [];
	}

	/** Generates one new entry of the list of the fact, saves it, and gives it a founding proof. */
	async add(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		factId: string,
		field: ValueListField
	): Promise<FactData> {
		const list = LISTS[field];
		const fact = await db.query(`SELECT to_jsonb(facts) AS element FROM facts WHERE id = $1`, [
			factId
		]);
		if (fact.rows.length === 0) throw new Error('The element to add a value to does not exist');

		const current = await db.query(
			`SELECT to_jsonb(${list.tables[0] === 'facts' ? 'f.other' : `t.${field}`}) AS entries
			FROM facts f ${list.tables[0] === 'facts' ? '' : `JOIN ${list.tables[0]} t ON t.id = f.id`}
			WHERE f.id = $1`,
			[factId]
		);

		const generated = await this.generateWithSchema(
			model_name,
			level_of_reasoning,
			`${prompt}\n\nThe user wants to add a value to the list "${field}" of this simulation element:\n${JSON.stringify(fact.rows[0].element)}\n\nThe current entries of "${field}" are: ${JSON.stringify(current.rows[0]?.entries ?? [])}\n\nCreate ${list.description}. It must not repeat an existing entry and every text is translated in every language.`,
			list.schema
		);

		let saved = 0;
		for (const table of list.tables) {
			const column = field;
			const result = await db.query(
				`UPDATE ${table} SET ${column} = COALESCE(${column}, '{}') || $1::${list.type}[] WHERE id = $2`,
				[convertToPg([generated]), factId]
			);
			saved += result.rowCount ?? 0;
		}
		if (saved === 0) throw new Error(`This element has no list "${field}"`);

		try {
			const { ProofServer } = await import('./Proof');
			await ProofServer.instance.createInitialProof(
				model_name,
				level_of_reasoning,
				prompt,
				{ factId },
				{ [field]: [generated] }
			);
		} catch (error) {
			console.error('Could not create the founding proof of the new value:', error);
		}

		const updated = await db.query(`SELECT to_jsonb(facts) AS element FROM facts WHERE id = $1`, [
			factId
		]);
		return updated.rows[0].element as FactData;
	}

	static instance = new ValueServer();

	static async add(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		factId: string,
		field: ValueListField
	): Promise<FactData> {
		return ValueServer.instance.add(model_name, level_of_reasoning, prompt, factId, field);
	}
}

export const Value = ValueServer;
