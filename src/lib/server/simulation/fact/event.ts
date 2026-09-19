import { z } from 'zod';
import { FactSchema } from './fact';

export const EventSchema = FactSchema.describe('An event in the simulation');

export type EventData = z.infer<typeof EventSchema>;
