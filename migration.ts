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

		// Type composite pour une ressource matérielle d'une action, avec un titre traduit (comme une capacité)
		await client.query(`
			DO $$ BEGIN
				CREATE TYPE action_material_t AS (
					name translation_t,
					description translation_t,
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

		// Type composite pour une valeur titrée d'une liste (capacité, volonté...) : le titre permet de la cibler
		await client.query(`
			DO $$ BEGIN
				CREATE TYPE titled_item_t AS (
					name translation_t,
					description translation_t
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
			`);
			// The start distribution is dropped by a later step: only copy it while it still exists
			await client.query(`
				DO $$ BEGIN
					IF EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_name = '${table}' AND column_name = 'start_probability_distribution'
					) THEN
						UPDATE ${table} SET end_probability_distribution = start_probability_distribution
							WHERE end_probability_distribution = '{}' AND start_probability_distribution <> '{}';
					END IF;
				END $$;
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

		// Impact: force avec laquelle la preuve fait évoluer sa valeur vers la valeur désirée
		await client.query(`
			ALTER TABLE proofs
				ADD COLUMN IF NOT EXISTS impact NUMERIC NOT NULL DEFAULT 0.0;
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

		// Preuve par valeur : une preuve porte sur une seule valeur (value_name) et donne sa valeur souhaitée (desired_value)
		await client.query(`
			ALTER TABLE proofs
				ADD COLUMN IF NOT EXISTS value_name JSONB,
				ADD COLUMN IF NOT EXISTS desired_value JSONB,
				DROP COLUMN IF EXISTS new_value;
		`);
		// Anciennes preuves globales : chaque valeur de leur modification devient une preuve sur cette valeur
		await client.query(`
			DO $$ BEGIN
				IF EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name = 'proofs' AND column_name = 'modification'
				) THEN
					INSERT INTO proofs (
						name, description, verification_method, falsifiability_method, source, veracity,
						originality, fact_id, relation_id, parent_proof_id, created_at, value_name, desired_value
					)
					SELECT p.name, p.description, p.verification_method, p.falsifiability_method, p.source, p.veracity,
						p.originality, p.fact_id, p.relation_id, p.parent_proof_id, p.created_at,
						e.entry->'name', e.entry->'value'
					FROM proofs p,
						jsonb_array_elements(
							COALESCE(p.modification->'value_to_modify', '[]') || COALESCE(p.modification->'new_value', '[]')
						) WITH ORDINALITY AS e(entry, n)
					WHERE p.value_name IS NULL AND e.n > 1;

					UPDATE proofs SET
						value_name = (COALESCE(modification->'value_to_modify', '[]') || COALESCE(modification->'new_value', '[]'))->0->'name',
						desired_value = (COALESCE(modification->'value_to_modify', '[]') || COALESCE(modification->'new_value', '[]'))->0->'value'
					WHERE value_name IS NULL;

					ALTER TABLE proofs DROP COLUMN modification;
				END IF;
			END $$;
		`);
		await client.query(`
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
				power titled_item_t[] NOT NULL DEFAULT '{}'
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
				willing titled_item_t[] NOT NULL DEFAULT '{}',
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
				material_resource_used action_material_t[] NOT NULL DEFAULT '{}',
				fund_used evolution_t NOT NULL,
				human_mobilized evolution_t NOT NULL
			);
		`);

		// Migration : the material resources of an action get a translated title and a description (like a capability).
		// The old name (a text) becomes the title in every language.
		for (const column of ['material_resource_used', 'material_resource_necessary']) {
			await client.query(`
				DO $$ BEGIN
					IF EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_name = 'actions' AND column_name = '${column}' AND udt_name = '_action_material_resource_t'
					) THEN
						ALTER TABLE actions RENAME COLUMN ${column} TO ${column}_old;
						ALTER TABLE actions ADD COLUMN ${column} action_material_t[] NOT NULL DEFAULT '{}';
						UPDATE actions SET ${column} = ARRAY(
							SELECT ROW(
								ROW((r).name, (r).name, (r).name, (r).name)::translation_t,
								ROW((r).name, (r).name, (r).name, (r).name)::translation_t,
								(r).quantity,
								(r).level_of_wear
							)::action_material_t
							FROM unnest(${column}_old) AS r
						);
						ALTER TABLE actions DROP COLUMN ${column}_old;
					END IF;
				END $$;
			`);
		}

		// Necessary resources of an action (in addition of the ones used)
		await client.query(`
			ALTER TABLE actions
				ADD COLUMN IF NOT EXISTS material_resource_necessary action_material_t[] NOT NULL DEFAULT '{}',
				ADD COLUMN IF NOT EXISTS fund_necessary evolution_t NOT NULL DEFAULT ROW('[{"function":"0","weight":1,"uncertainty":0}]'::jsonb, '')::evolution_t,
				ADD COLUMN IF NOT EXISTS human_necessary evolution_t NOT NULL DEFAULT ROW('[{"function":"0","weight":1,"uncertainty":0}]'::jsonb, '')::evolution_t;
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
				power titled_item_t[] NOT NULL DEFAULT '{}'
			);
		`);

		// Migration : les listes de traductions (power, willing) deviennent des listes de valeurs titrées
		for (const [table, column] of [
			['characters', 'power'],
			['material_resources', 'power'],
			['interest_groups', 'willing']
		]) {
			await client.query(`
				DO $$ BEGIN
					IF EXISTS (
						SELECT 1 FROM information_schema.columns
						WHERE table_name = '${table}' AND column_name = '${column}' AND udt_name = '_translation_t'
					) THEN
						ALTER TABLE ${table} ALTER COLUMN ${column} DROP DEFAULT;
						ALTER TABLE ${table} ALTER COLUMN ${column} TYPE titled_item_t[] USING ARRAY(
							SELECT ROW(entry, entry)::titled_item_t FROM unnest(${column}) AS entry
						);
						ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT '{}';
					END IF;
				END $$;
			`);
		}

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
