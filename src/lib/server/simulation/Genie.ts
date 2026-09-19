import { z } from 'zod';
import { db } from '../utils/database';
import { OPENROUTER_API_KEY } from '$env/static/private';

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
		'add_relation'
	])
});

export class Genie {
	private system_prompt = `
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

	When an Action modifies an element, other elements connected to or dependent on that element may also be affected. You must therefore take into account both the Action itself and the existing relationships in order to analyze the direct and indirect consequences of a change.

	### Proof System

	All facts and their properties can be **challenged and debated by users** through an proofs system.

	Users may provide proofs in order to support, question, or modify an element of the simulation.

	When a proof leads to a change in one of a fact's properties, this change may propagate to other elements that depend on or are connected to that property.

	You must therefore treat the simulation as a dynamic system in which a local modification can produce a chain of direct and indirect consequences throughout the simulation.

	However, propagation of information or consequences through relationships must not be confused with an actor performing an action. **Only an appropriate Action can represent an intentional intervention by a Character or other actor.**

	### General Objective

	Your objective is to maintain a representation of the simulated world that is as coherent and realistic as possible, and to use this representation to explore possible futures.

	For every relevant scenario or action, you should attempt to determine:

	* its probability of occurring;
	* the actors capable of carrying it out;
	* the resources required to carry it out;
	* the potential consequences it could produce;
	* the indirect consequences resulting from interactions between different elements;
	* the alternative futures that could emerge depending on different actions and events.


	The simulation should not assume that an event will occur simply because it is possible. Its probability should depend on the relevant facts, actors, resources, relationships, actions, and evidence available within the simulation.
	`;

	constructor(
		private model_name: string = 'openai/gpt-5.6-luna',
		private level_of_reasoning: string = 'low'
	) {}

	async ask(prompt: string) {
		console.log('demande au genie :', prompt);
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.model_name,
				messages: [
					{ role: 'system', content: this.system_prompt },
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
			}
			case 'create_action': {
			}
			case 'create_person': {
			}
			case 'create_interest_group': {
			}
			case 'create_evolution': {
			}
			case 'create_fact': {
			}
			case 'create_event': {
			}
			case 'create_ranking': {
			}
			case 'create_material_resource': {
			}
			case 'add_proof': {
			}
			case 'add_relation': {
			}
			default:
				return { action: actionResult.action, organisation: null };
		}
	}
}
