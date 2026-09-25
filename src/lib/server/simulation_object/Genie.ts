import { z } from 'zod';
import { db } from '../utils/database';
import { OPENROUTER_API_KEY } from '$env/static/private';
import type { FactData } from '$lib/simulation_declaration/fact';
import type { OrganizationData } from '$lib/simulation_declaration/character/Organization';
import type { PersonData } from '$lib/simulation_declaration/character/Person';
import type { InterestGroupData } from '$lib/simulation_declaration/character/Interest_group';
import type { EvolutionData } from '$lib/simulation_declaration/event/Evolution';
import type { EventData } from '$lib/simulation_declaration/event/event';
import type { RankingData } from '$lib/simulation_declaration/event/Ranking';
import type { ActionData } from '$lib/simulation_declaration/Action';
import type { MaterialResourceData } from '$lib/simulation_declaration/Material_resouce';
import type { ProofData } from '$lib/simulation_declaration/Proof';
import type { RelationData } from '$lib/simulation_declaration/Relation';
import { Fact } from './fact';

function escapePgString(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r');
}

function convertToPgArrayElement(value: unknown): string {
	const converted = convertToPg(value);

	// PostgreSQL array element containing a composite
	return `"${converted.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function convertToPg(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	// PostgreSQL array
	if (Array.isArray(value)) {
		return `{${value.map((item) => convertToPgArrayElement(item)).join(',')}}`;
	}

	// PostgreSQL composite
	if (typeof value === 'object') {
		const object = value as Record<string, unknown>;

		// other_fact_t:
		// (
		//     name TEXT,
		//     value JSONB
		// )
		if ('name' in object && 'value' in object) {
			const name = convertToPg(object.name);

			// JSON.stringify is important here because value is JSONB
			const jsonValue = JSON.stringify(object.value);

			return `(${name},"${escapePgString(jsonValue)}")`;
		}

		// Other PostgreSQL composite types
		const values = Object.values(object);

		return `(${values.map((item) => convertToPg(item)).join(',')})`;
	}

	// PostgreSQL composite string
	if (typeof value === 'string') {
		return `"${escapePgString(value)}"`;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	throw new Error(`Unsupported value: ${typeof value}`);
}

const ActionSchema = z.object({
	action: z.enum([
		'create_organisation',
		'create_person',
		'create_interest_group',
		'create_evolution',
		'create_fact',
		'create_event',
		'create_ranking',
		'create_action',
		'create_material_resource',
		'add_proof',
		'add_relation',
		'answer_user'
	])
});

export type WorldData =
	| FactData
	| OrganizationData
	| PersonData
	| InterestGroupData
	| EvolutionData
	| EventData
	| RankingData
	| ActionData
	| MaterialResourceData
	| ProofData
	| RelationData
	| string;

export class Genie {
	static system_prompt = `
	You are the master of a simulation whose purpose is to attempt to predict the most probable futures and analyze the different actions that the actors represented in the simulation may undertake. These actors represent real-world entities such as important individuals, organizations, institutions, and other relevant actors.

	Your role is to analyze:

	* possible future scenarios and their probability of occurring;
	* the actions that different actors may undertake;
	* the probability that these actions will actually be carried out;
	* the potential consequences of these actions;
	* the interactions and dependencies between the different elements of the simulation.
	* the proofs that user can give you.

	### Facts

	All elements present in the simulation are considered **facts**.

	There are four predefined major types of facts:

	1. **Event** — a past, present, or future event that may influence the simulation.
	2. **Character** — an individual actor who may have objectives, resources, and the ability to perform actions.
	3. **Action** — an action that has been performed or may be performed by an actor.
	4. **Material Resource** — a physical resource that can contribute to the capabilities of an actor or organization.

	Material resources, together with **financial resources** and **human resources**, contribute to determining the ability of organizations to perform actions.

	Although four types of facts are predefined, you may create additional types of facts when you consider them necessary to accurately represent an important element of reality.

	### Relationships Between Facts

	All elements of the simulation can be connected to one another through **relationships**.

	These relationships can represent, among other things:

	* dependencies between elements;
	* causal relationships;
	* interactions between actors;
	* ownership or use of resources;
	* the consequences of an action on another element;
	* any other relationship that is relevant to understanding the evolution of the simulation.

	if a **Character** wants to modify an **Event** or any other element of the simulation, the Character must first perform an **Action** that produces this modification.

	For example, a Character cannot directly change an Event simply because the Character is connected to that Event. The Character must perform an Action, and that Action may then modify the Event.

	When an Action modifies an element, other elements connected to or dependent on that element may also be affected.

	### Proof System

	All facts and their properties can be **challenged and debated by users** through an proofs system.

	Users may provide proofs in order to support, question, or modify an element of the simulation.

	When a proof leads to a change in one of a fact's properties, this change may propagate to other elements that depend on or are connected to that property.

	You must therefore treat the simulation as a dynamic system in which a local modification can produce a chain of direct and indirect consequences throughout the simulation.

	### General Objective

	Your objective is to maintain a representation of the simulated world that is as coherent and realistic as possible, and to use this representation to explore possible futures.

	The simulation should not assume that an event will occur simply because it is possible. Its probability should depend on the relevant facts, actors, resources, relationships, actions, and evidence available within the simulation.
	`;

	constructor(
		private model_name: string = 'openai/gpt-5.6-luna',
		private level_of_reasoning: string = 'low'
	) {}

	async ask(prompt: string): Promise<WorldData | string> {
		console.log('demande au genie :', prompt);
		const task_prompt =
			Genie.system_prompt +
			`

		## Task

		Here is the user's question:

		${prompt}

		Based on the user's question, you must choose to perform one of the following actions:

		- create_organisation
		- create_person
		- create_interest_group
		- create_evolution
		- create_fact
		- create_event
		- create_ranking
		- create_action
		- create_material_resource
		- add_proof
		- add_relation
		- answer_user (if the question of the user does not require an action and he just want some information)



		`;
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.model_name,
				messages: [
					{ role: 'system', content: task_prompt },
					{ role: 'user', content: prompt }
				],
				reasoning: {
					effort: this.level_of_reasoning
				},
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

		const actionResult = ActionSchema.parse(json);
		console.log('Action parsed:', actionResult);

		switch (actionResult.action) {
			case 'create_organisation': {
				console.log('create_organisation');
			}
			case 'create_action': {
				console.log('create_action');
			}
			case 'create_person': {
				console.log('create_person');
			}
			case 'create_interest_group': {
				console.log('create_interest_group');
			}
			case 'create_evolution': {
				console.log('create_evolution');
			}
			case 'create_fact': {
				const fact = await Fact.create(this.model_name, this.level_of_reasoning, prompt);
				return fact.data;
			}
			case 'create_event': {
				console.log('create_event');
			}
			case 'create_ranking': {
				console.log('create_ranking');
			}
			case 'create_material_resource': {
				console.log('create_material_resource');
			}
			case 'add_proof': {
				console.log('add_proof');
			}
			case 'add_relation': {
				console.log('add_relation');
			}
			case 'answer_user': {
				console.log('answer_user');
			}
			default:
				return new Error('Action not recognized');
		}
	}
}
