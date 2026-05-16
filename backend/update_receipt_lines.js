const { sql, poolPromise } = require('./config/db');

async function run() {
    try {
        const pool = await poolPromise;
        
        // Rename RawLineJSON to DynamicFieldsJSON
        await pool.request().query(`
            IF EXISTS (
                SELECT * FROM sys.columns 
                WHERE Name = N'RawLineJSON' AND Object_ID = Object_ID(N'WMS_ReceiptLines')
            )
            BEGIN
                EXEC sp_rename 'WMS_ReceiptLines.RawLineJSON', 'DynamicFieldsJSON', 'COLUMN';
            END
        `);
        console.log('Renamed RawLineJSON to DynamicFieldsJSON.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
