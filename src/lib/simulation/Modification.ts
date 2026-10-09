import { z } from 'zod';

/** One value touched by a modification: its name, the value itself and the impact of the change. */
export const ModificationEntrySchema = z.object({
	name: z.string().describe('The name of the value (a primary property or an "other information")'),
	// Not z.any(): its JSON schema has no "type", which strict structured outputs reject.
	value: z.union([z.string(), z.number(), z.boolean()]).describe('The value'),
	impact: z.number().describe('The impact of this change, written as a number like a relation impact')
});

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
