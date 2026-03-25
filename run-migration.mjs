import mysql from 'mysql2/promise';
import fs from 'fs';

const sql = fs.readFileSync('drizzle/0014_harsh_photon.sql', 'utf8');
const statements = sql
  .split('-->')
  .map(s => s.split('statement-breakpoint')[0].trim())
  .filter(s => s && !s.startsWith('--'));

const connection = await mysql.createConnection(process.env.DATABASE_URL);

for (const stmt of statements) {
  if (stmt) {
    console.log('Executing:', stmt.substring(0, 80) + '...');
    try {
      await connection.execute(stmt);
      console.log('✓ Success');
    } catch (error) {
      console.error('✗ Error:', error.message);
    }
  }
}

await connection.end();
console.log('\nMigration completed');
