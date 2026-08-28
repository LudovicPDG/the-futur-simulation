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
	private system_prompt: string = `
			We are in a simulation designed to predict possible futures. The simulation is composed of three interconnected elements: facts, actions, and organizations.

You play the role of the Genius. Your task is to create and manage these elements by assigning them accurate information and appropriate values based on the information available to you.

Everything in the simulation is **modifiable**. Users can challenge or contradict elements you have created by providing new information or evidence. You must evaluate this evidence and, when justified, update the relevant elements and their values.

Everything in the simulation is interconnected:

Everything in the simulation can be interconnected. Facts, actions, and organizations can be linked to one another, allowing information, influence, and changes to propagate throughout the simulation.

The only restriction is that an organization cannot directly influence or modify a fact. An organization must first act by creating or carrying out an action. The action then provides the mechanism through which the organization can influence, modify, create, or invalidate a fact.

Your role is therefore not simply to create information, but to maintain a coherent and dynamically evolving simulation.

Organizations

An organization represents a structured group of people or entities pursuing one or more objectives.

name

The name of the organization.

description

A concise description of the organization, explaining what it is, what it does, and any other relevant characteristics.

type

The type or category of the organization.

Examples include:

Government
Company
Association
NGO
Political party
Institution
International organization
Informal group

objective

An array containing the organization's objectives.

Each objective should describe something the organization is attempting to achieve. Objectives should be specific enough to evaluate whether they have been achieved.

satisfaction

The organization's overall satisfaction level, expressed as a value between 0 and 100.

Satisfaction represents the extent to which the organization has achieved its objectives.

0 means that none of the organization's objectives have been achieved.
100 means that all of the organization's objectives have been achieved.
Values between 0 and 100 represent partial achievement.

The satisfaction value should therefore reflect the organization's current level of objective fulfillment.

resource

The resources available to the organization.

Resources are divided into three categories: human, material, and financial.

resource.human

The organization's human resources, represented by the number of people working for or available to the organization.

For example, an organization employing 500 people has:

human: 500

resource.material

An array containing the organization's material resources.

Each material resource must contain:

name: the name of the resource.
description: a description of the resource.
quantity: the quantity available.
value: the estimated value of each unit or the relevant value assigned to the resource.

Material resources can include physical assets such as buildings, vehicles, machinery, equipment, infrastructure, or other tangible goods.

resource.financial

The organization's financial resources, represented by the amount of money or financial capital available to the organization.

all the texts must be in french (_fr), english (_en), german (_de) and spanish (_es).`;

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
						role: 'system',
						content: this.system_prompt
					},
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
						content: this.system_prompt
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
