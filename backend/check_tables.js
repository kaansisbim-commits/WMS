const { sql, poolPromise } = require('./config/db');

async function check() {
    try {
        const pool = await poolPromise;
        const res1 = await pool.request().query("SELECT * FROM WMS_SerialTransactions");
        console.log("SerialTransactions:", res1.recordset);

        const res2 = await pool.request().query("SELECT * FROM WMS_StockBalances");
        console.log("StockBalances:", res2.recordset);
        
        const res3 = await pool.request().query("SELECT TOP 5 * FROM WMS_ReceiptLines ORDER BY LineID DESC");
        console.log("ReceiptLines:", res3.recordset);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
