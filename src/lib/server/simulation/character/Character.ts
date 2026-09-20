import { z } from 'zod';
import { FactSchema } from '../fact';
import { EvolutionTypeSchema } from '../event/Evolution';
import { TranslationSchema } from '../Translation';

export const CharacterSchema = FactSchema.extend({
	type: z.literal('character').default('character').describe('The type of character'),
	financial_resource: EvolutionTypeSchema.describe('Financial resource of the character'),
	power: z.array(TranslationSchema).describe('list of what this character can do')
});

export type CharacterData = z.infer<typeof CharacterSchema>;
