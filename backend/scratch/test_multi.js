require('dotenv').config({ path: '../.env' });
const { poolPromise } = require('../config/db');
const wmsService = require('../services/wmsService');

async function run() {
    try {
        const pool = await poolPromise;
        
        const orderIds = ['T00000000000004', 'T00000000000005'];
        console.log(`Testing getPurchaseOrderLines for: ${orderIds.join(', ')}`);
        
        const lines = await wmsService.getPurchaseOrderLines(orderIds.join(','));
        console.log(`Fetched lines count: ${lines.length}`);
        if (lines.length > 0) {
            console.log('Sample lines:');
            console.log(lines.slice(0, 5));
        } else {
            // Let's query TBLSIPATRA directly to see what FISNO values exist for these orders!
            console.log('\nQuerying TBLSIPATRA directly for these FISNOs...');
            const direct = await pool.request().query(`
                SELECT TOP 5 FISNO, STOK_KODU, STHAR_ACIKLAMA
                FROM CHEMINOX2024..TBLSIPATRA
                WHERE FISNO LIKE 'T%'
            `);
            console.log('Sample TBLSIPATRA rows:', direct.recordset);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
