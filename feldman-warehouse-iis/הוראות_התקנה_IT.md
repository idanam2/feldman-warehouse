# מדריך התקנה והטמעה בשרתי החברה (IIS & SQL Server Express)
**מערכת ניהול מחסן ומלאי - חברת פלדמן**

מדריך זה מיועד לאיש הסיסטם / IT לצורך העלאת המערכת לרשת הפנימית של החברה.  
הפרויקט בנוי ב-Node.js Express ומתחבר למסד נתונים Microsoft SQL Server Express ומנוהל דרך שרת ה-IIS.

---

## 📁 מבנה התיקייה

```
feldman-warehouse-iis/
├── public/
│   └── index.html          # ממשק המשתמש (HTML5/Tailwind/JS בעברית מלאה)
├── db.js                   # מודול התחברות ל-SQL Server (mssql pool)
├── server.js               # שרת ה-API והאפליקציה (Express)
├── schema_sqlexpress.sql   # סקריפט הקמת מסד הנתונים והטבלאות ב-SSMS
├── web.config              # קובץ הגדרות מוכן ל-IIS
├── package.json            # הגדרות תלויות של Node.js
├── .env.example            # דוגמה לקובץ הגדרות חיבור
├── .env                    # קובץ הגדרות פעיל (יש לערוך פרטי חיבור)
├── START_SERVER.bat        # קובץ בדיקה מהירה מקומית
└── הוראות_התקנה_IT.md      # מסמך זה
```

---

## 🛠️ דרישות קדם בשרת

1. **Node.js**: גרסה 18 ומעלה מותקנת בשרת ([להורדה](https://nodejs.org/)).
2. **Microsoft SQL Server Express**: גרסה 2016 ומעלה עם SQL Server Management Studio (SSMS).
3. **IIS (Internet Information Services)** מותקן עם:
   - הרחבת **URL Rewrite Module 2.1** ([להורדה ממיקרוסופט](https://www.iis.net/downloads/microsoft/url-rewrite)).
   - הרחבת **Application Request Routing (ARR) 3.0** ([להורדה ממיקרוסופט](https://www.iis.net/downloads/microsoft/application-request-routing)).

---

## 🚀 שלבי ההתקנה (צעד אחר צעד)

### שלב 1: הקמת מסד הנתונים ב-SQL Server Express

1. פתח את **SQL Server Management Studio (SSMS)** והתחבר למופע ה-`SQLEXPRESS`.
2. פתח את הקובץ: **`schema_sqlexpress.sql`** שנמצא בתיקייה זו.
3. לחץ על **Execute (F5)**.
4. הסקריפט יבצע באופן אוטומטי:
   - יצירת מסד נתונים חדש בשם `FeldmanWarehouse`.
   - יצירת הטבלאות:
     - `inventory_items` (פריטי המחסן, מיקומי מדפים, ספקים, מחירים, התראות מינימום).
     - `inventory_transactions` (יומן תנועות מלאי ומעקב עובדים).
     - `inventory_workers` (רשימת העובדים והטכנאים).
   - הזנת נתוני ברירת מחדל וחלפים ראשוניים (מיסבים, גלגלי שיניים, מנועים).

---

### שלב 2: הגדרת פרטי החיבור בקובץ `.env`

פתח את הקובץ **`.env`** והזן את פרטי השרת שלך:

```ini
PORT=3000
DB_SERVER=localhost\SQLEXPRESS
DB_NAME=FeldmanWarehouse

# אפשרות מומלצת: משתמש SQL ייעודי או sa
DB_USER=sa
DB_PASSWORD=YourStrongPassword123

# האם החיבור מוצפן ב-SSL (לרוב false בשרת מקומי פנימי)
DB_ENCRYPT=false
```

> **הערה לגבי הזדהות Windows:**  
> אם ברצונך להשתמש ב-Windows Authentication במקום משתמש SQL:  
> השאר את `DB_USER` ו-`DB_PASSWORD` ריקים (`DB_USER=` ו-`DB_PASSWORD=`), וודא שלחשבון המריץ את השירות יש הרשאות `db_datareader` ו-`db_datawriter` על `FeldmanWarehouse`.

---

### שלב 3: התקנת התלויות (npm install)

פתח חלון Command Prompt / PowerShell בתיקייה זו והרץ:

```bash
npm install
```

הפקודה תתקין את הספריות הנדרשות (`express`, `mssql`, `cors`, `dotenv`).

---

### שלב 4: בדיקה ראשונית מהירה

הרץ את קובץ הבדיקה:
```bash
START_SERVER.bat
```
ייפתח חלון דפדפן בכתובת `http://localhost:3000`.  
אם האתר עולה והחלפים מופיעים – החיבור ל-SQL Server תקין ב-100%! כעת ניתן לסגור את החלון ולעבור להגדרת ה-IIS.

---

### שלב 5: הגדרת האתר ב-IIS

השיטה המומלצת והתקנית ביותר בארגונים היא **IIS Reverse Proxy**:

#### א. הפעלת מודול הפרוקסי ב-IIS (ARR):
1. פתח את **IIS Manager**.
2. בלוח הראשי של השרת, לחץ פעמיים על **Application Request Routing Cache**.
3. בתפריט הימני לחץ על **Server Proxy Settings**.
4. סמן ב-V את **Enable proxy** ולחץ **Apply**.

#### ב. הגדרת האתר ב-IIS:
1. ב-IIS Manager, לחץ קליק ימני על **Sites** 👈 **Add Website**.
2. **Site name**: `FeldmanWarehouse`
3. **Physical path**: בחר את הנתיב המלא של תיקייה זו (למשל: `C:\inetpub\wwwroot\feldman-warehouse-iis`).
4. **Port**: 80 (או פורט פנימי מבוקש בארגון).
5. **Host name**: שם ה-DNS הפנימי (למשל: `warehouse.feldman.local` או השאר ריק לגישה לפי IP).
6. לחץ **OK**. קובץ ה-`web.config` המוכן בתיקייה ינתב אוטומטית את התנועה לאפליקציה.

#### ג. הרצת אפליקציית ה-Node.js כשירות Windows (Service):
כדי שהאתר ירוץ ברקע לתמיד (גם כשאף משתמש אינו מחובר לשרת וכשהשרת מופעל מחדש):
מומלץ להשתמש ב-**NSSM** (Non-Sucking Service Manager) או **PM2-Windows**:

**באמצעות NSSM (פשוט ומומלץ):**
1. הורד את `nssm.exe` ([מכאן](https://nssm.cc/download)).
2. הרץ בטרמינל כמנהל:
   ```cmd
   nssm install FeldmanWarehouseService "C:\Program Files\nodejs\node.exe" "C:\inetpub\wwwroot\feldman-warehouse-iis\server.js"
   nssm set FeldmanWarehouseService AppDirectory "C:\inetpub\wwwroot\feldman-warehouse-iis"
   nssm start FeldmanWarehouseService
   ```

---

## 🔍 בדיקת תקינות (Health Check)

ניתן לבצע פנייה לכתובת:
`http://localhost:3000/api/health` (או דרך כתובת ה-IIS שהוגדרה).

מענה תקין יחזיר:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-09-18T..."
}
```

---

## 📞 תמיכה ושאלות טכניות
המערכת מותאמת באופן מלא לכל דפדפני המחשב והסלולר, תומכת בעברית (RTL), מבצעת בדיקות שלמות נתונים בעת פעולות משיכה/החזרה, ושומרת יומן תנועות מלא (Audit Trail).
