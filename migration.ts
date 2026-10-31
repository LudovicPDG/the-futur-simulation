import pg from 'pg';

const { Pool } = pg;

export const db = new Pool({
	host: process.env.POSTGRES_HOST,
	port: Number(process.env.POSTGRES_PORT),
	database: process.env.POSTGRES_DATABASE,
	user: process.env.POSTGRES_USER,
	password: process.env.POSTGRES_PASSWORD
});

const DEFAULT_EXISTENCE = `ROW('[{"function":"100","weight":1,"uncertainty_down":"0","uncertainty_up":"0"}]'::jsonb, '%')::evolution_t`;
const DEFAULT_ZERO_EVOLUTION = `ROW('[{"function":"0","weight":1,"uncertainty_down":"0","uncertainty_up":"0"}]'::jsonb, '')::evolution_t`;

/**
 * Creates the whole schema from scratch (the database is expected to be empty).
 * To change the schema, edit this file, drop the database and run it again.
 */
export async function createDatabase() {
	const client = await db.connect();

	try {
		console.log(
			'🚀 Démarrage de la migration de la base de données avec Types Composites et INHERITS...'
		);
		await client.query('BEGIN');

		// Extension pgcrypto pour la génération automatique de gen_random_uuid()
		await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

		// ==========================================
		// 1. DÉFINITION DES TYPES COMPOSITES POSTGRESQL
		// ==========================================
		await client.query(`
			-- Traductions multilingues
			CREATE TYPE translation_t AS (
				fr TEXT,
				en TEXT,
				de TEXT,
				es TEXT
			);

			-- Évolution d'une métrique dans le temps
			CREATE TYPE evolution_t AS (
				evolution JSONB,
				unit TEXT
			);

			-- Connexions de relations
			CREATE TYPE relation_connexion_t AS (
				source_property TEXT,
				target_property TEXT,
				impact NUMERIC
			);

			-- Ressource matérielle d'une action, avec un titre traduit (comme une capacité)
			CREATE TYPE action_material_t AS (
				name translation_t,
				description translation_t,
				quantity evolution_t,
				level_of_wear evolution_t
			);

			-- Élément d'un classement (ranking)
			CREATE TYPE ranking_element_t AS (
				name translation_t,
				description translation_t,
				value evolution_t
			);

			-- Données autres d'un fait
			CREATE TYPE other_fact_t AS (
				name translation_t,
				value JSONB
			);

			-- Valeur titrée d'une liste (capacité, volonté...) : le titre permet de la cibler
			CREATE TYPE titled_item_t AS (
				name translation_t,
				description translation_t
			);
		`);

		// ==========================================
		// 2. TABLE RACINE : FACTS
		// ==========================================
		await client.query(`
			CREATE TABLE facts (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				type TEXT NOT NULL DEFAULT 'fact',
				name translation_t NOT NULL,
				description translation_t NOT NULL,
				other other_fact_t[],
				existence evolution_t NOT NULL DEFAULT ${DEFAULT_EXISTENCE},
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100),
				impact NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (impact >= 0 AND impact <= 100)
			);
		`);

		// ==========================================
		// 3. RELATIONS ET PREUVES DE RELATIONS
		// ==========================================
		await client.query(`
			CREATE TABLE relations (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name translation_t NOT NULL,
				description translation_t NOT NULL,
				element1_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
				element1_type TEXT NOT NULL,
				element2_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
				element2_type TEXT NOT NULL,
				element1_element2_connexions relation_connexion_t[] NOT NULL DEFAULT '{}',
				element2_element1_connexions relation_connexion_t[] NOT NULL DEFAULT '{}',
				element1_element2_new_value JSONB NOT NULL DEFAULT '[]',
				element2_element1_new_value JSONB NOT NULL DEFAULT '[]',
				existence evolution_t NOT NULL DEFAULT ${DEFAULT_EXISTENCE},
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100),
				impact NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (impact >= 0 AND impact <= 100)
			);

			CREATE TABLE proof_relations (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name translation_t NOT NULL,
				description translation_t NOT NULL,
				source_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
				source_type TEXT NOT NULL,
				target_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
				connexions relation_connexion_t[] NOT NULL DEFAULT '{}'
			);
		`);

		// ==========================================
		// 4. PREUVES (PROOFS)
		// ==========================================
		// Une preuve porte sur une seule valeur (value_name) ; sa valeur souhaitée (desired_value) contient tout ce qu'elle
		// modifie : le contenu et les scores de la valeur, ou, pour une sous-preuve, les champs de la preuve débattue
		// (sauf sa valeur souhaitée).
		// Elle est liée au fait / à la relation débattu(e) et à sa preuve parente (sous-preuves / débat).
		await client.query(`
			CREATE TABLE proofs (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name translation_t NOT NULL,
				description translation_t NOT NULL,
				verification_method translation_t NOT NULL,
				falsifiability_method translation_t NOT NULL,
				source TEXT[] NOT NULL DEFAULT '{}',
				veracity NUMERIC NOT NULL DEFAULT 50.0 CHECK (veracity >= 0 AND veracity <= 100),
				uncertainty NUMERIC NOT NULL DEFAULT 50.0 CHECK (uncertainty >= 0 AND uncertainty <= 100),
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100),
				impact NUMERIC NOT NULL DEFAULT 0.0,
				value_name JSONB,
				desired_value JSONB NOT NULL,
				-- Les champs de desired_value que la preuve modifie vraiment : seuls eux votent
				edited_fields TEXT[],
				fact_id UUID REFERENCES facts(id) ON DELETE CASCADE,
				relation_id UUID REFERENCES relations(id) ON DELETE CASCADE,
				parent_proof_id UUID REFERENCES proofs(id) ON DELETE CASCADE,
				-- Copie de la preuve parente, ajoutée en tête de ses sous-preuves quand le débat commence
				original_proof_id UUID REFERENCES proofs(id) ON DELETE CASCADE,
				created_at TIMESTAMPTZ NOT NULL DEFAULT now()
			);
		`);

		// ==========================================
		// 5. ACTEURS (CHARACTERS, PERSONS, ORGANIZATIONS, INTEREST GROUPS)
		// ==========================================
		// characters hérite de facts
		await client.query(`
			CREATE TABLE characters (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES facts(id) ON DELETE CASCADE,
				financial_resource evolution_t NOT NULL,
				power titled_item_t[] NOT NULL DEFAULT '{}'
			);

			-- persons hérite de characters
			CREATE TABLE persons (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES characters(id) ON DELETE CASCADE
			);

			-- organizations hérite de characters (+ human_resource)
			CREATE TABLE organizations (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES characters(id) ON DELETE CASCADE,
				human_resource evolution_t NOT NULL
			);

			-- interest_groups hérite de organizations (+ willing, satisfaction)
			CREATE TABLE interest_groups (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES organizations(id) ON DELETE CASCADE,
				willing titled_item_t[] NOT NULL DEFAULT '{}',
				satisfaction evolution_t NOT NULL
			);
		`);

		// ==========================================
		// 6. ÉVÉNEMENTS (EVENTS, EVOLUTIONS, RANKINGS)
		// ==========================================
		await client.query(`
			-- events hérite de facts
			CREATE TABLE events (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES facts(id) ON DELETE CASCADE
			);

			-- evolutions hérite de events (+ evolution, unit)
			CREATE TABLE evolutions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES events(id) ON DELETE CASCADE,
				evolution JSONB NOT NULL,
				unit TEXT NOT NULL
			);

			-- rankings hérite de events (+ rankings)
			CREATE TABLE rankings (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES events(id) ON DELETE CASCADE,
				rankings ranking_element_t[] NOT NULL DEFAULT '{}'
			);
		`);

		// ==========================================
		// 7. ACTIONS
		// ==========================================
		// actions hérite de facts (ressources utilisées + ressources nécessaires)
		await client.query(`
			CREATE TABLE actions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES facts(id) ON DELETE CASCADE,
				material_resource_used action_material_t[] NOT NULL DEFAULT '{}',
				fund_used evolution_t NOT NULL,
				human_mobilized evolution_t NOT NULL,
				material_resource_necessary action_material_t[] NOT NULL DEFAULT '{}',
				fund_necessary evolution_t NOT NULL DEFAULT ${DEFAULT_ZERO_EVOLUTION},
				human_necessary evolution_t NOT NULL DEFAULT ${DEFAULT_ZERO_EVOLUTION}
			);
		`);

		// ==========================================
		// 8. RESSOURCES MATÉRIELLES
		// ==========================================
		// material_resources hérite de facts
		await client.query(`
			CREATE TABLE material_resources (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES facts(id) ON DELETE CASCADE,
				number_of_units evolution_t NOT NULL,
				financial_value evolution_t NOT NULL,
				power titled_item_t[] NOT NULL DEFAULT '{}'
			);
		`);

		// ==========================================
		// 9. INDEXES
		// ==========================================
		await client.query(`
			CREATE INDEX idx_facts_type ON facts(type);
			CREATE INDEX idx_relations_element1_id ON relations(element1_id);
			CREATE INDEX idx_relations_element2_id ON relations(element2_id);
			CREATE INDEX idx_proof_relations_source_id ON proof_relations(source_id);
			CREATE INDEX idx_proof_relations_target_id ON proof_relations(target_id);
			CREATE INDEX idx_proofs_fact_id ON proofs(fact_id);
			CREATE INDEX idx_proofs_relation_id ON proofs(relation_id);
			CREATE INDEX idx_proofs_parent_proof_id ON proofs(parent_proof_id);
		`);

		await client.query('COMMIT');
		console.log('✅ Migration terminée avec succès !');
	} catch (error) {
		await client.query('ROLLBACK');
		console.error('❌ Erreur durant la migration, rollback effectué :', error);
		throw error;
	} finally {
		client.release();
	}
}

// Exécution si appelé directement
createDatabase()
	.then(() => {
		console.log('Script terminé.');
		process.exit(0);
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
