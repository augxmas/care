const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const mysql = require('mysql2/promise');
require('dotenv').config();

const root = path.resolve(__dirname, '..');
const sqlitePath = path.join(root, 'database', 'advertise.sqlite');
const backupDir = path.join(root, 'database', 'backups');
const quote = value => `\`${String(value).replaceAll('`', '``')}\``;

function sqliteConnection() {
  const db = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);
  return {
    all(sql, params = []) {
      return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
    },
    close() {
      return new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
    },
  };
}

function mysqlType(column, indexed) {
  const declared = String(column.type || '').toUpperCase();
  const name = String(column.name).toLowerCase();
  if (declared.includes('INT')) return 'BIGINT';
  if (declared.includes('REAL') || declared.includes('FLOA') || declared.includes('DOUB')) return 'DOUBLE';
  if (declared.includes('BLOB')) return 'LONGBLOB';
  if (name.endsWith('_at') || name === 'created_at' || name === 'updated_at') return 'DATETIME';
  if (name.endsWith('_date') || name === 'holiday_date') return 'DATE';
  if (indexed || column.pk) return 'VARCHAR(191)';
  if (/^(status|role|type|category|country|postal_code|phone|mobile|fax|business_no|serial_no)$/.test(name)) return 'VARCHAR(255)';
  return 'LONGTEXT';
}

function mysqlDefault(column, type) {
  if (column.dflt_value === null || column.dflt_value === undefined) return '';
  const raw = String(column.dflt_value).trim();
  if (/datetime\s*\(\s*'now'/i.test(raw) || /^CURRENT_TIMESTAMP$/i.test(raw)) return ' DEFAULT CURRENT_TIMESTAMP';
  if (/^NULL$/i.test(raw)) return ' DEFAULT NULL';
  if (/^-?\d+(\.\d+)?$/.test(raw)) return ` DEFAULT ${raw}`;
  const unquoted = raw.replace(/^['"]|['"]$/g, '').replaceAll("''", "'");
  if (type === 'LONGTEXT' || type === 'LONGBLOB') return '';
  return ` DEFAULT ${mysql.escape(unquoted)}`;
}

async function backupMysql(connection, database) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = path.join(backupDir, `mysql-before-sqlite-migration-${stamp}.json`);
  const [tables] = await connection.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema=? ORDER BY table_name',
    [database],
  );
  const backup = { createdAt: new Date().toISOString(), database, tables: {} };
  for (const { name } of tables) {
    const [createRows] = await connection.query(`SHOW CREATE TABLE ${quote(name)}`);
    const [rows] = await connection.query(`SELECT * FROM ${quote(name)}`);
    backup.tables[name] = {
      createSql: createRows[0]['Create Table'],
      rows,
    };
  }
  fs.writeFileSync(output, JSON.stringify(backup, (_key, value) => {
    if (Buffer.isBuffer(value)) return { __type: 'Buffer', base64: value.toString('base64') };
    return value;
  }, 2));
  return output;
}

async function main() {
  if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite source not found: ${sqlitePath}`);
  const database = process.env.DB_NAME || 'advertise';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: false,
  });
  const sqlite = sqliteConnection();
  const backupPath = await backupMysql(connection, database);
  console.log(`[backup] ${backupPath}`);

  const tables = await sqlite.all(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const metadata = [];
  for (const table of tables) {
    const columns = await sqlite.all(`PRAGMA table_info(${quote(table.name)})`);
    const indexes = await sqlite.all(`PRAGMA index_list(${quote(table.name)})`);
    const indexDetails = [];
    const indexedColumns = new Set();
    for (const index of indexes) {
      const parts = await sqlite.all(`PRAGMA index_info(${quote(index.name)})`);
      parts.forEach(part => indexedColumns.add(part.name));
      indexDetails.push({ ...index, parts });
    }
    const foreignKeys = await sqlite.all(`PRAGMA foreign_key_list(${quote(table.name)})`);
    metadata.push({ ...table, columns, indexes: indexDetails, indexedColumns, foreignKeys });
  }

  await connection.query('SET FOREIGN_KEY_CHECKS=0');
  const [targetTables] = await connection.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema=?',
    [database],
  );
  for (const { name } of targetTables) await connection.query(`DROP TABLE IF EXISTS ${quote(name)}`);
  await connection.query('DROP FUNCTION IF EXISTS fn_encrypt');
  await connection.query('DROP FUNCTION IF EXISTS fn_decrypt');
  await connection.query(`
    CREATE FUNCTION fn_encrypt(p_data TEXT) RETURNS TEXT CHARSET utf8mb4 DETERMINISTIC
    RETURN IF(p_data IS NULL OR p_data='',p_data,
      TO_BASE64(AES_ENCRYPT(p_data,SHA2('monorama_adv_enc_key_2024_secret!',256))))
  `);
  await connection.query(`
    CREATE FUNCTION fn_decrypt(p_data TEXT) RETURNS TEXT CHARSET utf8mb4 DETERMINISTIC
    RETURN IF(p_data IS NULL OR p_data='',p_data,
      CONVERT(AES_DECRYPT(FROM_BASE64(p_data),SHA2('monorama_adv_enc_key_2024_secret!',256)) USING utf8mb4))
  `);

  for (const table of metadata) {
    const primary = table.columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk);
    const singleIntegerPrimary = primary.length === 1 && String(primary[0].type).toUpperCase().includes('INT');
    const definitions = table.columns.map(column => {
      const type = mysqlType(column, table.indexedColumns.has(column.name));
      const auto = singleIntegerPrimary && column.pk ? ' AUTO_INCREMENT' : '';
      const nullable = column.notnull || column.pk ? ' NOT NULL' : ' NULL';
      const inlinePrimary = primary.length === 1 && column.pk ? ' PRIMARY KEY' : '';
      return `${quote(column.name)} ${type}${nullable}${mysqlDefault(column, type)}${auto}${inlinePrimary}`;
    });
    if (primary.length > 1) definitions.push(`PRIMARY KEY (${primary.map(column => quote(column.name)).join(',')})`);
    await connection.query(
      `CREATE TABLE ${quote(table.name)} (${definitions.join(',')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    for (const index of table.indexes) {
      if (!index.parts.length || index.origin === 'pk') continue;
      const indexName = `idx_${table.name}_${index.parts.map(part => part.name).join('_')}`.slice(0, 60);
      const unique = index.unique ? 'UNIQUE ' : '';
      await connection.query(
        `CREATE ${unique}INDEX ${quote(indexName)} ON ${quote(table.name)} (${index.parts.map(part => quote(part.name)).join(',')})`,
      );
    }
  }

  const counts = {};
  for (const table of metadata) {
    const rows = await sqlite.all(`SELECT * FROM ${quote(table.name)}`);
    counts[table.name] = rows.length;
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    const batchSize = 200;
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize);
      const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
      const values = batch.flatMap(row => columns.map(column => row[column]));
      await connection.query(
        `INSERT INTO ${quote(table.name)} (${columns.map(quote).join(',')}) VALUES ${placeholders}`,
        values,
      );
    }
  }

  const foreignKeyWarnings = [];
  for (const table of metadata) {
    const grouped = new Map();
    for (const key of table.foreignKeys) {
      if (!grouped.has(key.id)) grouped.set(key.id, []);
      grouped.get(key.id).push(key);
    }
    for (const keys of grouped.values()) {
      keys.sort((a, b) => a.seq - b.seq);
      const first = keys[0];
      const name = `fk_${table.name}_${keys.map(key => key.from).join('_')}`.slice(0, 60);
      try {
        await connection.query(
          `ALTER TABLE ${quote(table.name)} ADD CONSTRAINT ${quote(name)}
           FOREIGN KEY (${keys.map(key => quote(key.from)).join(',')})
           REFERENCES ${quote(first.table)} (${keys.map(key => quote(key.to)).join(',')})
           ON UPDATE ${String(first.on_update || 'NO ACTION').replace('NO ACTION', 'RESTRICT')}
           ON DELETE ${String(first.on_delete || 'NO ACTION').replace('NO ACTION', 'RESTRICT')}`,
        );
      } catch (error) {
        foreignKeyWarnings.push(`${table.name}.${keys.map(key => key.from).join(',')}: ${error.message}`);
      }
    }
  }
  await connection.query('SET FOREIGN_KEY_CHECKS=1');

  const verification = {};
  for (const table of metadata) {
    const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM ${quote(table.name)}`);
    verification[table.name] = Number(row.count);
    if (verification[table.name] !== counts[table.name]) {
      throw new Error(`Count mismatch for ${table.name}: SQLite=${counts[table.name]}, MySQL=${verification[table.name]}`);
    }
  }
  console.log(JSON.stringify({ migratedTables: metadata.length, counts: verification, foreignKeyWarnings }, null, 2));
  await sqlite.close();
  await connection.end();
}

main().catch(error => {
  console.error('[migration failed]', error);
  process.exitCode = 1;
});
