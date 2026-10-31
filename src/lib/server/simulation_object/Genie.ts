import { z } from 'zod';
import { db } from '../utils/database';
import { env } from '$env/dynamic/private';
import type { FactData } from '$lib/simulation/fact';
import type { OrganizationData } from '$lib/simulation/character/Organization';
import type { PersonData } from '$lib/simulation/character/Person';
import type { InterestGroupData } from '$lib/simulation/character/Interest_group';
import type { EvolutionData } from '$lib/simulation/event/Evolution';
import type { EventData } from '$lib/simulation/event/event';
import type { RankingData } from '$lib/simulation/event/Ranking';
import type { ActionData } from '$lib/simulation/Action';
import type { MaterialResourceData } from '$lib/simulation/Material_resouce';
import type { ProofData } from '$lib/simulation/Proof';
import type { RelationData } from '$lib/simulation/Relation';
import { resolveElement } from '$lib/simulation/ProofResolution';

import { GENIE_SYSTEM_PROMPT } from './GeniePrompt';
import { Fact } from './fact';
import { Person } from './character/Person';
import { Organization } from './character/Organization';
import { InterestGroup } from './character/Interest_group';
import { Event } from './event/event';
import { Evolution } from './event/Evolution';
import { Ranking } from './event/Ranking';
import { Action } from './Action';
import { MaterialResource } from './Material_resouce';
import { Proof } from './Proof';
import { Relation } from './Relation';
import { Value, type ValueListField } from './Value';

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
	constructor(
		private model_name: string = 'openai/gpt-5.6-luna',
		private level_of_reasoning: string = 'low'
	) {}

	async ask(
		prompt: string,
		options: {
			debateProofId?: string;
			addValue?: { factId: string; field: ValueListField };
			addProof?: { id: string; kind: 'fact' | 'relation'; valueName: unknown };
			addRelation?: { elementId: string; valueName?: unknown };
		} = {}
	): Promise<WorldData | string> {
		console.log('demande au genie :', prompt);

		// The user chose to debate a proof: the request is a sub-proof of that proof.
		if (options.debateProofId) {
			return Proof.createSubProof(
				this.model_name,
				this.level_of_reasoning,
				prompt,
				options.debateProofId
			);
		}

		// The user chose a list of an element: the request is a new value of this list.
		if (options.addValue) {
			return Value.add(
				this.model_name,
				this.level_of_reasoning,
				prompt,
				options.addValue.factId,
				options.addValue.field
			);
		}

		// The user chose a value: the request is a new proof of this value.
		if (options.addProof) {
			return Proof.createForValue(
				this.model_name,
				this.level_of_reasoning,
				prompt,
				options.addProof.kind === 'relation'
					? { relationId: options.addProof.id }
					: { factId: options.addProof.id },
				options.addProof.valueName as ProofData['value_name']
			);
		}

		// The user chose an element (and maybe one of its values): the request is a new relation involving it.
		if (options.addRelation) {
			const { elementId, valueName } = options.addRelation;
			const about =
				valueName === undefined
					? ''
					: ` The relation must concern its value ${JSON.stringify(valueName)}.`;
			return Relation.create(
				this.model_name,
				this.level_of_reasoning,
				`${prompt}\n\nThe relation must involve the existing simulation element whose ID is ${elementId} (use it as Element1 or Element2).${about}`
			);
		}

		const task_prompt =
			GENIE_SYSTEM_PROMPT +
			`

		## Task

		Here is the user's question:

		${prompt}

		Based on the user's question, you must choose to perform one of the following actions:

		- create_organisation (for create an organisation)
		- create_person (for create a person)
		- create_interest_group (for create an interest group. An interest group it's a thing that describe the will of certain person or organization, an interest group dosn't have structre like an organization it's simply a thing that represent interest of people like anti abortion, anti AI person etc.)
		- create_evolution (for create an evolution. Create a evolution for all the things that can be dependant of a time variable like the price of a material resource, the level of accessible ressource of  a material resource,  etc. Its evolution is a mathematical function of the year t, usually one single function.)
		- create_fact (for create a fact)
		- create_event (for create an event)
		- create_ranking (for create a ranking. Create a ranking for all the things that can be dependant of a ranking system like a political election, a competition, etc.)
		- create_action
		- create_material_resource
		- add_proof
		- add_relation
		- answer_user (if the question of the user does not require an action and he just want some information. Use answer user only when every other action is not relevant. If you dosn't well what to choose, do not choose this action.)

		`;
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
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
				return Organization.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'create_action': {
				return Action.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'create_person': {
				return Person.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'create_interest_group': {
				return InterestGroup.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'create_evolution': {
				return Evolution.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'create_fact': {
				return Fact.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'create_event': {
				return Event.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'create_ranking': {
				return Ranking.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'create_material_resource': {
				return MaterialResource.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'add_proof': {
				return Proof.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'add_relation': {
				return Relation.create(this.model_name, this.level_of_reasoning, prompt);
			}
			case 'answer_user': {
				return 'Answer from Genie';
			}
			default:
				throw new Error('Action not recognized');
		}
	}

	static async get_all_data() {
		const [
			storedFacts,
			storedPersons,
			storedOrganizations,
			storedInterestGroups,
			storedEvents,
			storedEvolutions,
			storedRankings,
			storedActions,
			storedMaterialResources,
			resolvedProofs,
			storedRelations
		] = await Promise.all([
			Fact.get_all_facts(),
			Person.get_all(),
			Organization.get_all(),
			InterestGroup.get_all(),
			Event.get_all(),
			Evolution.get_all(),
			Ranking.get_all(),
			Action.get_all(),
			MaterialResource.get_all(),
			Proof.get_all_resolved(),
			Relation.get_all()
		]);

		// Only the entries of the lists of a fact have an originality and an impact of their own.
		const proofs = Proof.withoutUnusedValueScores(resolvedProofs, [
			...storedFacts,
			...storedPersons,
			...storedOrganizations,
			...storedInterestGroups,
			...storedEvents,
			...storedEvolutions,
			...storedRankings,
			...storedActions,
			...storedMaterialResources,
			...storedRelations
		]);

		// Every value as decided by its best proof: the stored elements keep the values they were created with.
		const resolve = <T extends object>(elements: T[]) =>
			elements.map((element) => resolveElement(element, proofs));
		const facts = resolve(storedFacts);
		const persons = resolve(storedPersons);
		const organizations = resolve(storedOrganizations);
		const interest_groups = resolve(storedInterestGroups);
		const events = resolve(storedEvents);
		const evolutions = resolve(storedEvolutions);
		const rankings = resolve(storedRankings);
		const actions = resolve(storedActions);
		const material_resources = resolve(storedMaterialResources);
		const relations = resolve(storedRelations);

		return {
			facts,
			persons,
			organizations,
			interest_groups,
			events,
			evolutions,
			rankings,
			actions,
			material_resources,
			proofs,
			relations,
			all_elements: [
				...facts,
				...persons,
				...organizations,
				...interest_groups,
				...events,
				...evolutions,
				...rankings,
				...actions,
				...material_resources,
				...proofs,
				...relations
			]
		};
	}
}
