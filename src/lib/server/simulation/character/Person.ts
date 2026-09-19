import { z } from 'zod';
import { FactSchema } from '../fact/fact';
import { EvolutionSchema } from '../fact/Evolution';
import { TranslationSchema } from '../Translation';

export const PersonSchema = FactSchema.extend({
	financial_resource: EvolutionSchema.describe('Financial resource of the person'),
	power: z.array(TranslationSchema).describe('list of what this person can do')
});

export type PersonData = z.infer<typeof PersonSchema>;
