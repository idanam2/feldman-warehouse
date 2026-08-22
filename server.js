const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const db = require('./database');
const warehouseDb = require('./warehouse_db');

const app = express();
const PORT = process.env.PORT || 3000;

// Admin password for site management
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration for breakdown photos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'breakdown-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage });

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files and uploaded files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Helper function to verify worker credentials
function verifyWorker(employee_code, pin, callback) {
    db.get(
        "SELECT * FROM workers WHERE employee_code = ? AND pin = ?",
        [employee_code, pin],
        (err, worker) => {
            if (err) return callback(err, null);
            if (!worker) return callback(null, null);
            callback(null, worker);
        }
    );
}

// ==================== ROUTES ====================

// 1. Admin Authentication
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true, message: 'מנהל מחובר בהצלחה' });
    }
    return res.status(401).json({ success: false, message: 'סיסמת מנהל שגויה' });
});

// 2. Verify Worker Credentials (Client side pre-check if needed)
app.post('/api/auth/verify-worker', (req, res) => {
    const { employee_code, pin } = req.body;
    verifyWorker(employee_code, pin, (err, worker) => {
        if (err) return res.status(500).json({ error: 'שגיאת מסד נתונים' });
        if (!worker) return res.status(401).json({ error: 'מספר עובד או קוד אישי שגוי' });
        res.json({ success: true, full_name: worker.full_name, employee_code: worker.employee_code });
    });
});

// 3. Machines List
app.get('/api/machines', (req, res) => {
    db.all("SELECT * FROM machines ORDER BY machine_number ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/machines', (req, res) => {
    const { machine_number, name, location } = req.body;
    if (!machine_number || !name) {
        return res.status(400).json({ error: 'מספר מכונה ושם מכונה הם שדות חובה' });
    }
    db.run(
        "INSERT INTO machines (machine_number, name, location) VALUES (?, ?, ?)",
        [machine_number, name, location || ''],
        function(err) {
            if (err) return res.status(400).json({ error: 'מספר המכונה כבר קיים במערכת' });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// 4. Routine Tasks
app.get('/api/routine-tasks', (req, res) => {
    db.all(`
        SELECT rt.*, m.name as machine_name 
        FROM routine_tasks rt
        LEFT JOIN machines m ON rt.machine_number = m.machine_number
        ORDER BY rt.machine_number ASC, rt.id DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/routine-tasks', (req, res) => {
    const { machine_number, title, frequency, description } = req.body;
    if (!machine_number || !title || !frequency) {
        return res.status(400).json({ error: 'חסרים שדות חובה' });
    }
    db.run(
        "INSERT INTO routine_tasks (machine_number, title, frequency, description) VALUES (?, ?, ?, ?)",
        [machine_number, title, frequency, description || ''],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// Worker Sign-Off for Routine Task
app.post('/api/routine-tasks/:id/signoff', (req, res) => {
    const taskId = req.params.id;
    const { employee_code, pin, notes } = req.body;

    verifyWorker(employee_code, pin, (err, worker) => {
        if (err) return res.status(500).json({ error: 'שגיאת שרת' });
        if (!worker) return res.status(401).json({ error: 'מספר עובד או קוד אישי שגוי' });

        db.get("SELECT * FROM routine_tasks WHERE id = ?", [taskId], (err, task) => {
            if (err || !task) return res.status(444).json({ error: 'משימה לא נמצאה' });

            const now = new Date().toISOString();
            db.run(
                "UPDATE routine_tasks SET last_performed_at = ?, last_performed_by = ? WHERE id = ?",
                [now, worker.full_name, taskId],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });

                    // Append immutable audit log
                    db.run(
                        `INSERT INTO audit_logs 
                        (action_type, target_id, machine_number, action_title, worker_name, employee_code, notes) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        ['routine_signoff', taskId, task.machine_number, task.title, worker.full_name, worker.employee_code, notes || 'בוצע בהצלחה'],
                        (auditErr) => {
                            if (auditErr) console.error("Audit log error:", auditErr);
                            res.json({
                                success: true,
                                message: `הפעולה נחתמה בהצלחה על ידי ${worker.full_name}`,
                                worker_name: worker.full_name,
                                timestamp: now
                            });
                        }
                    );
                }
            );
        });
    });
});

// 5. Breakdowns (תקלות מתפרצות)
app.get('/api/breakdowns', (req, res) => {
    db.all(`
        SELECT b.*, m.name as machine_name 
        FROM breakdowns b
        LEFT JOIN machines m ON b.machine_number = m.machine_number
        ORDER BY b.status ASC, b.priority DESC, b.created_at DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/breakdowns', upload.single('image'), (req, res) => {
    const { machine_number, priority, title, description, notes, created_by } = req.body;
    if (!machine_number || !priority || !title) {
        return res.status(400).json({ error: 'חסרים שדות חובה (מספר מכונה, עדיפות, כותרת)' });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    db.run(
        `INSERT INTO breakdowns 
        (machine_number, priority, title, description, image_url, notes, status, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
        [machine_number, parseInt(priority), title, description || '', imageUrl, notes || '', created_by || 'מנהל עבודה'],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const breakdownId = this.lastID;

            // Audit log
            db.run(
                `INSERT INTO audit_logs 
                (action_type, target_id, machine_number, action_title, worker_name, notes) 
                VALUES ('breakdown_created', ?, ?, ?, ?, ?)`,
                [breakdownId, machine_number, `דיווח תקלה: ${title}`, created_by || 'מנהל עבודה', `עדיפות: ${priority}`],
                () => {
                    res.json({ success: true, id: breakdownId, image_url: imageUrl });
                }
            );
        }
    );
});

// Worker Resolve Breakdown Sign-Off
app.post('/api/breakdowns/:id/resolve', (req, res) => {
    const breakdownId = req.params.id;
    const { employee_code, pin, notes } = req.body;

    verifyWorker(employee_code, pin, (err, worker) => {
        if (err) return res.status(500).json({ error: 'שגיאת שרת' });
        if (!worker) return res.status(401).json({ error: 'מספר עובד או קוד אישי שגוי' });

        db.get("SELECT * FROM breakdowns WHERE id = ?", [breakdownId], (err, breakdown) => {
            if (err || !breakdown) return res.status(404).json({ error: 'תקלה לא נמצאה' });

            const now = new Date().toISOString();
            db.run(
                "UPDATE breakdowns SET status = 'resolved', resolved_at = ?, resolved_by = ?, notes = ? WHERE id = ?",
                [now, worker.full_name, (breakdown.notes ? breakdown.notes + "\n" : "") + `סגירת תקלה: ${notes || ''}`, breakdownId],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });

                    // Audit log
                    db.run(
                        `INSERT INTO audit_logs 
                        (action_type, target_id, machine_number, action_title, worker_name, employee_code, notes) 
                        VALUES ('breakdown_resolve', ?, ?, ?, ?, ?, ?)`,
                        [breakdownId, breakdown.machine_number, `סגירת תקלה: ${breakdown.title}`, worker.full_name, worker.employee_code, notes || 'תורגמה וטופלה בהצלחה'],
                        (auditErr) => {
                            if (auditErr) console.error(auditErr);
                            res.json({
                                success: true,
                                message: `התקלה נסגרה ונחתמה בהצלחה על ידי ${worker.full_name}`,
                                worker_name: worker.full_name,
                                timestamp: now
                            });
                        }
                    );
                }
            );
        });
    });
});

// 6. Workers Management (Admin)
app.get('/api/workers', (req, res) => {
    db.all("SELECT id, employee_code, full_name, created_at FROM workers ORDER BY full_name ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/workers', (req, res) => {
    const { employee_code, pin, full_name } = req.body;
    if (!employee_code || !pin || !full_name) {
        return res.status(400).json({ error: 'כל השדות (מספר עובד, קוד אישי, שם מלא) הם חובה' });
    }

    db.run(
        "INSERT INTO workers (employee_code, pin, full_name) VALUES (?, ?, ?)",
        [employee_code, pin, full_name],
        function(err) {
            if (err) return res.status(400).json({ error: 'מספר עובד זה כבר קיים במערכת' });

            db.run(
                `INSERT INTO audit_logs (action_type, action_title, worker_name, notes) VALUES ('worker_added', ?, 'מנהל מערכת', ?)`,
                [`הוספת עובד: ${full_name}`, `מספר עובד: ${employee_code}`]
            );

            res.json({ success: true, id: this.lastID });
        }
    );
});

app.delete('/api/workers/:id', (req, res) => {
    const workerId = req.params.id;
    db.run("DELETE FROM workers WHERE id = ?", [workerId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 7. Audit Logs & History (Immutable)
app.get('/api/audit-logs', (req, res) => {
    db.all("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Admin override endpoint
app.post('/api/audit-logs/override', (req, res) => {
    const { log_id, admin_password, override_reason, correction_notes } = req.body;
    if (admin_password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'סיסמת מנהל שגויה' });
    }
    if (!override_reason) {
        return res.status(400).json({ error: 'חובה לציין סיבת תיקון/שינוי' });
    }

    db.get("SELECT * FROM audit_logs WHERE id = ?", [log_id], (err, log) => {
        if (err || !log) return res.status(404).json({ error: 'רשומת יומן לא נמצאה' });

        // Record admin override log (does NOT delete original record, appends override record)
        db.run(
            `INSERT INTO audit_logs 
            (action_type, target_id, machine_number, action_title, worker_name, notes, is_admin_override, override_reason) 
            VALUES ('admin_override', ?, ?, ?, 'מנהל מערכת', ?, 1, ?)`,
            [log.target_id, log.machine_number, `תיקון מנהל על: ${log.action_title}`, correction_notes || `חוקן תוקן ע"י מנהל`, override_reason],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'תיקון המנהל נרשם בהצלחה ביומן הפעילויות' });
            }
        );
    });
});

// ==================== WAREHOUSE ROUTES (ניהול מחסן ומלאי) ====================

// Get all inventory workers
app.get('/api/warehouse/workers', async (req, res) => {
    try {
        const result = await warehouseDb.execute("SELECT * FROM inventory_workers ORDER BY full_name ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add new worker
app.post('/api/warehouse/workers', async (req, res) => {
    const { full_name } = req.body;
    if (!full_name || !full_name.trim()) {
        return res.status(400).json({ error: 'שם עובד הוא שדה חובה' });
    }
    try {
        const result = await warehouseDb.execute({
            sql: "INSERT INTO inventory_workers (full_name) VALUES (?)",
            args: [full_name.trim()]
        });
        res.json({ success: true, id: Number(result.lastInsertRowid), full_name: full_name.trim() });
    } catch (err) {
        res.status(400).json({ error: 'עובד בשם זה כבר קיים במערכת' });
    }
});

// Edit worker name
app.put('/api/warehouse/workers/:id', async (req, res) => {
    const workerId = req.params.id;
    const { full_name } = req.body;
    if (!full_name || !full_name.trim()) {
        return res.status(400).json({ error: 'שם עובד הוא שדה חובה' });
    }
    try {
        await warehouseDb.execute({
            sql: "UPDATE inventory_workers SET full_name = ? WHERE id = ?",
            args: [full_name.trim(), workerId]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'עובד בשם זה כבר קיים' });
    }
});

// Delete worker
app.delete('/api/warehouse/workers/:id', async (req, res) => {
    const workerId = req.params.id;
    try {
        await warehouseDb.execute({
            sql: "DELETE FROM inventory_workers WHERE id = ?",
            args: [workerId]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get inventory items (sorted by physical shelf location 1-1 to 13-4)
app.get('/api/warehouse/items', async (req, res) => {
    const { search, shelf } = req.query;
    let query = "SELECT * FROM inventory_items WHERE 1=1";
    const args = [];

    if (search) {
        query += " AND (name LIKE ? OR category LIKE ? OR shelf_location LIKE ?)";
        const term = `%${search}%`;
        args.push(term, term, term);
    }

    if (shelf) {
        query += " AND shelf_location = ?";
        args.push(shelf);
    }

    query += " ORDER BY CAST(substr(shelf_location, 1, instr(shelf_location, '-') - 1) AS INTEGER) ASC, CAST(substr(shelf_location, instr(shelf_location, '-') + 1) AS INTEGER) ASC, name ASC";

    try {
        const result = await warehouseDb.execute({ sql: query, args: args });
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get low stock items (only for items with has_min_alert = 1)
app.get('/api/warehouse/low-stock', async (req, res) => {
    try {
        const result = await warehouseDb.execute("SELECT * FROM inventory_items WHERE has_min_alert = 1 AND quantity <= min_quantity ORDER BY quantity ASC, name ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add new inventory item
app.post('/api/warehouse/items', async (req, res) => {
    const { name, category, shelf_location, quantity, min_quantity, has_min_alert, supplier_name, supplier_phone, price, notes } = req.body;
    if (!name || !shelf_location) {
        return res.status(400).json({ error: 'שם פריט ומיקום מדף הם שדות חובה' });
    }

    const initQty = parseInt(quantity) || 0;
    const minQty = parseInt(min_quantity) || 1;
    const alertFlag = has_min_alert === false || has_min_alert === 0 || has_min_alert === '0' ? 0 : 1;
    const itemPrice = parseFloat(price) || 0;

    try {
        const result = await warehouseDb.execute({
            sql: `INSERT INTO inventory_items (name, category, shelf_location, quantity, min_quantity, has_min_alert, supplier_name, supplier_phone, price, notes) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [name.trim(), category || 'כללי', shelf_location.trim(), initQty, minQty, alertFlag, supplier_name || '', supplier_phone || '', itemPrice, notes || '']
        });

        const newItemId = Number(result.lastInsertRowid);

        if (initQty > 0) {
            await warehouseDb.execute({
                sql: `INSERT INTO inventory_transactions (item_id, item_name, action_type, quantity_changed, quantity_after, worker_name) 
                      VALUES (?, ?, 'add', ?, ?, 'מנהל מחסן (הוספת פריט חדש)')`,
                args: [newItemId, name.trim(), initQty, initQty]
            });
        }

        res.json({ success: true, id: newItemId });
    } catch (err) {
        res.status(400).json({ error: 'קיים כבר פריט בשם זה במחסן' });
    }
});

// Edit existing item
app.put('/api/warehouse/items/:id', async (req, res) => {
    const itemId = req.params.id;
    const { name, category, shelf_location, quantity, min_quantity, has_min_alert, supplier_name, supplier_phone, price, notes } = req.body;

    const alertFlag = has_min_alert === false || has_min_alert === 0 || has_min_alert === '0' ? 0 : 1;
    const itemPrice = parseFloat(price) || 0;

    try {
        await warehouseDb.execute({
            sql: `UPDATE inventory_items 
                  SET name = ?, category = ?, shelf_location = ?, quantity = ?, min_quantity = ?, has_min_alert = ?, supplier_name = ?, supplier_phone = ?, price = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
                  WHERE id = ?`,
            args: [name, category, shelf_location, parseInt(quantity) || 0, parseInt(min_quantity) || 1, alertFlag, supplier_name || '', supplier_phone || '', itemPrice, notes || '', itemId]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete item
app.delete('/api/warehouse/items/:id', async (req, res) => {
    const itemId = req.params.id;
    try {
        await warehouseDb.execute({
            sql: "DELETE FROM inventory_items WHERE id = ?",
            args: [itemId]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Record Quick Inventory Action (Technician "לקחתי" / "החזרתי")
app.post('/api/warehouse/transaction', async (req, res) => {
    const { item_id, action_type, quantity_changed, worker_name } = req.body;

    if (!item_id || !action_type || !worker_name) {
        return res.status(400).json({ error: 'חסרים נתוני חובה לביצוע הפעולה' });
    }

    const changeAmount = Math.max(1, parseInt(quantity_changed) || 1);

    try {
        const itemRes = await warehouseDb.execute({
            sql: "SELECT * FROM inventory_items WHERE id = ?",
            args: [item_id]
        });
        if (itemRes.rows.length === 0) {
            return res.status(404).json({ error: 'פריט לא נמצא במחסן' });
        }

        const item = itemRes.rows[0];
        let newQuantity = Number(item.quantity);
        if (action_type === 'take') {
            if (item.quantity < changeAmount) {
                return res.status(400).json({ error: `במלאי יש רק ${item.quantity} יחידות. לא ניתן לקחת ${changeAmount}` });
            }
            newQuantity = item.quantity - changeAmount;
        } else if (action_type === 'add') {
            newQuantity = item.quantity + changeAmount;
        } else {
            return res.status(400).json({ error: 'סוג פעולה לא תקין' });
        }

        await warehouseDb.execute({
            sql: "UPDATE inventory_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            args: [newQuantity, item_id]
        });

        await warehouseDb.execute({
            sql: `INSERT INTO inventory_transactions 
                  (item_id, item_name, action_type, quantity_changed, quantity_after, worker_name) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [item_id, item.name, action_type, changeAmount, newQuantity, worker_name.trim()]
        });

        res.json({
            success: true,
            item_name: item.name,
            action_type: action_type,
            quantity_changed: changeAmount,
            new_quantity: newQuantity,
            shelf_location: item.shelf_location,
            worker_name: worker_name,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Audit Transactions Log
app.get('/api/warehouse/transactions', async (req, res) => {
    try {
        const result = await warehouseDb.execute("SELECT * FROM inventory_transactions ORDER BY id DESC LIMIT 100");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 Warehouse & Maintenance Server is running!`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);
    console.log(`=================================================`);
});
