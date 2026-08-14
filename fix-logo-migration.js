require('dotenv').config();
const mysql2 = require('mysql2/promise');
async function run() {
  const conn = await mysql2.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'smartserve'
  });
  console.log('Connected. Clearing old Base64 logo rows...');
  const [r1] = await conn.execute('UPDATE Tenants SET logo = NULL WHERE logo IS NOT NULL AND LENGTH(logo) > 500');
  console.log('Rows cleared:', r1.affectedRows);
  await conn.execute("ALTER TABLE Tenants CHANGE logo logo VARCHAR(500) NULL COMMENT 'Cloudinary URL for restaurant logo'");
  console.log('Column changed to VARCHAR(500) successfully.');
  await conn.end();
}
run().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
