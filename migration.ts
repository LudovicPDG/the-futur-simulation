import { db } from './src/lib/server/utils/database';

export async function createDatabase() {
	const client = await db.connect();

	try {
		console.log('🚀 Démarrage de la migration de la base de données avec INHERITS...');
		await client.query('BEGIN');

		// Extension pgcrypto pour la génération automatique de gen_random_uuid()
		await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

		// ==========================================
		// 1. TABLE PARENTE : FACTS
		// ==========================================
		// Tous les éléments de la simulation sont des facts
		await client.query(`
			CREATE TABLE IF NOT EXISTS facts (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				type VARCHAR(50) NOT NULL DEFAULT 'fact',
				name JSONB NOT NULL,
				description JSONB NOT NULL,
				other JSONB DEFAULT '{}'::jsonb,
				impossibility NUMERIC(6, 5) NOT NULL DEFAULT 0.0 CHECK (impossibility >= 0 AND impossibility <= 1),
				probability_distribution TEXT NOT NULL,
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);

		// ==========================================
		// 2. ACTEURS (CHARACTERS, PERSONS, ORGANIZATIONS, INTEREST GROUPS) VIA INHERITS
		// ==========================================
		// characters hérite de facts
		await client.query(`
			CREATE TABLE IF NOT EXISTS characters (
				financial_resource JSONB NOT NULL,
				power JSONB NOT NULL DEFAULT '[]'::jsonb
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
				human_resource JSONB NOT NULL
			) INHERITS (characters);
		`);

		// interest_groups hérite de organizations (+ willing, satisfaction)
		await client.query(`
			CREATE TABLE IF NOT EXISTS interest_groups (
				willing JSONB NOT NULL DEFAULT '[]'::jsonb,
				satisfaction JSONB NOT NULL
			) INHERITS (organizations);
		`);

		// ==========================================
		// 3. ÉVÉNEMENTS (EVENTS, EVOLUTIONS, RANKINGS) VIA INHERITS
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
				unit VARCHAR(100) NOT NULL
			) INHERITS (events);
		`);

		// rankings hérite de events (+ rankings list)
		await client.query(`
			CREATE TABLE IF NOT EXISTS rankings (
				rankings JSONB NOT NULL DEFAULT '[]'::jsonb
			) INHERITS (events);
		`);

		// ==========================================
		// 4. ACTIONS VIA INHERITS
		// ==========================================
		// actions hérite de facts (+ material_resource_used, fund_used, human_mobilized)
		await client.query(`
			CREATE TABLE IF NOT EXISTS actions (
				material_resource_used JSONB NOT NULL DEFAULT '[]'::jsonb,
				fund_used JSONB NOT NULL,
				human_mobilized JSONB NOT NULL
			) INHERITS (facts);
		`);

		// ==========================================
		// 5. RESSOURCES MATÉRIELLES (MATERIAL RESOURCES) VIA INHERITS
		// ==========================================
		// material_resources hérite de facts (+ number_of_units, financial_value, power)
		await client.query(`
			CREATE TABLE IF NOT EXISTS material_resources (
				number_of_units JSONB NOT NULL,
				financial_value JSONB NOT NULL,
				power JSONB NOT NULL DEFAULT '[]'::jsonb
			) INHERITS (facts);
		`);

		// ==========================================
		// 6. RELATIONS
		// ==========================================
		await client.query(`
			CREATE TABLE IF NOT EXISTS relations (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				source_id UUID NOT NULL,
				target_id VARCHAR(255) NOT NULL,
				target_type VARCHAR(50) NOT NULL,
				name JSONB NOT NULL,
				description JSONB NOT NULL,
				connexions JSONB NOT NULL DEFAULT '[]'::jsonb,
				impossibility NUMERIC(6, 5) NOT NULL DEFAULT 0.0 CHECK (impossibility >= 0 AND impossibility <= 1),
				probability_distribution TEXT NOT NULL,
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);

		// ==========================================
		// 7. PREUVES ET DÉBATS (PROOFS)
		// ==========================================
		await client.query(`
			CREATE TABLE IF NOT EXISTS proofs (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				fact_id UUID,
				relation_id UUID REFERENCES relations(id) ON DELETE CASCADE,
				parent_proof_id UUID REFERENCES proofs(id) ON DELETE CASCADE,
				name JSONB NOT NULL,
				description JSONB NOT NULL,
				changes JSONB NOT NULL DEFAULT '[]'::jsonb,
				verification_method JSONB NOT NULL,
				falsifiability_method JSONB NOT NULL,
				sources JSONB NOT NULL DEFAULT '[]'::jsonb,
				impossibility NUMERIC(6, 5) NOT NULL DEFAULT 0.0 CHECK (impossibility >= 0 AND impossibility <= 1),
				probability_distribution TEXT NOT NULL,
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);

		// ==========================================
		// 8. INDEXES DE RECHERCHE ET PERFORMANCE
		// ==========================================
		await client.query(`
			CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(type);
			CREATE INDEX IF NOT EXISTS idx_relations_source_id ON relations(source_id);
			CREATE INDEX IF NOT EXISTS idx_relations_target_id ON relations(target_id);
			CREATE INDEX IF NOT EXISTS idx_proofs_fact_id ON proofs(fact_id);
			CREATE INDEX IF NOT EXISTS idx_proofs_relation_id ON proofs(relation_id);
			CREATE INDEX IF NOT EXISTS idx_proofs_parent_proof_id ON proofs(parent_proof_id);

			-- Index GIN pour les recherches dans les traductions JSONB
			CREATE INDEX IF NOT EXISTS idx_facts_name_gin ON facts USING gin (name);
			CREATE INDEX IF NOT EXISTS idx_relations_name_gin ON relations USING gin (name);
			CREATE INDEX IF NOT EXISTS idx_proofs_name_gin ON proofs USING gin (name);
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
