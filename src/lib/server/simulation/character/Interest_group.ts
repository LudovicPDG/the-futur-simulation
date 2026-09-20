import { OrganizationSchema } from './Organization';
import { z } from 'zod';
import { EvolutionTypeSchema } from '../event/Evolution';
import { TranslationSchema } from '../Translation';

export const Interest_group_Schema = OrganizationSchema.extend({
	type: z.literal('interest_group').default('interest_group').describe('The type of interest group'),
	willing: z.array(TranslationSchema).describe('list of what this person is willing to do'),
	satisfaction: EvolutionTypeSchema.describe(
		'Satisfaction of the person, based on the realization or no of this willing.'
	)
});

export type Interest_group_Data = z.infer<typeof Interest_group_Schema>;
