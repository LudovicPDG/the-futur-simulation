import pg from 'pg';

const { Pool } = pg;

export const db = new Pool({
	host: process.env.POSTGRES_HOST,
	port: Number(process.env.POSTGRES_PORT),
	database: process.env.POSTGRES_DATABASE,
	user: process.env.POSTGRES_USER,
	password: process.env.POSTGRES_PASSWORD
});

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

		// Type composite pour les traductions multilingues
		await client.query(`
			DO $$ BEGIN
				CREATE TYPE translation_t AS (
					fr TEXT,
					en TEXT,
					de TEXT,
					es TEXT
				);
			EXCEPTION
				WHEN duplicate_object THEN null;
			END $$;
		`);

		// Type composite pour l'évolution d'une métrique dans le temps
		await client.query(`
			DO $$ BEGIN
				CREATE TYPE evolution_t AS (
					evolution TEXT,
					unit TEXT
				);
			EXCEPTION
				WHEN duplicate_object THEN null;
			END $$;
		`);

		// Type composite pour les connexions de relations
		await client.query(`
			DO $$ BEGIN
				CREATE TYPE relation_connexion_t AS (
					source_property TEXT,
					target_property TEXT,
					impact NUMERIC
				);
			EXCEPTION
				WHEN duplicate_object THEN null;
			END $$;
		`);

		// Type composite pour les ressources matérielles utilisées par une action
		await client.query(`
			DO $$ BEGIN
				CREATE TYPE action_material_resource_t AS (
					name TEXT,
					quantity evolution_t,
					level_of_wear evolution_t
				);
			EXCEPTION
				WHEN duplicate_object THEN null;
			END $$;
		`);

		// Type composite pour les éléments d'un classement (ranking)
		await client.query(`
			DO $$ BEGIN
				CREATE TYPE ranking_element_t AS (
					name translation_t,
					description translation_t,
					value evolution_t
				);
			EXCEPTION
				WHEN duplicate_object THEN null;
			END $$;
		`);

		// Type composite pour les données autres d'un fait
		await client.query(`
			DO $$ BEGIN
				CREATE TYPE other_fact_t AS (
					name TEXT,
					value JSONB
				);
			EXCEPTION
				WHEN duplicate_object THEN null;
			END $$;
		`);

		// ==========================================
		// 2. TABLE RACINE : FACTS
		// ==========================================
		await client.query(`
			CREATE TABLE IF NOT EXISTS facts (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				type TEXT NOT NULL DEFAULT 'fact',
				name translation_t NOT NULL,
				description translation_t NOT NULL,
				other other_fact_t[],
				impossibility NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (impossibility >= 0 AND impossibility <= 1),
				probability_distribution TEXT NOT NULL,
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100)
			);
		`);

		// ==========================================
		// 3. RELATIONS ET PREUVES DE RELATIONS
		// ==========================================
		await client.query(`
			CREATE TABLE IF NOT EXISTS relations (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name translation_t NOT NULL,
				description translation_t NOT NULL,
				element1_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
				element1_type TEXT NOT NULL,
				element2_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
				element2_type TEXT NOT NULL,
				element1_element2_connexions relation_connexion_t[] NOT NULL DEFAULT '{}',
				element2_element1_connexions relation_connexion_t[] NOT NULL DEFAULT '{}',
				impossibility NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (impossibility >= 0 AND impossibility <= 1),
				probability_distribution TEXT NOT NULL,
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100)
			);
		`);

		await client.query(`
			CREATE TABLE IF NOT EXISTS proof_relations (
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
		//==========================================
		await client.query(`
			CREATE TABLE IF NOT EXISTS proofs (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name translation_t NOT NULL,
				description translation_t NOT NULL,
				new_value JSONB,
				verification_method translation_t NOT NULL,
				falsifiability_method translation_t NOT NULL,
				source TEXT[] NOT NULL DEFAULT '{}',
				impossibility NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (impossibility >= 0 AND impossibility <= 1),
				probability_distribution TEXT NOT NULL,
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100)
			);
		`);

		// ==========================================
		// 5. ACTEURS (CHARACTERS, PERSONS, ORGANIZATIONS, INTEREST GROUPS)
		// ==========================================
		// characters hérite de facts
		await client.query(`
			CREATE TABLE IF NOT EXISTS characters (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES facts(id) ON DELETE CASCADE,
				financial_resource evolution_t NOT NULL,
				power translation_t[] NOT NULL DEFAULT '{}'
			);
		`);

		// persons hérite de characters
		await client.query(`
			CREATE TABLE IF NOT EXISTS persons (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES characters(id) ON DELETE CASCADE
			);
		`);

		// organizations hérite de characters (+ human_resource)
		await client.query(`
			CREATE TABLE IF NOT EXISTS organizations (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES characters(id) ON DELETE CASCADE,
				human_resource evolution_t NOT NULL
			);
		`);

		// interest_groups hérite de organizations (+ willing, satisfaction)
		await client.query(`
			CREATE TABLE IF NOT EXISTS interest_groups (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES organizations(id) ON DELETE CASCADE,
				willing translation_t[] NOT NULL DEFAULT '{}',
				satisfaction evolution_t NOT NULL
			);
		`);

		// ==========================================
		// 6. ÉVÉNEMENTS (EVENTS, EVOLUTIONS, RANKINGS)
		// ==========================================
		// events hérite de facts
		await client.query(`
			CREATE TABLE IF NOT EXISTS events (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES facts(id) ON DELETE CASCADE
			);
		`);

		// evolutions hérite de events (+ evolution, unit)
		await client.query(`
			CREATE TABLE IF NOT EXISTS evolutions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES events(id) ON DELETE CASCADE,
				evolution TEXT NOT NULL,
				unit TEXT NOT NULL
			);
		`);

		// rankings hérite de events (+ rankings)
		await client.query(`
			CREATE TABLE IF NOT EXISTS rankings (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES events(id) ON DELETE CASCADE,
				rankings ranking_element_t[] NOT NULL DEFAULT '{}'
			);
		`);

		// ==========================================
		// 7. ACTIONS
		// ==========================================
		// actions hérite de facts
		await client.query(`
			CREATE TABLE IF NOT EXISTS actions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES facts(id) ON DELETE CASCADE,
				material_resource_used action_material_resource_t[] NOT NULL DEFAULT '{}',
				fund_used evolution_t NOT NULL,
				human_mobilized evolution_t NOT NULL
			);
		`);

		// ==========================================
		// 8. RESSOURCES MATÉRIELLES
		// ==========================================
		// material_resources hérite de facts
		await client.query(`
			CREATE TABLE IF NOT EXISTS material_resources (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES facts(id) ON DELETE CASCADE,
				number_of_units evolution_t NOT NULL,
				financial_value evolution_t NOT NULL,
				power translation_t[] NOT NULL DEFAULT '{}'
			);
		`);

		// ==========================================
		// 9. INDEXES
		// ==========================================
		await client.query(`
			CREATE INDEX IF NOT EXISTS idx_facts_type
			ON facts(type);

			CREATE INDEX IF NOT EXISTS idx_relations_element1_id
			ON relations(element1_id);

			CREATE INDEX IF NOT EXISTS idx_relations_element2_id
			ON relations(element2_id);

			CREATE INDEX IF NOT EXISTS idx_proof_relations_source_id
			ON proof_relations(source_id);

			CREATE INDEX IF NOT EXISTS idx_proof_relations_target_id
			ON proof_relations(target_id);
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
