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
					evolution JSONB,
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
					name translation_t,
					value JSONB
				);
			EXCEPTION
				WHEN duplicate_object THEN null;
			END $$;
		`);

		// Type composite pour les paramètres de distribution Skew Normal (Asymétrique Normale)
		await client.query(`
			DO $$ BEGIN
				CREATE TYPE skew_normal_parameter_t AS (
					xi NUMERIC,
					omega NUMERIC,
					alpha NUMERIC,
					weight NUMERIC
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
				existence evolution_t NOT NULL DEFAULT ROW('[{"function":"100","weight":1,"uncertainty":0}]'::jsonb, '%')::evolution_t,
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
				existence evolution_t NOT NULL DEFAULT ROW('[{"function":"100","weight":1,"uncertainty":0}]'::jsonb, '%')::evolution_t,
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100)
			);
		`);

		const otherNameType = await client.query(`
			SELECT a.atttypid = 'text'::regtype AS needs_upgrade
			FROM pg_attribute a
			JOIN pg_type t ON t.typrelid = a.attrelid
			WHERE t.typname = 'other_fact_t'
				AND a.attname = 'name'
				AND a.attnum > 0
				AND NOT a.attisdropped
		`);

		if (otherNameType.rows[0]?.needs_upgrade) {
			await client.query(`
				CREATE TYPE other_fact_t_translation AS (
					name translation_t,
					value JSONB
				);
			`);
			await client.query(`
				ALTER TABLE facts
				ALTER COLUMN other TYPE other_fact_t_translation[]
				USING CASE
					WHEN other IS NULL THEN NULL
					ELSE ARRAY(
						SELECT ROW(
							ROW(entry.name, entry.name, entry.name, entry.name)::translation_t,
							entry.value
						)::other_fact_t_translation
						FROM unnest(other) AS entry
					)
				END;
			`);
			await client.query('DROP TYPE other_fact_t;');
			await client.query('ALTER TYPE other_fact_t_translation RENAME TO other_fact_t;');
		}
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
				verification_method translation_t NOT NULL,
				falsifiability_method translation_t NOT NULL,
				source TEXT[] NOT NULL DEFAULT '{}',
				impossibility NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (impossibility >= 0 AND impossibility <= 1),
				start_probability_distribution skew_normal_parameter_t[] NOT NULL DEFAULT '{}',
				end_probability_distribution skew_normal_parameter_t[] NOT NULL DEFAULT '{}',
				originality NUMERIC(5, 2) NOT NULL DEFAULT 0.0 CHECK (originality >= 0 AND originality <= 100)
			);
		`);

		// Migration : probability_distribution devient la distribution du début, et une distribution de fin est ajoutée
		for (const table of ['proofs']) {
			await client.query(`
				DO $$ BEGIN
					IF EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_name = '${table}' AND column_name = 'probability_distribution'
					) THEN
						ALTER TABLE ${table} RENAME COLUMN probability_distribution TO start_probability_distribution;
					END IF;
				END $$;
			`);
			await client.query(`
				ALTER TABLE ${table}
					ADD COLUMN IF NOT EXISTS end_probability_distribution skew_normal_parameter_t[] NOT NULL DEFAULT '{}';
				UPDATE ${table} SET end_probability_distribution = start_probability_distribution
					WHERE end_probability_distribution = '{}' AND start_probability_distribution <> '{}';
			`);
		}

		// Lien d'une preuve vers le fait débattu et vers sa preuve parente (sous-preuves / débat)
		await client.query(`
			ALTER TABLE proofs
				ADD COLUMN IF NOT EXISTS fact_id UUID REFERENCES facts(id) ON DELETE CASCADE,
				ADD COLUMN IF NOT EXISTS relation_id UUID REFERENCES relations(id) ON DELETE CASCADE,
				ADD COLUMN IF NOT EXISTS parent_proof_id UUID REFERENCES proofs(id) ON DELETE CASCADE,
				ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
		`);

		// Veracity: remplace les distributions de début / fin et les impossibilités des preuves
		await client.query(`
			ALTER TABLE proofs
				DROP COLUMN IF EXISTS impossibility,
				DROP COLUMN IF EXISTS end_impossibility,
				DROP COLUMN IF EXISTS start_probability_distribution,
				DROP COLUMN IF EXISTS end_probability_distribution;
		`);

		// Veracity: evolution in percent (0 to 100) over time. A former number becomes a constant function.
		await client.query(`
			DO $$ BEGIN
				IF EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name = 'proofs' AND column_name = 'veracity' AND data_type = 'numeric'
				) THEN
					ALTER TABLE proofs DROP CONSTRAINT IF EXISTS proofs_veracity_check;
					ALTER TABLE proofs ALTER COLUMN veracity DROP DEFAULT;
					ALTER TABLE proofs ALTER COLUMN veracity TYPE evolution_t USING ROW(
						jsonb_build_array(jsonb_build_object('function', veracity::text, 'weight', 1, 'uncertainty', 0)),
						'%'
					)::evolution_t;
				END IF;
			END $$;
		`);
		await client.query(`
			ALTER TABLE proofs
				ADD COLUMN IF NOT EXISTS veracity evolution_t NOT NULL DEFAULT ROW('[{"function":"50","weight":1,"uncertainty":0}]'::jsonb, '%')::evolution_t;
		`);

		// Modification: valeurs ajoutées / modifiées / supprimées (remplace l'ancienne colonne new_value)
		await client.query(`
			ALTER TABLE proofs
				ADD COLUMN IF NOT EXISTS modification JSONB NOT NULL DEFAULT '{"value_to_modify":[],"new_value":[]}',
				DROP COLUMN IF EXISTS new_value;
			ALTER TABLE relations
				DROP COLUMN IF EXISTS modification,
				DROP COLUMN IF EXISTS element1_element2_value_to_modify,
				DROP COLUMN IF EXISTS element1_element2_value_to_delete,
				DROP COLUMN IF EXISTS element2_element1_value_to_modify,
				DROP COLUMN IF EXISTS element2_element1_value_to_delete,
				ADD COLUMN IF NOT EXISTS element1_element2_new_value JSONB NOT NULL DEFAULT '[]',
				ADD COLUMN IF NOT EXISTS element2_element1_new_value JSONB NOT NULL DEFAULT '[]';
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
				evolution JSONB NOT NULL,
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

			CREATE INDEX IF NOT EXISTS idx_proofs_fact_id
			ON proofs(fact_id);

			CREATE INDEX IF NOT EXISTS idx_proofs_relation_id
			ON proofs(relation_id);

			CREATE INDEX IF NOT EXISTS idx_proofs_parent_proof_id
			ON proofs(parent_proof_id);
		`);

		// Impossibility of the END distribution (impossibility is the one of the start distribution)
		for (const table of ['proofs']) {
			await client.query(
				`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS end_impossibility NUMERIC(5, 4) NOT NULL DEFAULT 0.0 CHECK (end_impossibility >= 0 AND end_impossibility <= 1);`
			);
		}

		// Existence: probability (0 to 1) over time that a fact exists (or that an event occurs). It replaces the
		// impossibilities and the start / end distributions of the facts and relations. The existing rows exist forever.
		for (const table of ['facts', 'relations']) {
			await client.query(`
				ALTER TABLE ${table}
					ADD COLUMN IF NOT EXISTS existence evolution_t NOT NULL DEFAULT ROW('[{"function":"100","weight":1,"uncertainty":0}]'::jsonb, '%')::evolution_t,
					DROP COLUMN IF EXISTS impossibility,
					DROP COLUMN IF EXISTS end_impossibility,
					DROP COLUMN IF EXISTS probability_distribution,
					DROP COLUMN IF EXISTS start_probability_distribution,
					DROP COLUMN IF EXISTS end_probability_distribution;
			`);
		}

		// Existence is now a percentage (0 to 100): the first version stored a probability between 0 and 1
		for (const table of ['facts', 'relations']) {
			await client.query(`
				UPDATE ${table}
				SET existence = ROW(
					(SELECT jsonb_agg(jsonb_set(component, '{function}', to_jsonb('100 * (' || (component->>'function') || ')')))
					 FROM jsonb_array_elements((existence).evolution) AS component),
					'%'
				)::evolution_t
				WHERE (existence).unit = 'probability';
			`);
		}

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
