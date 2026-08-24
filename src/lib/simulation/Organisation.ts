import { z } from 'zod';

const MaterialResourceSchema = z.object({
	name: z.string(),
	description: z.string(),
	quantity: z.number().nonnegative(),
	value: z.number().nonnegative()
});

export const OrganisationSchema = z.object({
	name: z.string(),
	description: z.string(),
	type: z.string(),
	objective: z.array(z.string()),
	resource: z.object({
		human: z.number().nonnegative(),
		material: z.array(MaterialResourceSchema),
		financial: z.number().nonnegative()
	})
});

type OrganisationData = z.infer<typeof OrganisationSchema>;

export class Organisation {
	constructor(public data: OrganisationData) {}
}
