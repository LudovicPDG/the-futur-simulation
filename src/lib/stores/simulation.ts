import { writable } from 'svelte/store';
import type { FactData } from '$lib/simulation/fact';
import type { PersonData } from '$lib/simulation/character/Person';
import type { OrganizationData } from '$lib/simulation/character/Organization';
import type { InterestGroupData } from '$lib/simulation/character/Interest_group';
import type { EventData } from '$lib/simulation/event/event';
import type { EvolutionData } from '$lib/simulation/event/Evolution';
import type { RankingData } from '$lib/simulation/event/Ranking';
import type { ActionData } from '$lib/simulation/Action';
import type { MaterialResourceData } from '$lib/simulation/Material_resouce';
import type { ProofData } from '$lib/simulation/Proof';
import type { RelationData } from '$lib/simulation/Relation';

export type SimulationElement =
	| FactData
	| PersonData
	| OrganizationData
	| InterestGroupData
	| EventData
	| EvolutionData
	| RankingData
	| ActionData
	| MaterialResourceData
	| ProofData
	| RelationData;

export interface SimulationStoreState {
	facts: FactData[];
	persons: PersonData[];
	organizations: OrganizationData[];
	interest_groups: InterestGroupData[];
	events: EventData[];
	evolutions: EvolutionData[];
	rankings: RankingData[];
	actions: ActionData[];
	material_resources: MaterialResourceData[];
	proofs: ProofData[];
	relations: RelationData[];
	all_elements: SimulationElement[];
}

const initialState: SimulationStoreState = {
	facts: [],
	persons: [],
	organizations: [],
	interest_groups: [],
	events: [],
	evolutions: [],
	rankings: [],
	actions: [],
	material_resources: [],
	proofs: [],
	relations: [],
	all_elements: []
};

function deduplicateElements<T extends { name?: any; type?: string }>(list: T[]): T[] {
	const seen = new Set<string>();
	return list.filter((item) => {
		const label =
			typeof item.name === 'object' && item.name !== null
				? item.name.fr || item.name.en || JSON.stringify(item.name)
				: String(item.name || '');
		const key = `${item.type || 'element'}:${label}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function createSimulationStore() {
	const { subscribe, set, update } = writable<SimulationStoreState>(initialState);

	return {
		subscribe,
		set,
		update,
		init(initialData?: Partial<SimulationStoreState> & { all_elements?: SimulationElement[] }) {
			if (typeof window !== 'undefined') {
				const saved = localStorage.getItem('simulation_elements_state');
				if (saved) {
					try {
						const parsed = JSON.parse(saved);
						if (parsed && Array.isArray(parsed.all_elements) && parsed.all_elements.length > 0) {
							update((state) => ({ ...state, ...parsed }));
							return;
						}
					} catch (e) {
						console.error('Failed to parse cached simulation elements:', e);
					}
				}
			}

			if (initialData) {
				const all_elements: SimulationElement[] = initialData.all_elements || [
					...(initialData.facts || []),
					...(initialData.persons || []),
					...(initialData.organizations || []),
					...(initialData.interest_groups || []),
					...(initialData.events || []),
					...(initialData.evolutions || []),
					...(initialData.rankings || []),
					...(initialData.actions || []),
					...(initialData.material_resources || []),
					...(initialData.proofs || []),
					...(initialData.relations || [])
				];

				const newState: SimulationStoreState = {
					facts: initialData.facts || [],
					persons: initialData.persons || [],
					organizations: initialData.organizations || [],
					interest_groups: initialData.interest_groups || [],
					events: initialData.events || [],
					evolutions: initialData.evolutions || [],
					rankings: initialData.rankings || [],
					actions: initialData.actions || [],
					material_resources: initialData.material_resources || [],
					proofs: initialData.proofs || [],
					relations: initialData.relations || [],
					all_elements: deduplicateElements(all_elements)
				};

				update(() => newState);

				if (typeof window !== 'undefined') {
					localStorage.setItem('simulation_elements_state', JSON.stringify(newState));
				}
			}
		},

		addElement(element: unknown) {
			if (typeof element !== 'object' || element === null) return;

			const typedElement = element as SimulationElement;
			const type = (typedElement as { type?: string }).type || 'fact';

			update((state) => {
				const all_elements = deduplicateElements([...state.all_elements, typedElement]);
				const newState: SimulationStoreState = {
					...state,
					all_elements
				};

				switch (type) {
					case 'fact':
						newState.facts = deduplicateElements([...state.facts, typedElement as FactData]);
						break;
					case 'person':
						newState.persons = deduplicateElements([...state.persons, typedElement as PersonData]);
						break;
					case 'organization':
						newState.organizations = deduplicateElements([
							...state.organizations,
							typedElement as OrganizationData
						]);
						break;
					case 'interest_group':
						newState.interest_groups = deduplicateElements([
							...state.interest_groups,
							typedElement as InterestGroupData
						]);
						break;
					case 'event':
						newState.events = deduplicateElements([...state.events, typedElement as EventData]);
						break;
					case 'evolution':
						newState.evolutions = deduplicateElements([
							...state.evolutions,
							typedElement as EvolutionData
						]);
						break;
					case 'ranking':
						newState.rankings = deduplicateElements([...state.rankings, typedElement as RankingData]);
						break;
					case 'action':
						newState.actions = deduplicateElements([...state.actions, typedElement as ActionData]);
						break;
					case 'material_resource':
						newState.material_resources = deduplicateElements([
							...state.material_resources,
							typedElement as MaterialResourceData
						]);
						break;
					case 'proof':
						newState.proofs = deduplicateElements([...state.proofs, typedElement as ProofData]);
						break;
					case 'relation':
						newState.relations = deduplicateElements([
							...state.relations,
							typedElement as RelationData
						]);
						break;
				}

				if (typeof window !== 'undefined') {
					localStorage.setItem('simulation_elements_state', JSON.stringify(newState));
				}

				return newState;
			});
		},

		addFact(fact: FactData) {
			this.addElement(fact);
		}
	};
}

export const simulationStore = createSimulationStore();
