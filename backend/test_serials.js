const { sql, poolPromise } = require('./config/db');

async function test() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM WMS_SerialTransactions');
        console.dir(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}
test();
