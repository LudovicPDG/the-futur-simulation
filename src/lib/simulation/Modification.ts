import { z } from 'zod';
import { TranslationSchema } from './Translation';

/**
 * One value touched by a modification: its name, the value itself and the impact of the change.
 * A text never exists alone in the simulation: it is always translated in every language,
 * like the "other" values of a fact.
 */
export const ModificationEntrySchema = z.object({
	name: z
		.union([TranslationSchema, z.string()])
		.describe(
			'The name of the value. For a primary property of the element, the exact property key as a plain string (e.g. "description"). For an "other information", its name translated in every language.'
		),
	// Not z.any(): its JSON schema has no "type", which strict structured outputs reject.
	value: z
		.union([TranslationSchema, z.number(), z.boolean()])
		.describe(
			'The value. A text is translated in every language (never a plain string). When it modifies an existing value, it MUST have the same type as that value: a number replaces a number, a boolean a boolean, a translated text a translated text. Never split one value into several entries (one per language).'
		),
	impact: z.number().describe('The impact of this change, written as a number like a relation impact')
});

export type ModificationValueKind = 'translation' | 'number' | 'boolean';

/** The kind of a value (translated text, number or boolean), or undefined when it is none of them. */
export function valueKind(value: unknown): ModificationValueKind | undefined {
	if (typeof value === 'number') return 'number';
	if (typeof value === 'boolean') return 'boolean';
	if (typeof value === 'object' && value !== null && 'fr' in value && 'en' in value) {
		return 'translation';
	}
	return undefined;
}

export type ModificationEntryData = z.infer<typeof ModificationEntrySchema>;

/**
 * Super-component grouping what a proof changes in an element.
 * A proof only exists to change something: at least one of the two lists must be filled.
 */
export const ModificationSchema = z.object({
	value_to_modify: z
		.array(ModificationEntrySchema)
		.default([])
		.describe(
			'What the proof must CHANGE in the element: values that ALREADY exist in it (primary information or "other information"). name is the existing value to change, value is its new value. This is the most common case, so prefer it whenever the value already exists.'
		),
	new_value: z
		.array(ModificationEntrySchema)
		.default([])
		.describe(
			'What the proof must ADD to the element: values that do NOT exist yet in it, added to its "other information". name is the name of the new value, value is its content. Never use it for a value that already exists (use value_to_modify instead).'
		)
});

export type ModificationData = z.infer<typeof ModificationSchema>;
