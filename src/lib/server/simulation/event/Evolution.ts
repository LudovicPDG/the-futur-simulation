import { z } from 'zod';
import { EventSchema } from './event';

export const EvolutionSchema = EventSchema.extend({
	type: z.literal('evolution').default('evolution').describe('The type of evolution'),
	evolution: z
		.string()
		.describe('The evolution of the unit of this evolution depending of the time t.'),
	unit: z.string().describe('The unit of this evolution')
});

export type EvolutionData = z.infer<typeof EvolutionSchema>;
