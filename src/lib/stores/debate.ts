import { writable } from 'svelte/store';

export interface DebateTarget {
	id: string;
	name: string;
}

/** The proof the user wants to debate; shown as a chip next to the prompt bar. */
export const debateTarget = writable<DebateTarget | null>(null);
