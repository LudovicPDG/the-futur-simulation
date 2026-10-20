import { writable } from 'svelte/store';

export interface DebateTarget {
	id: string;
	name: string;
}

/** The proof the user wants to debate; shown as a chip next to the prompt bar. */
export const debateTarget = writable<DebateTarget | null>(null);

/** The lists of a fact whose entries the user can ask the genie to extend. */
export type ValueListField = 'power' | 'willing' | 'other' | 'rankings';

export interface AddValueTarget {
	factId: string;
	field: ValueListField;
	/** Shown in the chip: the list and the element it belongs to. */
	name: string;
}

/** The list the user wants to add a value to; shown as a chip next to the prompt bar. */
export const addValueTarget = writable<AddValueTarget | null>(null);
