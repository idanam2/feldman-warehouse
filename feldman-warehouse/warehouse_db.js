const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'warehouse.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // 1. Inventory Items Table
    db.run(`
        CREATE TABLE IF NOT EXISTS inventory_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            category TEXT DEFAULT 'כללי',
            shelf_location TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            min_quantity INTEGER NOT NULL DEFAULT 1,
            unit TEXT DEFAULT 'יחידות',
            notes TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 2. Inventory Transactions (Audit Log)
    db.run(`
        CREATE TABLE IF NOT EXISTS inventory_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            item_name TEXT NOT NULL,
            action_type TEXT NOT NULL, -- 'take' or 'add'
            quantity_changed INTEGER NOT NULL,
            quantity_after INTEGER NOT NULL,
            worker_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_id) REFERENCES inventory_items(id)
        )
    `);

    // 3. Workers / Technicians List
    db.run(`
        CREATE TABLE IF NOT EXISTS inventory_workers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL UNIQUE,
            role TEXT DEFAULT 'טכנאי',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Seed Initial Workers if empty
    db.get("SELECT COUNT(*) as count FROM inventory_workers", (err, row) => {
        if (!err && row && row.count === 0) {
            const workers = [
                'משה כהן',
                'אבי לוי',
                'דוד אברהם',
                'חיים מזרחי',
                'יוסי ביטון',
                'רוני חדד',
                'שלמה פרץ'
            ];
            const stmt = db.prepare("INSERT INTO inventory_workers (full_name) VALUES (?)");
            workers.forEach(w => stmt.run(w));
            stmt.finalize();
            console.log("--> Seeded default inventory workers");
        }
    });

    // Seed Initial Items if empty
    db.get("SELECT COUNT(*) as count FROM inventory_items", (err, row) => {
        if (!err && row && row.count === 0) {
            const sampleItems = [
                { name: 'מיסב כדורי 6204', category: 'מיסבים', shelf: '1-1', qty: 15, minQty: 5 },
                { name: 'מיסב כדורי 6308 2RS', category: 'מיסבים', shelf: '1-2', qty: 2, minQty: 4 }, // Low stock!
                { name: 'מיסב קוני 32210', category: 'מיסבים', shelf: '1-4', qty: 8, minQty: 3 },
                { name: 'גלגל שיניים ישר Z-24 M2', category: 'גלגלי שיניים', shelf: '3-1', qty: 6, minQty: 2 },
                { name: 'גלגל שיניים חלזוני 1:30', category: 'גלגלי שיניים', shelf: '3-3', qty: 1, minQty: 2 }, // Low stock!
                { name: 'מנוע חשמלי 1.5HP 1400RPM', category: 'מנועים', shelf: '5-1', qty: 3, minQty: 1 },
                { name: 'מנוע תלת פאזי 5.5KW', category: 'מנועים', shelf: '5-2', qty: 0, minQty: 1 }, // Low stock!
                { name: 'רצועת הנעה B52', category: 'כללי', shelf: '8-1', qty: 12, minQty: 5 },
                { name: 'מחזיר שמן 35x52x7', category: 'כללי', shelf: '10-2', qty: 25, minQty: 10 }
            ];

            const stmt = db.prepare("INSERT INTO inventory_items (name, category, shelf_location, quantity, min_quantity) VALUES (?, ?, ?, ?, ?)");
            sampleItems.forEach(item => {
                stmt.run(item.name, item.category, item.shelf, item.qty, item.minQty);
            });
            stmt.finalize();
            console.log("--> Seeded sample inventory items");
        }
    });
});

module.exports = db;
