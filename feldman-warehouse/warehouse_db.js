const { createClient } = require('@libsql/client');
const path = require('path');

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'warehouse.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
    url: url,
    authToken: authToken
});

async function initDb() {
    try {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS inventory_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                category TEXT DEFAULT 'כללי',
                shelf_location TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                min_quantity INTEGER NOT NULL DEFAULT 1,
                has_min_alert INTEGER NOT NULL DEFAULT 1,
                supplier_name TEXT DEFAULT '',
                supplier_phone TEXT DEFAULT '',
                price REAL DEFAULT 0,
                notes TEXT DEFAULT '',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Safely add any new columns to existing databases
        try { await client.execute("ALTER TABLE inventory_items ADD COLUMN has_min_alert INTEGER NOT NULL DEFAULT 1"); } catch(e){}
        try { await client.execute("ALTER TABLE inventory_items ADD COLUMN supplier_name TEXT DEFAULT ''"); } catch(e){}
        try { await client.execute("ALTER TABLE inventory_items ADD COLUMN supplier_phone TEXT DEFAULT ''"); } catch(e){}
        try { await client.execute("ALTER TABLE inventory_items ADD COLUMN price REAL DEFAULT 0"); } catch(e){}
        try { await client.execute("ALTER TABLE inventory_items ADD COLUMN notes TEXT DEFAULT ''"); } catch(e){}

        await client.execute(`
            CREATE TABLE IF NOT EXISTS inventory_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                item_name TEXT NOT NULL,
                action_type TEXT NOT NULL,
                quantity_changed INTEGER NOT NULL,
                quantity_after INTEGER NOT NULL,
                worker_name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES inventory_items(id)
            )
        `);

        await client.execute(`
            CREATE TABLE IF NOT EXISTS inventory_workers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL UNIQUE,
                role TEXT DEFAULT 'טכנאי',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if workers empty
        const workersRes = await client.execute("SELECT COUNT(*) as count FROM inventory_workers");
        const workersCount = Number(workersRes.rows[0].count);
        if (workersCount === 0) {
            const workers = ['משה כהן', 'אבי לוי', 'דוד אברהם', 'חיים מזרחי', 'יוסי ביטון', 'רוני חדד', 'שלמה פרץ'];
            for (const w of workers) {
                await client.execute({ sql: "INSERT INTO inventory_workers (full_name) VALUES (?)", args: [w] });
            }
            console.log("--> Seeded default inventory workers");
        }

        // Check if items empty
        const itemsRes = await client.execute("SELECT COUNT(*) as count FROM inventory_items");
        const itemsCount = Number(itemsRes.rows[0].count);
        if (itemsCount === 0) {
            const sampleItems = [
                { name: 'מיסב כדורי 6204', category: 'מיסבים', shelf: '1-1', qty: 15, minQty: 5, supplier: 'מ.ב. מיסבים', phone: '03-5551234', price: 45 },
                { name: 'מיסב כדורי 6308 2RS', category: 'מיסבים', shelf: '1-2', qty: 2, minQty: 4, supplier: 'מ.ב. מיסבים', phone: '03-5551234', price: 120 },
                { name: 'מיסב קוני 32210', category: 'מיסבים', shelf: '1-4', qty: 8, minQty: 3, supplier: 'טכנו-מיסב', phone: '04-8889900', price: 85 },
                { name: 'גלגל שיניים ישר Z-24 M2', category: 'גלגלי שיניים', shelf: '3-1', qty: 6, minQty: 2, supplier: 'גלגלי דרום', phone: '08-6771122', price: 210 },
                { name: 'גלגל שיניים חלזוני 1:30', category: 'גלגלי שיניים', shelf: '3-3', qty: 1, minQty: 2, supplier: 'גלגלי דרום', phone: '08-6771122', price: 450 },
                { name: 'מנוע חשמלי 1.5HP 1400RPM', category: 'מנועים', shelf: '5-1', qty: 3, minQty: 1, supplier: 'חשמל ומנועי שמש', phone: '09-7443322', price: 1100 },
                { name: 'מנוע תלת פאזי 5.5KW', category: 'מנועים', shelf: '5-2', qty: 0, minQty: 1, supplier: 'חשמל ומנועי שמש', phone: '09-7443322', price: 2400 },
                { name: 'רצועת הנעה B52', category: 'כללי', shelf: '8-1', qty: 12, minQty: 5, supplier: 'רצועות וגומצי', phone: '03-9008877', price: 35 },
                { name: 'מחזיר שמן 35x52x7', category: 'כללי', shelf: '10-2', qty: 25, minQty: 10, supplier: 'אטמים מרכזי', phone: '03-9221144', price: 18 }
            ];
            for (const item of sampleItems) {
                await client.execute({
                    sql: "INSERT INTO inventory_items (name, category, shelf_location, quantity, min_quantity, has_min_alert, supplier_name, supplier_phone, price) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
                    args: [item.name, item.category, item.shelf, item.qty, item.minQty, item.supplier, item.phone, item.price]
                });
            }
            console.log("--> Seeded sample inventory items with supplier details");
        }
        console.log(`--> Connected to Database: ${url.startsWith('libsql:') ? 'Turso Cloud ☁️' : 'Local SQLite File 📁'}`);
    } catch (err) {
        console.error("Database Init Error:", err);
    }
}

initDb();

module.exports = client;
