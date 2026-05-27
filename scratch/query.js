const { poolPromise, sql } = require('../backend/config/db');

async function run() {
    try {
        const pool = await poolPromise;
        const res = await pool.request().query("SELECT TOP 5 StokKodu, SeriNo, LotNo, DepoKodu, KalanMiktar FROM WMS_StockBalances WHERE StokKodu = '10002861'");
        console.log(res.recordset);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
