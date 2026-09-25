import { z } from 'zod';
import { OPENROUTER_API_KEY } from '$env/static/private';
import { Genie, convertToPg } from './Genie';
import { db } from '../utils/database';
import { FactSchema } from '$lib/simulation_declaration/fact';
import type { FactData } from '$lib/simulation_declaration/fact';

export class Fact {
	constructor(private fact: FactData) {}

	static async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<Fact> {
		const fact_data = await this.generate(model_name, level_of_reasoning, prompt);
		this.insert_in_db(fact_data);
		return new Fact(fact_data);
	}

	private static async generate(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<FactData> {
		const task_prompt =
			Genie.system_prompt +
			`

			## Your task

			Create a new fact based on the user's request.

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
						name: 'create_fact',
						strict: true,
						schema: z.toJSONSchema(FactSchema)
					}
				}
			})
		});

		const data = await response.json();
		console.log('OpenRouter ask response:', data);

		if (!response.ok || data.error) {
			console.error('OpenRouter API error in ask():', data.error || data);
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

		const actionResult = FactSchema.parse(json);
		console.log('Action parsed:', actionResult);

		return actionResult;
	}

	private static async insert_in_db(fact: FactData) {
		console.log(convertToPg(fact.name));
		console.log(convertToPg(fact.description));
		console.log(convertToPg(fact.other));
		await db.query(
			`INSERT INTO facts (
		name,
		type,
		description,
		other,
		impossibility,
		probability_distribution,
		originality
	) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			[
				convertToPg(fact.name),
				fact.type,
				convertToPg(fact.description),
				convertToPg(fact.other),
				fact.impossibility,
				fact.probability_distribution,
				fact.originality
			]
		);
	}

	get data(): FactData {
		return this.fact;
	}
}
