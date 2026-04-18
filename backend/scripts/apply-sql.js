const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

const file = process.argv[2];

if (!file) {
  console.error('Usage: node scripts/apply-sql.js <sql-file>');
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), file);
const sql = fs.readFileSync(sqlPath, 'utf8');

db.query(sql)
  .then(() => db.query(`
    SELECT
      to_regclass('public.order_adjustments') AS order_adjustments,
      to_regclass('public.order_adjustment_items') AS order_adjustment_items
  `))
  .then((result) => {
    console.log(JSON.stringify(result.rows[0]));
    return db.pool.end();
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
