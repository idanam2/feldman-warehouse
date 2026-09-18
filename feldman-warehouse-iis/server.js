const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const { query } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Health Check API
app.get('/api/health', async (req, res) => {
    try {
        await query("SELECT 1 AS health_check");
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'error', database: err.message });
    }
});

// ==================== WAREHOUSE ROUTES (ניהול מחסן ומלאי) ====================

// 1. Get all workers
app.get('/api/warehouse/workers', async (req, res) => {
    try {
        const result = await query("SELECT id, full_name, role, created_at FROM inventory_workers ORDER BY full_name ASC");
        res.json(result.recordset);
    } catch (err) {
        console.error("Error fetching workers:", err);
        res.status(500).json({ error: 'שגיאה בשליפת רשימת העובדים' });
    }
});

// 2. Add new worker
app.post('/api/warehouse/workers', async (req, res) => {
    const { full_name } = req.body;
    if (!full_name || !full_name.trim()) {
        return res.status(400).json({ error: 'שם עובד הוא שדה חובה' });
    }
    try {
        const result = await query(
            "INSERT INTO inventory_workers (full_name) VALUES (@full_name); SELECT SCOPE_IDENTITY() AS id;",
            { full_name: full_name.trim() }
        );
        res.json({ success: true, id: result.recordset[0].id, full_name: full_name.trim() });
    } catch (err) {
        console.error("Error adding worker:", err);
        res.status(400).json({ error: 'עובד בשם זה כבר קיים במערכת' });
    }
});

// 3. Edit worker name
app.put('/api/warehouse/workers/:id', async (req, res) => {
    const workerId = parseInt(req.params.id, 10);
    const { full_name } = req.body;
    if (!full_name || !full_name.trim()) {
        return res.status(400).json({ error: 'שם עובד הוא שדה חובה' });
    }
    try {
        await query(
            "UPDATE inventory_workers SET full_name = @full_name WHERE id = @id",
            { full_name: full_name.trim(), id: workerId }
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Error editing worker:", err);
        res.status(400).json({ error: 'שגיאה בעדכון שם העובד' });
    }
});

// 4. Delete worker
app.delete('/api/warehouse/workers/:id', async (req, res) => {
    const workerId = parseInt(req.params.id, 10);
    try {
        await query("DELETE FROM inventory_workers WHERE id = @id", { id: workerId });
        res.json({ success: true });
    } catch (err) {
        console.error("Error deleting worker:", err);
        res.status(500).json({ error: 'שגיאה במחיקת העובד' });
    }
});

// 5. Get inventory items (Sorted physically from shelf 1-1 up to 13-4)
app.get('/api/warehouse/items', async (req, res) => {
    const { search, shelf } = req.query;
    let sqlText = "SELECT * FROM inventory_items WHERE 1=1";
    const params = {};

    if (search) {
        sqlText += " AND (name LIKE @term OR category LIKE @term OR supplier_name LIKE @term OR shelf_location LIKE @term)";
        params.term = `%${search}%`;
    }

    if (shelf) {
        sqlText += " AND shelf_location = @shelf";
        params.shelf = shelf;
    }

    // Natural sort: Shelf number (1..13), then shelf floor/level (1..4), then name
    sqlText += ` ORDER BY 
        CASE 
            WHEN CHARINDEX('-', shelf_location) > 0 
            THEN TRY_CAST(SUBSTRING(shelf_location, 1, CHARINDEX('-', shelf_location) - 1) AS INT) 
            ELSE 999 
        END ASC,
        CASE 
            WHEN CHARINDEX('-', shelf_location) > 0 
            THEN TRY_CAST(SUBSTRING(shelf_location, CHARINDEX('-', shelf_location) + 1, LEN(shelf_location)) AS INT) 
            ELSE 999 
        END ASC,
        name ASC`;

    try {
        const result = await query(sqlText, params);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error fetching items:", err);
        res.status(500).json({ error: 'שגיאה בשליפת פריטי המחסן' });
    }
});

// 6. Get low stock items (Only for items with has_min_alert = 1)
app.get('/api/warehouse/low-stock', async (req, res) => {
    try {
        const result = await query(
            "SELECT * FROM inventory_items WHERE has_min_alert = 1 AND quantity <= min_quantity ORDER BY quantity ASC, name ASC"
        );
        res.json(result.recordset);
    } catch (err) {
        console.error("Error fetching low stock:", err);
        res.status(500).json({ error: 'שגיאה בשליפת פריטים במלאי נמוך' });
    }
});

// 7. Add new inventory item
app.post('/api/warehouse/items', async (req, res) => {
    const { name, category, shelf_location, quantity, min_quantity, has_min_alert, supplier_name, supplier_phone, price, notes } = req.body;

    if (!name || !shelf_location) {
        return res.status(400).json({ error: 'שם פריט ומיקום מדף הם שדות חובה' });
    }

    const initQty = parseInt(quantity, 10) || 0;
    const minQty = parseInt(min_quantity, 10) || 1;
    const alertFlag = (has_min_alert === false || has_min_alert === 0 || has_min_alert === '0') ? 0 : 1;
    const itemPrice = parseFloat(price) || 0;

    try {
        const insertItemSql = `
            INSERT INTO inventory_items 
            (name, category, shelf_location, quantity, min_quantity, has_min_alert, supplier_name, supplier_phone, price, notes)
            VALUES 
            (@name, @category, @shelf_location, @quantity, @min_quantity, @has_min_alert, @supplier_name, @supplier_phone, @price, @notes);
            SELECT SCOPE_IDENTITY() AS id;
        `;

        const result = await query(insertItemSql, {
            name: name.trim(),
            category: category || 'כללי',
            shelf_location: shelf_location.trim(),
            quantity: initQty,
            min_quantity: minQty,
            has_min_alert: alertFlag,
            supplier_name: supplier_name ? supplier_name.trim() : '',
            supplier_phone: supplier_phone ? supplier_phone.trim() : '',
            price: itemPrice,
            notes: notes ? notes.trim() : ''
        });

        const newItemId = result.recordset[0].id;

        // If starting with quantity > 0, log transaction
        if (initQty > 0) {
            await query(
                `INSERT INTO inventory_transactions 
                (item_id, item_name, action_type, quantity_changed, quantity_after, worker_name)
                VALUES 
                (@item_id, @item_name, 'add', @qty, @qty, N'מנהל מחסן (הוספת פריט חדש)')`,
                {
                    item_id: newItemId,
                    item_name: name.trim(),
                    qty: initQty
                }
            );
        }

        res.json({ success: true, id: newItemId });
    } catch (err) {
        console.error("Error adding item:", err);
        res.status(400).json({ error: 'קיים כבר פריט בשם זה במחסן או שגיאת נתונים' });
    }
});

// 8. Edit existing item
app.put('/api/warehouse/items/:id', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    const { name, category, shelf_location, quantity, min_quantity, has_min_alert, supplier_name, supplier_phone, price, notes } = req.body;

    const alertFlag = (has_min_alert === false || has_min_alert === 0 || has_min_alert === '0') ? 0 : 1;
    const itemPrice = parseFloat(price) || 0;

    try {
        await query(
            `UPDATE inventory_items 
            SET name = @name,
                category = @category,
                shelf_location = @shelf_location,
                quantity = @quantity,
                min_quantity = @min_quantity,
                has_min_alert = @has_min_alert,
                supplier_name = @supplier_name,
                supplier_phone = @supplier_phone,
                price = @price,
                notes = @notes,
                updated_at = GETDATE()
            WHERE id = @id`,
            {
                name: name.trim(),
                category: category || 'כללי',
                shelf_location: shelf_location.trim(),
                quantity: parseInt(quantity, 10) || 0,
                min_quantity: parseInt(min_quantity, 10) || 1,
                has_min_alert: alertFlag,
                supplier_name: supplier_name ? supplier_name.trim() : '',
                supplier_phone: supplier_phone ? supplier_phone.trim() : '',
                price: itemPrice,
                notes: notes ? notes.trim() : '',
                id: itemId
            }
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Error editing item:", err);
        res.status(500).json({ error: 'שגיאה בעדכון פרטי הפריט' });
    }
});

// 9. Delete item
app.delete('/api/warehouse/items/:id', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    try {
        await query("DELETE FROM inventory_items WHERE id = @id", { id: itemId });
        res.json({ success: true });
    } catch (err) {
        console.error("Error deleting item:", err);
        res.status(500).json({ error: 'שגיאה במחיקת הפריט מהמחסן' });
    }
});

// 10. Record Quick Action (Technician "לקחתי" / "החזרתי")
app.post('/api/warehouse/transaction', async (req, res) => {
    const { item_id, action_type, quantity_changed, worker_name } = req.body;

    if (!item_id || !action_type || !worker_name) {
        return res.status(400).json({ error: 'חסרים נתוני חובה לביצוע הפעולה' });
    }

    const itemId = parseInt(item_id, 10);
    const changeAmount = Math.max(1, parseInt(quantity_changed, 10) || 1);

    try {
        const itemResult = await query("SELECT id, name, shelf_location, quantity FROM inventory_items WHERE id = @id", { id: itemId });
        if (itemResult.recordset.length === 0) {
            return res.status(404).json({ error: 'פריט לא נמצא במחסן' });
        }

        const item = itemResult.recordset[0];
        let newQuantity = item.quantity;

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

        // Update item quantity
        await query(
            "UPDATE inventory_items SET quantity = @quantity, updated_at = GETDATE() WHERE id = @id",
            { quantity: newQuantity, id: itemId }
        );

        // Record audit transaction
        await query(
            `INSERT INTO inventory_transactions 
            (item_id, item_name, action_type, quantity_changed, quantity_after, worker_name)
            VALUES 
            (@item_id, @item_name, @action_type, @change_amount, @new_qty, @worker_name)`,
            {
                item_id: itemId,
                item_name: item.name,
                action_type: action_type,
                change_amount: changeAmount,
                new_qty: newQuantity,
                worker_name: worker_name.trim()
            }
        );

        res.json({
            success: true,
            item_name: item.name,
            action_type: action_type,
            quantity_changed: changeAmount,
            new_quantity: newQuantity,
            shelf_location: item.shelf_location,
            worker_name: worker_name.trim(),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error("Error executing transaction:", err);
        res.status(500).json({ error: 'שגיאה בעדכון הפעולה במערכת' });
    }
});

// 11. Get Audit Transactions Log
app.get('/api/warehouse/transactions', async (req, res) => {
    try {
        const result = await query("SELECT TOP 100 * FROM inventory_transactions ORDER BY id DESC");
        res.json(result.recordset);
    } catch (err) {
        console.error("Error fetching transactions:", err);
        res.status(500).json({ error: 'שגיאה בשליפת יומן התנועות' });
    }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 Feldman Warehouse Server is running!`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`🗄️ Database: SQL Server Express`);
    console.log(`=================================================`);
});
