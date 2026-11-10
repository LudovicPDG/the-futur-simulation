import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { GENIE_SYSTEM_PROMPT } from './GeniePrompt';
import { db } from '../utils/database';
import { toStrictJSONSchema } from './JsonSchema';

export abstract class BaseSimulationObject<
	T extends {
		type?: string;
		name?: any;
		description?: any;
		other?: any;
		existence?: any;
		/** One number for an element, a function of the time for a proof. */
		originality?: unknown;
		/** One number for an element, a function of the time for a proof. */
		impact?: unknown;
	}
> {
	protected abstract schema: z.ZodType<T>;
	protected abstract typeName: string;
	protected abstract tableName: string;
	/** Whether the id returned by insert_in_db identifies a fact or a relation (for the founding proof). */
	protected proofOwner: 'fact' | 'relation' = 'fact';

	async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<T> {
		const data = await this.generate(model_name, level_of_reasoning, prompt);
		// The originality is not guessed while the element is written: the genie compares it with all the other elements.
		const originality = await this.elementOriginality(model_name, level_of_reasoning, data);
		if (originality !== undefined) (data as { originality?: unknown }).originality = originality;
		const id = await this.insert_in_db(data);
		// A newly created fact (or fact subtype) or relation also gets a founding proof: the source it is based on.
		if (typeof id === 'string') {
			try {
				const { ProofServer } = await import('./Proof');
				await ProofServer.instance.createInitialProof(
					model_name,
					level_of_reasoning,
					prompt,
					this.proofOwner === 'relation' ? { relationId: id } : { factId: id },
					data as Record<string, unknown>
				);
			} catch (error) {
				console.error(`Could not create the initial proof of the new ${this.typeName}:`, error);
			}
		}
		return data;
	}

	protected async generate(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<T> {
		return this.generateWithSchema(model_name, level_of_reasoning, prompt, this.schema);
	}

	/** The most other objects the genie compares a new one with (the most recent ones when there are more). */
	private static readonly MAX_COMPARED = 200;

	/**
	 * The originality of a new object (0 to 100): the genie compares it with all the other objects of its kind and gives a
	 * single number. 100 without any call when there is nothing to compare with. A failed analysis gives a neutral 50.
	 */
	protected async scoreOriginality(
		model_name: string,
		level_of_reasoning: string,
		subject: string,
		candidate: unknown,
		others: unknown[]
	): Promise<number> {
		if (others.length === 0) return 100;
		try {
			const { originality } = await this.generateWithSchema(
				model_name,
				level_of_reasoning,
				`Compare the NEW ${subject} with each of the ${others.length} OTHER ones already in the simulation and give the originality of the new one.

Originality is a single percentage from 0 to 100 (NOT a ratio between 0 and 1): 0 = a copy (or a paraphrase) of one that already exists, 50 = moderately original, 100 = nothing similar exists. Judge the meaning, not the words: the same idea written differently is not original. It keeps people from spamming the same thing to make it more probable. Use the whole scale.

NEW ${subject}:
${JSON.stringify(candidate)}

OTHER ${subject}s:
${JSON.stringify(others.slice(-BaseSimulationObject.MAX_COMPARED))}`,
				z.object({
					originality: z.number().describe('The originality of the new one, from 0 to 100, as a percentage')
				}),
				`Give the originality score of a new ${subject}, compared with the other ones.`
			);
			return Math.min(100, Math.max(0, Math.round(originality)));
		} catch (error) {
			console.error(`Could not analyse the originality of the ${subject}:`, error);
			return 50;
		}
	}

	/**
	 * The originality of a new element, compared with all the other elements of its kind (the relations for a relation,
	 * the other facts for any other element). Undefined for an object that has its own way to be scored.
	 */
	protected async elementOriginality(
		model_name: string,
		level_of_reasoning: string,
		data: T
	): Promise<number | undefined> {
		const isRelation = this.proofOwner === 'relation';
		const result = await db.query(
			isRelation
				? `SELECT to_jsonb(name) AS name, to_jsonb(description) AS description, element1_id, element2_id,
						to_jsonb(element1_element2_connexions) AS element1_element2_value_to_modify,
						to_jsonb(element2_element1_connexions) AS element2_element1_value_to_modify,
						symmetric_connexions AS symmetric_value_to_modify
					FROM relations`
				: `SELECT type, to_jsonb(name) AS name, to_jsonb(description) AS description, to_jsonb(other) AS other FROM facts`
		);
		// The new element is not saved yet: all the elements in the database are the others.
		const { existence: _existence, originality: _originality, impact: _impact, ...candidate } = data;
		return this.scoreOriginality(
			model_name,
			level_of_reasoning,
			isRelation ? 'relation' : 'simulation element',
			candidate,
			result.rows
		);
	}

	protected async generateWithSchema<S extends z.ZodType>(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		schema: S,
		task: string = `Create a new ${this.typeName} based on the user's request.`
	): Promise<z.infer<S>> {
		const task_prompt =
			GENIE_SYSTEM_PROMPT +
			`

			## Your task

			${task}

			Here is the user's request :

			${prompt}

			`;

		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: model_name,
				messages: [
					{ role: 'system', content: task_prompt },
					{ role: 'user', content: prompt }
				],
				reasoning: {
					effort: level_of_reasoning
				},
				response_format: {
					type: 'json_schema',
					json_schema: {
						name: `create_${this.typeName}`,
						strict: true,
						schema: toStrictJSONSchema(schema)
					}
				}
			})
		});

		const data = await response.json();
		console.log(`OpenRouter ${this.typeName} response:`, data);

		if (!response.ok || data.error) {
			console.error(`OpenRouter API error in ${this.typeName} create:`, data.error || data);
			throw new Error(`OpenRouter API error: ${JSON.stringify(data.error || data)}`);
		}

		const content = data.choices?.[0]?.message?.content;

		if (!content) {
			console.error(
				'OpenRouter returned empty content. Full response:',
				JSON.stringify(data, null, 2)
			);
			throw new Error('OpenRouter returned an empty response');
		}

		let json: unknown;
		try {
			json = JSON.parse(content);
		} catch {
			throw new Error('OpenRouter returned invalid JSON');
		}

		const actionResult = schema.parse(json);
		console.log(`${this.typeName} parsed:`, actionResult);

		return actionResult;
	}

	/** Returns the id of the created fact when the object is a fact (or one of its subtypes). */
	protected abstract insert_in_db(data: T): Promise<string | void>;
	abstract get_all(): Promise<T[]>;
}
