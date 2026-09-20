import { db } from './src/lib/server/utils/database';

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

		// Type composite pour les changements impliqués par une preuve
		await client.query(`
			DO $$ BEGIN
				CREATE TYPE proof_change_t AS (
					target_element TEXT,
					new_value TEXT,
					impact NUMERIC
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

		// ==========================================
		// 2. TABLE RACINE : FACTS
		// ==========================================
		await client.query(`
			CREATE TABLE IF NOT EXISTS facts (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				type TEXT NOT NULL DEFAULT 'fact',
				name translation_t NOT NULL,
				description translation_t NOT NULL,
				other JSONB DEFAULT '{}'::jsonb,
				impossibility NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (impossibility >= 0 AND impossibility <= 1),
				probability_distribution TEXT NOT NULL,
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100),
				relations UUID[] NOT NULL DEFAULT '{}' REFERENCES relations(id) ON DELETE SET NULL,
				proofs UUID[] NOT NULL DEFAULT '{}' REFERENCES proofs(id) ON DELETE SET NULL
			);
		`);

		// ==========================================
		// 3. ACTEURS (CHARACTERS, PERSONS, ORGANIZATIONS, INTEREST GROUPS)
		// ==========================================
		// characters hérite de facts
		await client.query(`
			CREATE TABLE IF NOT EXISTS characters (
				financial_resource evolution_t NOT NULL,
				power translation_t[] NOT NULL DEFAULT '{}'
			) INHERITS (facts);
		`);

		// persons hérite de characters
		await client.query(`
			CREATE TABLE IF NOT EXISTS persons (
			) INHERITS (characters);
		`);

		// organizations hérite de characters (+ human_resource)
		await client.query(`
			CREATE TABLE IF NOT EXISTS organizations (
				human_resource evolution_t NOT NULL
			) INHERITS (characters);
		`);

		// interest_groups hérite de organizations (+ willing, satisfaction)
		await client.query(`
			CREATE TABLE IF NOT EXISTS interest_groups (
				willing translation_t[] NOT NULL DEFAULT '{}',
				satisfaction evolution_t NOT NULL
			) INHERITS (organizations);
		`);

		// ==========================================
		// 4. ÉVÉNEMENTS (EVENTS, EVOLUTIONS, RANKINGS)
		// ==========================================
		// events hérite de facts
		await client.query(`
			CREATE TABLE IF NOT EXISTS events (
			) INHERITS (facts);
		`);

		// evolutions hérite de events (+ evolution, unit)
		await client.query(`
			CREATE TABLE IF NOT EXISTS evolutions (
				evolution TEXT NOT NULL,
				unit TEXT NOT NULL
			) INHERITS (events);
		`);

		// rankings hérite de events (+ rankings)
		await client.query(`
			CREATE TABLE IF NOT EXISTS rankings (
				rankings ranking_element_t[] NOT NULL DEFAULT '{}'
			) INHERITS (events);
		`);

		// ==========================================
		// 5. ACTIONS
		// ==========================================
		// actions hérite de facts
		await client.query(`
			CREATE TABLE IF NOT EXISTS actions (
				material_resource_used action_material_resource_t[] NOT NULL DEFAULT '{}',
				fund_used evolution_t NOT NULL,
				human_mobilized evolution_t NOT NULL
			) INHERITS (facts);
		`);

		// ==========================================
		// 6. RESSOURCES MATÉRIELLES
		// ==========================================
		// material_resources hérite de facts
		await client.query(`
			CREATE TABLE IF NOT EXISTS material_resources (
				number_of_units evolution_t NOT NULL,
				financial_value evolution_t NOT NULL,
				power translation_t[] NOT NULL DEFAULT '{}'
			) INHERITS (facts);
		`);

		// ==========================================
		// 7. RELATIONS
		// ==========================================
		await client.query(`
			CREATE TABLE IF NOT EXISTS relations (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				target_id UUID NOT NULL,
				target_type TEXT NOT NULL,
				name translation_t NOT NULL,
				description translation_t NOT NULL,
				connexions relation_connexion_t[] NOT NULL DEFAULT '{}',
				impossibility NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (impossibility >= 0 AND impossibility <= 1),
				probability_distribution TEXT NOT NULL,
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100),
				proofs UUID[] NOT NULL DEFAULT '{}' REFERENCES proofs(id) ON DELETE SET NULL
			);
		`);

		// ==========================================
		// 8. PREUVES ET DÉBATS (PROOFS)
		// ==========================================
		await client.query(`
			CREATE TABLE IF NOT EXISTS proofs (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name translation_t NOT NULL,
				description translation_t NOT NULL,
				changes proof_change_t[] NOT NULL DEFAULT '{}',
				verification_method translation_t NOT NULL,
				falsifiability_method translation_t NOT NULL,
				sources TEXT[] NOT NULL DEFAULT '{}',
				debates UUID[] NOT NULL DEFAULT '{}' REFERENCES proofs(id) ON DELETE SET NULL,
				impossibility NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (impossibility >= 0 AND impossibility <= 1),
				probability_distribution TEXT NOT NULL,
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100),
			);
		`);

		// ==========================================
		// 9. INDEXES
		// ==========================================
		await client.query(`
			CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(type);
			CREATE INDEX IF NOT EXISTS idx_relations_source_id ON relations(source_id);
			CREATE INDEX IF NOT EXISTS idx_relations_target_id ON relations(target_id);
			CREATE INDEX IF NOT EXISTS idx_proofs_fact_id ON proofs(fact_id);
			CREATE INDEX IF NOT EXISTS idx_proofs_relation_id ON proofs(relation_id);
			CREATE INDEX IF NOT EXISTS idx_proofs_parent_proof_id ON proofs(parent_proof_id);
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
