import { z } from 'zod';

/** One value touched by a modification: its name, the value itself and the impact of the change. */
export const ModificationEntrySchema = z.object({
	name: z.string().describe('The name of the value (a primary property or an "other information")'),
	// Not z.any(): its JSON schema has no "type", which strict structured outputs reject.
	value: z.union([z.string(), z.number(), z.boolean()]).describe('The value'),
	impact: z.number().describe('The impact of this change, written as a number like a relation impact')
});

export type ModificationEntryData = z.infer<typeof ModificationEntrySchema>;

/** Super-component grouping what a proof or a relation adds, modifies and deletes. */
export const ModificationSchema = z.object({
	new_value: z
		.array(ModificationEntrySchema)
		.default([])
		.describe('Values to add in the "other information" of the element'),
	value_to_modify: z
		.array(ModificationEntrySchema)
		.default([])
		.describe(
			'Existing values to modify in the element (primary information or "other information"); value is the new value'
		),
	value_to_delete: z
		.array(ModificationEntrySchema)
		.default([])
		.describe('Existing values to delete from the "other information" of the element')
});

export type ModificationData = z.infer<typeof ModificationSchema>;
