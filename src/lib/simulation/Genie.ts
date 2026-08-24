import { OPENROUTER_API_KEY } from '$env/static/private';
import z from 'zod';
import { Organisation, OrganisationSchema } from './Organisation';

const ActionSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('create_organisation'),
		data: OrganisationSchema
	})
	/*
	z.object({
		action: z.literal('create_person'),
		data: PersonSchema
	}),

	z.object({
		action: z.literal('create_event'),
		data: EventSchema
	})*/
]);

class Genie {
	constructor(
		private model_name: string,
		private level_of_reasoning: string
	) {}

	async ask(question: string) {
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

		if (!content) {
			throw new Error('OpenRouter returned an empty response');
		}

		let json: unknown;

		try {
			json = JSON.parse(content);
		} catch {
			throw new Error('OpenRouter returned invalid JSON');
		}
		const action = ActionSchema.parse(json);

		console.log(action.data);

		switch (action.action) {
			case 'create_organisation':
				new Organisation(action.data);
				break;
		}
	}
}
