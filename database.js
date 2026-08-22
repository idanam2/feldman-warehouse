const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'maintenance.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // 1. Workers table
    db.run(`
        CREATE TABLE IF NOT EXISTS workers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_code TEXT UNIQUE NOT NULL,
            pin TEXT NOT NULL,
            full_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 2. Machines table
    db.run(`
        CREATE TABLE IF NOT EXISTS machines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_number INTEGER UNIQUE NOT NULL,
            name TEXT NOT NULL,
            location TEXT,
            status TEXT DEFAULT 'active'
        )
    `);

    // 3. Routine tasks table
    db.run(`
        CREATE TABLE IF NOT EXISTS routine_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_number INTEGER NOT NULL,
            title TEXT NOT NULL,
            frequency TEXT NOT NULL,
            description TEXT,
            last_performed_at DATETIME,
            last_performed_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 4. Breakdown tickets table
    db.run(`
        CREATE TABLE IF NOT EXISTS breakdowns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_number INTEGER NOT NULL,
            priority INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 5),
            title TEXT NOT NULL,
            description TEXT,
            image_url TEXT,
            notes TEXT,
            status TEXT DEFAULT 'open',
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME,
            resolved_by TEXT
        )
    `);

    // 5. Immutable Audit Logs table
    db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type TEXT NOT NULL,
            target_id INTEGER,
            machine_number INTEGER,
            action_title TEXT NOT NULL,
            worker_name TEXT NOT NULL,
            employee_code TEXT,
            notes TEXT,
            is_admin_override INTEGER DEFAULT 0,
            override_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Seed default data if empty
    db.get("SELECT COUNT(*) as count FROM workers", (err, row) => {
        if (!err && row && row.count === 0) {
            const stmt = db.prepare("INSERT INTO workers (employee_code, pin, full_name) VALUES (?, ?, ?)");
            stmt.run("1001", "1234", "דני כהן");
            stmt.run("1002", "5678", "יוסי לוי");
            stmt.run("1003", "9999", "מיכל אברהם");
            stmt.finalize();
            console.log("--> Seeded default workers");
        }
    });

    db.get("SELECT COUNT(*) as count FROM machines", (err, row) => {
        if (!err && row && row.count === 0) {
            const stmt = db.prepare("INSERT INTO machines (machine_number, name, location) VALUES (?, ?, ?)");
            stmt.run(1, "מחרטה / CNC 1", "עמדה א'");
            stmt.run(2, "מכבש הידראולי 2", "עמדה ב'");
            stmt.run(3, "מסור סרט 3", "עמדה ג'");
            stmt.run(4, "כרסומת קונבנציונלית 4", "עמדה ד'");
            stmt.finalize();
            console.log("--> Seeded default machines");
        }
    });

    db.get("SELECT COUNT(*) as count FROM routine_tasks", (err, row) => {
        if (!err && row && row.count === 0) {
            const stmt = db.prepare("INSERT INTO routine_tasks (machine_number, title, frequency, description) VALUES (?, ?, ?, ?)");
            stmt.run(1, "בדיקת שמן הידראולי וגירוז מובילים", "יומי", "לוודא מפלס שמן בחלונית ולגרז במידת הצורך");
            stmt.run(1, "ניקוי פילטר אוויר ראשי ושאיבת שבבים", "שבועי", "לנקות בלחץ אוויר ולשאוב תחתית המכונה");
            stmt.run(2, "בדיקת לחץ שסתומים וצינורות הידראוליים", "יומי", "לוודא שאין הזעות שמן בחיבורים");
            stmt.run(2, "בדיקת תקינות לחצן חירום ומפסיקי גבול", "חודשי", "בדיקת בטיחות חודשית מלאה");
            stmt.run(3, "בדיקת מתיחת להב ושימון מנגנון הטיפה", "יומי", "כוון מתיחה לפי שעון קליבר");
            stmt.finalize();
            console.log("--> Seeded default routine tasks");
        }
    });

    db.get("SELECT COUNT(*) as count FROM breakdowns", (err, row) => {
        if (!err && row && row.count === 0) {
            const stmt = db.prepare("INSERT INTO breakdowns (machine_number, priority, title, description, notes, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
            stmt.run(2, 4, "נזילת שמן בבוכנה ימנית", "בזמן הפעלה נצפה טפטוף שמן מאטם הבוכנה הראשית", "נדרש להחליף אטם או לפחות לחזק ברגי אוגן", "open", "מנהל עבודה");
            stmt.run(1, 2, "רעש חריג במנוע קירור", "בעת הפעלת נוזל קירור נשמע שריקה מחוד ההנעה", "לבדוק מייסב משאבה", "open", "מנהל עבודה");
            stmt.finalize();
            console.log("--> Seeded default breakdowns");
        }
    });
});

module.exports = db;
