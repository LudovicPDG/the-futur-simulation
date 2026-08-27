import { OPENROUTER_API_KEY } from '$env/static/private';
import z from 'zod';
import { Organisation, OrganisationSchema } from './Organisation';

const ActionSchema = z.object({
	action: z.enum([
		'create_organisation',
		'create_person',
		'create_event',
		'delete_organisation',
		'delete_person',
		'delete_event',
		'modify_organisation',
		'modify_person',
		'modify_event',
		'no_action'
	])
});

export class Genie {
	constructor(
		private model_name: string = 'openai/gpt-5.6-luna',
		private level_of_reasoning: string = 'low'
	) {}

	async ask(question: string) {
		console.log('question', question);
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',

			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},

			body: JSON.stringify({
				model: this.model_name,

				messages: [
					{
						role: 'user',
						content: question
					}
				],

				response_format: {
					type: 'json_schema',

					json_schema: {
						name: 'simulation_action',
						strict: true,
						schema: z.toJSONSchema(ActionSchema)
					}
				}
			})
		});

		const data = await response.json();

		const content = data.choices?.[0]?.message?.content;

		console.log('OpenRouter response:', data);
		console.log('content:', content);

		if (!content) {
			throw new Error('OpenRouter returned an empty response');
		}

		let json: unknown;

		try {
			json = JSON.parse(content);
		} catch {
			throw new Error('OpenRouter returned invalid JSON');
		}
		const actionResult = ActionSchema.parse(JSON.parse(content));

		console.log(actionResult);

		switch (actionResult.action) {
			case 'create_organisation': {
				const org = await this.createOrganisation(question);
				return { action: actionResult.action, organisation: org.data };
			}
			default:
				return { action: actionResult.action, organisation: null };
		}
	}

	async createOrganisation(question: string) {
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',

			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},

			body: JSON.stringify({
				model: this.model_name,

				messages: [
					{
						role: 'system',
						content: 'Extrais les informations nécessaires pour créer une organisation.'
					},
					{
						role: 'user',
						content: question
					}
				],

				response_format: {
					type: 'json_schema',

					json_schema: {
						name: 'organisation',
						strict: true,
						schema: z.toJSONSchema(OrganisationSchema)
					}
				}
			})
		});

		const data = await response.json();

		const content = data.choices?.[0]?.message?.content;

		if (!content) {
			throw new Error('OpenRouter returned an empty response');
		}

		const organisation = OrganisationSchema.parse(JSON.parse(content));

		console.log('organisation:', organisation);

		return Organisation.init(organisation);
	}
}

export const genie = new Genie();
