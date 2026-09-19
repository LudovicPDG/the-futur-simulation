import { z } from 'zod';
import { EventSchema } from './event';
import { EvolutionSchema } from './Evolution';
import { TranslationSchema } from '../Translation';

const RankingElementSchema = z.object({
	name: TranslationSchema.describe('The name of the entity that is ranked'),
	description: TranslationSchema.describe('The description of the entity that is ranked'),
	value: EvolutionSchema.describe('The value of the entity that is ranked')
});

type RankingElementData = z.infer<typeof RankingElementSchema>;

const RankingSchema = EventSchema.extend({
	type: z.literal('ranking').default('ranking').describe('The type of ranking'),
	rankings: z.array(RankingElementSchema).describe('The rankings elements of the ranking')
});

export type RankingData = z.infer<typeof RankingSchema>;
