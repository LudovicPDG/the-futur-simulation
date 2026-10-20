import { writable } from 'svelte/store';
import type { RelationListField } from '$lib/simulation/Relation';

export interface DebateTarget {
	id: string;
	name: string;
}

/** The proof the user wants to debate; shown as a chip next to the prompt bar. */
export const debateTarget = writable<DebateTarget | null>(null);

/** The lists of a fact whose entries the user can ask the genie to extend. */
export type ValueListField =
	| 'power'
	| 'willing'
	| 'other'
	| 'rankings'
	| RelationListField;

export interface AddValueTarget {
	factId: string;
	field: ValueListField;
	/** Shown in the chip: the list and the element it belongs to. */
	name: string;
}

/** The list the user wants to add a value to; shown as a chip next to the prompt bar. */
export const addValueTarget = writable<AddValueTarget | null>(null);

export interface AddProofTarget {
	/** The fact, or the relation, the proof is about. */
	id: string;
	kind: 'fact' | 'relation';
	/** The value the proof is about: a key, or a title translated in every language. */
	valueName: unknown;
	name: string;
}

/** The value the user wants to add a proof to; shown as a chip next to the prompt bar. */
export const addProofTarget = writable<AddProofTarget | null>(null);

export interface AddRelationTarget {
	elementId: string;
	valueName: unknown;
	name: string;
}

/** The value the user wants to add a relation to; shown as a chip next to the prompt bar. */
export const addRelationTarget = writable<AddRelationTarget | null>(null);
