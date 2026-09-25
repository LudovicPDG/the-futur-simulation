import { z } from 'zod';
import { FactSchema } from './fact';
import { EvolutionTypeSchema } from './event/Evolution';
import { TranslationSchema } from './Translation';

const MaterialResourceSchema = FactSchema.extend({
	type: z.literal('material_resource').default('material_resource').describe('The type of material resource'),
	number_of_units: EvolutionTypeSchema.describe('Number of units of the material resource'),
	financial_value: EvolutionTypeSchema.describe('Financial value of the material resource'),
	power: z.array(TranslationSchema).describe('list of what this resource can do')
});

export type MaterialResourceData = z.infer<typeof MaterialResourceSchema>;
