import { z } from 'zod';
import { FactSchema } from './fact';
import { EvolutionTypeSchema } from './event/Evolution';

export const ActionSchema: z.ZodType = FactSchema.extend({
	type: z.literal('action').default('action').describe('The type of action'),
	material_ressource_used: z
		.array(
			z.object({
				name: z.string().describe('The name of the material resource'),
				quantity: EvolutionTypeSchema.describe('The quantity of the material resource'),
				level_of_wear: EvolutionTypeSchema.describe('The level of wear of the material resource')
			})
		)
		.describe('Material resources used in the action'),
	fund_used: EvolutionTypeSchema.describe('Money used in the action'),
	human_mobilized: EvolutionTypeSchema.describe('Number of human mobilized in the action')
});
export type ActionData = z.infer<typeof ActionSchema>;
