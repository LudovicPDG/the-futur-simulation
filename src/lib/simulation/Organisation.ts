import neo4j from 'neo4j-driver';
import { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } from '$env/static/private';

import { z } from 'zod';

const MaterialResourceSchema = z.object({
	name_fr: z.string(),
	name_en: z.string(),
	name_de: z.string(),
	name_es: z.string(),
	description_fr: z.string(),
	description_en: z.string(),
	description_de: z.string(),
	description_es: z.string(),
	quantity: z.number().nonnegative(),
	value: z.number().nonnegative()
});

export const OrganisationSchema = z.object({
	name_fr: z.string(),
	name_en: z.string(),
	name_de: z.string(),
	name_es: z.string(),
	description_fr: z.string(),
	description_en: z.string(),
	description_de: z.string(),
	description_es: z.string(),
	type_fr: z.string(),
	type_en: z.string(),
	type_de: z.string(),
	type_es: z.string(),
	objective_fr: z.array(z.string()),
	objective_en: z.array(z.string()),
	objective_de: z.array(z.string()),
	objective_es: z.array(z.string()),
	satisfaction: z.number().nonnegative().max(100),
	resource: z.object({
		human: z.number().nonnegative(),
		material: z.array(MaterialResourceSchema),
		financial: z.number().nonnegative()
	})
});

type OrganisationData = z.infer<typeof OrganisationSchema>;

export class Organisation {
	constructor(public data: OrganisationData) {}

	public static async init(data: OrganisationData) {
		const organisation = new Organisation(data);
		await organisation.add_to_DB();
		return organisation;
	}

	async add_to_DB() {
		const driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USERNAME!, NEO4J_PASSWORD!));

		const session = driver.session();

		try {
			const result = await session.run(
				`
			CREATE (o:Organisation {
				name_fr: $name_fr,
				name_en: $name_en,
				name_de: $name_de,
				name_es: $name_es,
				description_fr: $description_fr,
				description_en: $description_en,
				description_de: $description_de,
				description_es: $description_es,
				type_fr: $type_fr,
				type_en: $type_en,
				type_de: $type_de,
				type_es: $type_es,
				objective_fr: $objective_fr,
				objective_en: $objective_en,
				objective_de: $objective_de,
				objective_es: $objective_es,
				satisfaction: $satisfaction,
				human_resource: $human,
				financial_resource: $financial
			})

			FOREACH (material IN $material |
				CREATE (r:MaterialResource {
					name_fr: material.name_fr,
					name_en: material.name_en,
					name_de: material.name_de,
					name_es: material.name_es,
					description_fr: material.description_fr,
					description_en: material.description_en,
					description_de: material.description_de,
					description_es: material.description_es,
					quantity: material.quantity,
					value: material.value
				})
				CREATE (o)-[:HAS_RESOURCE]->(r)
			)

			RETURN o
			`,
				{
					name_fr: this.data.name_fr,
					name_en: this.data.name_en,
					name_de: this.data.name_de,
					name_es: this.data.name_es,
					description_fr: this.data.description_fr,
					description_en: this.data.description_en,
					description_de: this.data.description_de,
					description_es: this.data.description_es,
					type_fr: this.data.type_fr,
					type_en: this.data.type_en,
					type_de: this.data.type_de,
					type_es: this.data.type_es,
					objective_fr: this.data.objective_fr,
					objective_en: this.data.objective_en,
					objective_de: this.data.objective_de,
					objective_es: this.data.objective_es,
					satisfaction: this.data.satisfaction,
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
