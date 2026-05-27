const { sql, poolPromise } = require('./config/db');

async function test() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT TOP 1 * FROM WMS_ReceiptLines');
        console.dir(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}
test();
