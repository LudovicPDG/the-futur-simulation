import { z } from 'zod';
import { FactSchema } from './fact';
import { EvolutionSchema } from './event/Evolution';

export const ActionSchema: z.ZodType = FactSchema.extend({
	type: z.literal('action').default('action').describe('The type of action'),
	material_ressource_used: z
		.array(
			z.object({
				name: z.string().describe('The name of the material resource'),
				quantity: EvolutionSchema.describe('The quantity of the material resource'),
				level_of_wear: EvolutionSchema.describe('The level of wear of the material resource')
			})
		)
		.describe('Material resources used in the action'),
	fund_used: EvolutionSchema.describe('Money used in the action'),
	human_mobilized: EvolutionSchema.describe('Number of human mobilized in the action')
});
export type ActionData = z.infer<typeof ActionSchema>;
