import { z } from 'zod';
import { OPENROUTER_API_KEY } from '$env/static/private';
import { Genie, convertToPg } from './Genie';
import { db } from '../utils/database';

export abstract class BaseSimulationObject<T extends { type?: string; name?: any; description?: any; other?: any; impossibility?: number; probability_distribution?: string; originality?: number }> {
	protected abstract schema: z.ZodType<T>;
	protected abstract typeName: string;
	protected abstract tableName: string;

	async create(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<T> {
		const data = await this.generate(model_name, level_of_reasoning, prompt);
		await this.insert_in_db(data);
		return data;
	}

	protected async generate(
		model_name: string = 'openai/gpt-5.6-luna',
		level_of_reasoning: string = 'low',
		prompt: string
	): Promise<T> {
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
						schema: z.toJSONSchema(this.schema)
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

		const actionResult = this.schema.parse(json);
		console.log(`${this.typeName} parsed:`, actionResult);

		return actionResult;
	}

	protected abstract insert_in_db(data: T): Promise<void>;
	abstract get_all(): Promise<T[]>;
}
