import { z } from 'zod';
import { FactSchema } from '../fact';
import { EvolutionSchema } from '../event/Evolution';
import { TranslationSchema } from '../Translation';

export const CharacterSchema = FactSchema.extend({
	type: z.literal('character').default('character').describe('The type of character'),
	financial_resource: EvolutionSchema.describe('Financial resource of the character'),
	power: z.array(TranslationSchema).describe('list of what this character can do')
});

export type CharacterData = z.infer<typeof CharacterSchema>;
