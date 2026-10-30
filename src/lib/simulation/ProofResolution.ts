import { valueKind, type ProofData } from './Proof';
import { relationValueName, type RelationConnexionData } from './Relation';
import type { EvolutionComponent } from './event/EvolutionFunction';

/**
 * The debate of the proofs. Whatever its kind (a text, a number, a boolean, an evolution...), everything is decided
 * by one single proof: the one with the best veracity * impact, whose whole desired value wins:
 * - a debated proof becomes what its best sub-proof wants, unless the proof before its debate has the best score;
 * - a value of an element becomes what its best top-level proof wants, the founding proof among them.
 * The sub-proofs are resolved first (from the deepest), so that each proof competes with its debated scores.
 */

/** The fields of a debated proof that its sub-proofs can change (never its desired value). */
export const PROOF_EDIT_FIELDS = [
	'name',
	'description',
	'verification_method',
	'falsifiability_method',
	'source',
	'veracity',
	'uncertainty',
	'impact',
	'originality'
] as const;

/** The parts of a value of an element that its top-level proofs can change. */
export const VALUE_EDIT_FIELDS = ['value', 'veracity', 'uncertainty', 'impact', 'originality'] as const;

/** The score that decides which proof wins. */
const proofScore = (proof: ProofData) => proof.veracity * proof.impact;

/** The proofs (oldest first), the best score first; on a tie, the oldest one comes first. */
const byScore = (proofs: ProofData[]) => [...proofs].sort((a, b) => proofScore(b) - proofScore(a));

const desiredField = (proof: ProofData, field: string) =>
	(proof.desired_value as Record<string, unknown>)[field] ?? undefined;

/**
 * Every proof as it stands after its debate: each debated proof gets the desired value of its best sub-proof
 * (resolved first, from the deepest). The original proof copies stay unchanged: they are the proof before its debate.
 */
export function resolveProofs(proofs: ProofData[]): ProofData[] {
	const children = new Map<string, ProofData[]>();
	for (const proof of proofs) {
		if (!proof.parent_proof_id) continue;
		children.set(proof.parent_proof_id, [...(children.get(proof.parent_proof_id) ?? []), proof]);
	}

	const resolved = new Map<string, ProofData>();
	const resolve = (proof: ProofData): ProofData => {
		const known = proof.id ? resolved.get(proof.id) : undefined;
		if (known) return known;

		const kids = proof.id ? (children.get(proof.id) ?? []) : [];
		// Oldest first (the proofs come newest first), so that a tie keeps the earliest proof.
		const debaters = kids.filter((kid) => !kid.original_proof_id).map(resolve).reverse();
		// The stored proof is the status quo: it stays as it was before its debate, like its copy.
		const [winner] = byScore([proof, ...debaters]);
		let result = proof;
		if (winner !== proof) {
			result = { ...proof };
			for (const field of PROOF_EDIT_FIELDS) {
				const desired = desiredField(winner, field);
				if (desired !== undefined) (result as Record<string, unknown>)[field] = desired;
			}
		}
		if (proof.id) resolved.set(proof.id, result);
		return result;
	};

	return proofs.map(resolve);
}

/**
 * The parts of one value of an element decided by its top-level proofs (resolved by resolveProofs first, newest
 * first): the ones of the best proof. A part it does not give (a proof saved without it) comes from the next best
 * proof, and a part that no proof gives is undefined.
 */
export function resolveValue(proofs: ProofData[]): {
	value?: unknown;
	veracity?: number;
	uncertainty?: number;
	impact?: number;
	originality?: number;
} {
	// Oldest first: the founding proof wins a tie.
	const ranked = byScore([...proofs].reverse());
	const result: Record<string, unknown> = {};
	for (const field of VALUE_EDIT_FIELDS) {
		for (const proof of ranked) {
			const desired = desiredField(proof, field);
			if (desired === undefined) continue;
			result[field] = desired;
			break;
		}
	}
	return result;
}

/** An evolution as a value: its functions and its unit. */
type Evolution = { evolution: EvolutionComponent[]; unit: string };

/** Every language-keyed name of a value ("description" or {fr, en, de, es}). */
export function valueNames(name: unknown): string[] {
	if (typeof name === 'string') return [name];
	if (typeof name === 'object' && name !== null) {
		return Object.values(name).filter((value): value is string => typeof value === 'string');
	}
	return [];
}

/** The lists whose entries are values on their own: the "other" values, and the titled items (capabilities, willingness). */
export const VALUE_LISTS = [
	['other', 'value'],
	['power', 'description'],
	['willing', 'description'],
	['material_resource_used', 'description'],
	['material_resource_necessary', 'description'],
	['rankings', 'value']
] as const;

const RELATION_SIDES = [
	['element1_element2', 'modify', 'element1_element2_value_to_modify'],
	['element1_element2', 'add', 'element1_element2_new_value'],
	['element2_element1', 'modify', 'element2_element1_value_to_modify'],
	['element2_element1', 'add', 'element2_element1_new_value']
] as const;

/**
 * Gives the named value of the element its new content, wherever it is: a primary property, a value to modify or
 * to add of a relation, an "other" value or a titled item. The entries of a plain list are left alone: they all
 * share the name of the list, so their proofs cannot be told apart.
 */
function setValue(element: Record<string, unknown>, name: unknown, value: unknown): void {
	const names = valueNames(name);
	const key = names.find((candidate) => candidate in element);
	if (key) {
		if (Array.isArray(element[key]) && key !== 'evolution') return;
		if (key === 'evolution' && valueKind(value) === 'evolution') {
			// An evolution element holds its functions and its unit side by side.
			element.evolution = (value as Evolution).evolution;
			element.unit = (value as Evolution).unit;
		} else if (key !== 'evolution') {
			element[key] = value;
		}
		return;
	}

	for (const [direction, kind, list] of RELATION_SIDES) {
		const entries = element[list];
		if (!Array.isArray(entries)) continue;
		const index = entries.findIndex((entry) =>
			names.includes(relationValueName(direction, kind, entry as RelationConnexionData))
		);
		if (index === -1) continue;
		element[list] = entries.map((entry, i) =>
			i === index ? { ...entry, [kind === 'modify' ? 'impact' : 'value']: value } : entry
		);
		return;
	}

	for (const [list, valueKey] of VALUE_LISTS) {
		const entries = element[list];
		if (!Array.isArray(entries)) continue;
		const index = entries.findIndex(
			(entry) =>
				typeof entry === 'object' &&
				entry !== null &&
				valueNames((entry as { name?: unknown }).name).some((candidate) => names.includes(candidate))
		);
		if (index === -1) continue;
		element[list] = entries.map((entry, i) => (i === index ? { ...entry, [valueKey]: value } : entry));
		return;
	}
}

/** The top-level proofs of the element, grouped by the value they are about. */
function proofsByValue(elementId: string, proofs: ProofData[]): ProofData[][] {
	const groups: { names: string[]; proofs: ProofData[] }[] = [];
	for (const proof of proofs) {
		if (proof.parent_proof_id || (proof.fact_id ?? proof.relation_id) !== elementId) continue;
		const names = valueNames(proof.value_name).map((name) => name.toLowerCase());
		const group = groups.find((candidate) => candidate.names.some((name) => names.includes(name)));
		if (group) group.proofs.push(proof);
		else groups.push({ names, proofs: [proof] });
	}
	return groups.map((group) => group.proofs);
}

/** The element with every value decided by its proofs (resolved by resolveProofs first). */
export function resolveElement<T extends object>(element: T, proofs: ProofData[]): T {
	const id = (element as { id?: unknown }).id;
	if (typeof id !== 'string') return element;
	const groups = proofsByValue(id, proofs);
	if (groups.length === 0) return element;
	const result = { ...element } as Record<string, unknown>;
	for (const group of groups) {
		const { value } = resolveValue(group);
		if (value !== undefined) setValue(result, group[0].value_name, value);
	}
	return result as T;
}
