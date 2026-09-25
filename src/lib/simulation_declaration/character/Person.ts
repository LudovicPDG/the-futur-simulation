import { z } from 'zod';
import { CharacterSchema } from './Character';

export const PersonSchema = CharacterSchema.extend({
	type: z.literal('person').default('person').describe('The type of person')
});

export type PersonData = z.infer<typeof PersonSchema>;
