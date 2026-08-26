import neo4j from 'neo4j-driver';
import { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } from '$env/static/private';

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
	constructor(public data: OrganisationData) {
		this.add_to_DB();
	}

	async add_to_DB() {
		const driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USERNAME!, NEO4J_PASSWORD!));

		const session = driver.session();

		try {
			const result = await session.run(
				`
			CREATE (o:Organisation {
				name: $name,
				description: $description,
				type: $type,
				objective: $objective,
				human_resource: $human,
				financial_resource: $financial
			})

			FOREACH (material IN $material |
				CREATE (r:MaterialResource {
					name: material.name,
					description: material.description,
					quantity: material.quantity,
					value: material.value
				})
				CREATE (o)-[:HAS_RESOURCE]->(r)
			)

			RETURN o
			`,
				{
					name: this.data.name,
					description: this.data.description,
					type: this.data.type,
					objective: this.data.objective,
					human: this.data.resource.human,
					financial: this.data.resource.financial,

					material: this.data.resource.material
				}
			);

			return result.records[0].get('o').properties;
		} finally {
			await session.close();
			await driver.close();
		}
	}
}
