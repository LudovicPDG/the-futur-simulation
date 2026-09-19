import { z } from 'zod';
import { FactSchema } from './fact/fact';
import { EvolutionSchema } from './fact/Evolution';
import { TranslationSchema } from './Translation';

const MaterialResourceSchema = FactSchema.extend({
	number_of_units: EvolutionSchema.describe('Number of units of the material resource'),
	financial_value: EvolutionSchema.describe('Financial value of the material resource'),
	power: z.array(TranslationSchema).describe('list of what this resource can do')
});

export type MaterialResourceData = z.infer<typeof MaterialResourceSchema>;
