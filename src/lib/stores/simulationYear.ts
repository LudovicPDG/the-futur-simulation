import { writable } from 'svelte/store';

/** The date of the time machine, as a decimal year: the graphs are centered on it. */
export const simulationYear = writable<number | null>(null);
