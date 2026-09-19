import { db } from './src/lib/server/utils/database';

function create_database() {
	db.query('BEGIN');
	db.query(`
        CREATE TBALE IF NOT EXISTS 
    `);
	db.query('COMMIT');
}

create_database();
