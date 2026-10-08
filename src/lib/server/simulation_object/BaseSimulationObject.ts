import { z } from 'zod';
import { OPENROUTER_API_KEY } from '$env/static/private';
import { Genie, convertToPg } from './Genie';
import { db } from '../utils/database';

export abstract class BaseSimulationObject<
	T extends {
		type?: string;
		name?: any;
		description?: any;
		other?: any;
		impossibility?: number;
		probability_distribution?: any;
		originality?: number;
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
		const id = await this.insert_in_db(data);
		// A newly created fact (or fact subtype) or relation also gets a founding proof: the source it is based on.
		if (typeof id === 'string') {
			try {
				const { ProofServer } = await import('./Proof');
				await ProofServer.instance.createInitialProof(model_name, level_of_reasoning, prompt, this.proofOwner === 'relation' ? { relationId: id } : { factId: id }, {
						impossibility: data.impossibility,
						probability_distribution: data.probability_distribution,
						originality: data.originality
					});
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

	protected async generateWithSchema<S extends z.ZodType>(
		model_name: string,
		level_of_reasoning: string,
		prompt: string,
		schema: S
	): Promise<z.infer<S>> {
		const task_prompt =
			Genie.system_prompt +
			`

			## Your task

			Create a new ${this.typeName} based on the user's request.

			Here is the user's request :

			${prompt}

			`;

		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
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
						schema: z.toJSONSchema(schema)
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
