-- =========================================================================
-- סקריפט הקמת מסד נתונים למערכת ניהול מחסן ומלאי - חברת פלדמן
-- תואם: Microsoft SQL Server 2016 / 2019 / 2022 / SQL Server Express
-- =========================================================================

-- 1. יצירת מסד הנתונים במידה ואינו קיים
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'FeldmanWarehouse')
BEGIN
    CREATE DATABASE [FeldmanWarehouse] COLLATE Hebrew_CI_AS;
    PRINT N'מסד הנתונים FeldmanWarehouse נוצר בהצלחה.';
END
GO

USE [FeldmanWarehouse];
GO

-- 2. יצירת טבלת פריטים במחסן (inventory_items)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[inventory_items]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[inventory_items] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [name] NVARCHAR(255) NOT NULL,
        [category] NVARCHAR(100) NOT NULL CONSTRAINT [DF_inventory_items_category] DEFAULT N'כללי',
        [shelf_location] NVARCHAR(50) NOT NULL,
        [quantity] INT NOT NULL CONSTRAINT [DF_inventory_items_quantity] DEFAULT 0,
        [min_quantity] INT NOT NULL CONSTRAINT [DF_inventory_items_min_qty] DEFAULT 1,
        [has_min_alert] BIT NOT NULL CONSTRAINT [DF_inventory_items_has_alert] DEFAULT 1,
        [supplier_name] NVARCHAR(255) NULL CONSTRAINT [DF_inventory_items_supplier_name] DEFAULT N'',
        [supplier_phone] NVARCHAR(50) NULL CONSTRAINT [DF_inventory_items_supplier_phone] DEFAULT N'',
        [price] DECIMAL(10,2) NOT NULL CONSTRAINT [DF_inventory_items_price] DEFAULT 0.00,
        [notes] NVARCHAR(MAX) NULL CONSTRAINT [DF_inventory_items_notes] DEFAULT N'',
        [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_inventory_items_updated_at] DEFAULT GETDATE(),
        CONSTRAINT [UQ_inventory_items_name] UNIQUE ([name])
    );
    PRINT N'טבלת inventory_items נוצרה בהצלחה.';
END
GO

-- 3. יצירת טבלת יומן תנועות מלאי (inventory_transactions)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[inventory_transactions]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[inventory_transactions] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [item_id] INT NOT NULL,
        [item_name] NVARCHAR(255) NOT NULL,
        [action_type] NVARCHAR(20) NOT NULL, -- 'take' או 'add'
        [quantity_changed] INT NOT NULL,
        [quantity_after] INT NOT NULL,
        [worker_name] NVARCHAR(255) NOT NULL,
        [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_inventory_transactions_created_at] DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX [IX_inventory_transactions_item_id] ON [dbo].[inventory_transactions] ([item_id]);
    CREATE NONCLUSTERED INDEX [IX_inventory_transactions_created_at] ON [dbo].[inventory_transactions] ([created_at] DESC);
    PRINT N'טבלת inventory_transactions נוצרה בהצלחה.';
END
GO

-- 4. יצירת טבלת עובדים וטכנאים (inventory_workers)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[inventory_workers]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[inventory_workers] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [full_name] NVARCHAR(255) NOT NULL,
        [role] NVARCHAR(50) NOT NULL CONSTRAINT [DF_inventory_workers_role] DEFAULT N'טכנאי',
        [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_inventory_workers_created_at] DEFAULT GETDATE(),
        CONSTRAINT [UQ_inventory_workers_name] UNIQUE ([full_name])
    );
    PRINT N'טבלת inventory_workers נוצרה בהצלחה.';
END
GO

-- 5. הזנת עובדים ראשוניים במידה והטבלה ריקה
IF NOT EXISTS (SELECT 1 FROM [dbo].[inventory_workers])
BEGIN
    INSERT INTO [dbo].[inventory_workers] ([full_name], [role])
    VALUES 
        (N'משה כהן', N'טכנאי'),
        (N'אבי לוי', N'טכנאי'),
        (N'דוד אברהם', N'טכנאי'),
        (N'חיים מזרחי', N'טכנאי'),
        (N'יוסי ביטון', N'טכנאי'),
        (N'רוני חדד', N'טכנאי'),
        (N'שלמה פרץ', N'טכנאי');
    PRINT N'עובדי ברירת מחדל הוזנו בהצלחה.';
END
GO

-- 6. הזנת פריטי דוגמה ראשוניים במידה והטבלה ריקה
IF NOT EXISTS (SELECT 1 FROM [dbo].[inventory_items])
BEGIN
    INSERT INTO [dbo].[inventory_items] 
        ([name], [category], [shelf_location], [quantity], [min_quantity], [has_min_alert], [supplier_name], [supplier_phone], [price], [notes])
    VALUES
        (N'מיסב כדורי 6204', N'מיסבים', N'1-1', 15, 5, 1, N'מ.ב. מיסבים', N'03-5551234', 45.00, N'מיסב סטנדרטי למנועי מסוע'),
        (N'מיסב כדורי 6308 2RS', N'מיסבים', N'1-2', 2, 4, 1, N'מ.ב. מיסבים', N'03-5551234', 120.00, N'אטום מגומי דו-צדדי'),
        (N'מיסב קוני 32210', N'מיסבים', N'1-4', 8, 3, 1, N'טכנו-מיסב', N'04-8889900', 85.00, N'מיועד לעומס צירי כבד'),
        (N'גלגל שיניים ישר Z-24 M2', N'גלגלי שיניים', N'3-1', 6, 2, 1, N'גלגלי דרום', N'08-6771122', 210.00, N'מודול 2, 24 שיניים'),
        (N'גלגל שיניים חלזוני 1:30', N'גלגלי שיניים', N'3-3', 1, 2, 1, N'גלגלי דרום', N'08-6771122', 450.00, N'תמסורת חלזון יחס 1 ל-30'),
        (N'מנוע חשמלי 1.5HP 1400RPM', N'מנועים', N'5-1', 3, 1, 1, N'חשמל ומנועי שמש', N'09-7443322', 1100.00, N'חיבור פלאנג B5'),
        (N'מנוע תלת פאזי 5.5KW', N'מנועים', N'5-2', 0, 1, 1, N'חשמל ומנועי שמש', N'09-7443322', 2400.00, N'מנוע ראשי קו ייצור - חסר במלאי!'),
        (N'רצועת הנעה B52', N'כללי', N'8-1', 12, 5, 1, N'רצועות וגומצי', N'03-9008877', 35.00, N'פרופיל B אורך 52 אינץ'),
        (N'מחזיר שמן 35x52x7', N'כללי', N'10-2', 25, 10, 1, N'אטמים מרכזי', N'03-9221144', 18.00, N'גומי NBR שפתיים כפולות');
    PRINT N'חלפים ראשוניים הוזנו בהצלחה.';
END
GO

PRINT N'הקמת מסד הנתונים FeldmanWarehouse הושלמה בהצלחה!';
GO
