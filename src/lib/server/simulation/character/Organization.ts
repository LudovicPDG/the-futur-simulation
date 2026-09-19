import { z } from 'zod';
import { EvolutionSchema } from '../fact/Evolution';
import { PersonSchema } from './Person';

export const OrganizationSchema = PersonSchema.extend({
	human_resource: EvolutionSchema.describe('Number of human that are in this organization')
});

export type OrganizationData = z.infer<typeof OrganizationSchema>;
