const { sql, poolPromise } = require('./config/db');

async function run() {
    try {
        const pool = await poolPromise;

        // 1. ADD COLUMN IF NOT EXISTS
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE Name = N'DisplayName' AND Object_ID = Object_ID(N'WMS_SystemParameters')
            )
            BEGIN
                ALTER TABLE WMS_SystemParameters ADD DisplayName NVARCHAR(100);
            END
        `);
        console.log('Column DisplayName checked/added.');

        // 2. FIX TYPO
        await pool.request().query(`
            UPDATE WMS_SystemParameters 
            SET ParamKey = 'IsProdDateTrackingActive' 
            WHERE ParamKey = 'NULLIsProdDateTrackingActive'
        `);
        console.log('Fixed NULLIsProdDateTrackingActive typo.');

        // 3. SET DISPLAY NAMES
        await pool.request().query(`
            UPDATE WMS_SystemParameters SET DisplayName = 'Lot Takibi' WHERE ParamKey = 'IsLotTrackingActive';
            UPDATE WMS_SystemParameters SET DisplayName = 'SKT (Son Kullanma Tarihi) Takibi' WHERE ParamKey = 'IsSKTTrackingActive';
            UPDATE WMS_SystemParameters SET DisplayName = 'Üretim Tarihi Takibi' WHERE ParamKey = 'IsProdDateTrackingActive';
            UPDATE WMS_SystemParameters SET DisplayName = 'Siparişe Bağlı Mal Kabul' WHERE ParamKey = 'SIPBAGMALKABUL';
        `);
        console.log('Updated DisplayNames.');

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
