import { z } from 'zod';
import { EvolutionSchema } from '../event/Evolution';
import { CharacterSchema } from './Character';

export const OrganizationSchema = CharacterSchema.extend({
	type: z.literal('organization').default('organization').describe('The type of organization'),
	human_resource: EvolutionSchema.describe('Number of human that are in this organization')
});

export type OrganizationData = z.infer<typeof OrganizationSchema>;
