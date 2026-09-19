import { z } from 'zod';
import { FactSchema } from '../fact';

export const EventSchema = FactSchema.extend({
	type: z.literal('event').default('event').describe('The type of event')
}).describe('An event in the simulation');

export type EventData = z.infer<typeof EventSchema>;
