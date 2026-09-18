const sql = require('mssql');
require('dotenv').config();

// תצורת התחברות ל-SQL Server Express
const config = {
    server: process.env.DB_SERVER || 'localhost\\SQLEXPRESS',
    database: process.env.DB_NAME || 'FeldmanWarehouse',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true', // false כברירת מחדל לשרת מקומי
        trustServerCertificate: true, // מונע שגיאות תעודת SSL פנימית
        enableArithAbort: true
    },
    pool: {
        max: 15,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// תמיכה בהזדהות SQL (משתמש וסיסמה) או Windows Authentication
if (process.env.DB_USER && process.env.DB_PASSWORD) {
    config.user = process.env.DB_USER;
    config.password = process.env.DB_PASSWORD;
}

if (process.env.DB_PORT) {
    config.port = parseInt(process.env.DB_PORT, 10);
}

let pool = null;

/**
 * קבלת חיבור בריכת החיבורים (Connection Pool)
 */
async function getPool() {
    if (!pool) {
        try {
            pool = await new sql.ConnectionPool(config).connect();
            console.log(`[SQL Server] מחובר בהצלחה לשרת ${config.server}, מסד נתונים ${config.database}`);
            pool.on('error', err => {
                console.error('[SQL Server Pool Error]:', err);
                pool = null;
            });
        } catch (err) {
            console.error('[SQL Server Connection Error]:', err.message);
            pool = null;
            throw err;
        }
    }
    return pool;
}

/**
 * פונקציית עזר להרצת שאילתות פרמטריות בצורה מאובטחת
 * @param {string} sqlText - פקודת ה-SQL להרצה
 * @param {Object} params - אובייקט פרמטרים כגון { name: 'מיסב', id: 5 }
 */
async function query(sqlText, params = {}) {
    const p = await getPool();
    const req = p.request();
    for (const [key, value] of Object.entries(params)) {
        if (value === null || value === undefined) {
            req.input(key, sql.NVarChar, null);
        } else if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                req.input(key, sql.Int, value);
            } else {
                req.input(key, sql.Decimal(10, 2), value);
            }
        } else if (typeof value === 'boolean') {
            req.input(key, sql.Bit, value ? 1 : 0);
        } else {
            req.input(key, sql.NVarChar, String(value));
        }
    }
    return await req.query(sqlText);
}

module.exports = {
    sql,
    getPool,
    query
};
