require('dotenv').config({ path: '../.env' });
const { poolPromise } = require('../config/db');

async function run() {
    try {
        const pool = await poolPromise;
        
        // 1. Get some open orders
        const ordersQuery = `
            SELECT DISTINCT TOP 5 A.FATIRS_NO, CHEMINOX2024.dbo.TRK(B.CARI_ISIM) AS CARI_ISIM, A.CARI_KODU
            FROM CHEMINOX2024..TBLSIPAMAS A 
            LEFT OUTER JOIN CHEMINOX2024..TBLCASABIT B ON B.CARI_KOD=A.CARI_KODU
            LEFT OUTER JOIN CHEMINOX2024..TBLSIPATRA C ON C.FISNO=A.FATIRS_NO AND C.STHAR_TARIH=A.TARIH AND C.STHAR_ACIKLAMA=A.CARI_KODU
            WHERE A.FTIRSIP='7' AND A.UPDATE_KODU IS NULL AND A.FATKALEM_ADEDI>0 AND C.FIRMA_DOVTUT<C.STHAR_GCMIK AND C.STHAR_HTUR='H'
        `;
        const ordersResult = await pool.request().query(ordersQuery);
        console.log('--- Open Orders ---');
        console.log(ordersResult.recordset);

        if (ordersResult.recordset.length > 0) {
            const firstCariKodu = ordersResult.recordset[0].CARI_KODU;
            console.log(`\n--- Open Orders for Cari ${firstCariKodu} ---`);
            const cariOrders = await pool.request()
                .input('cari', firstCariKodu)
                .query(`
                    SELECT DISTINCT TOP 5 A.FATIRS_NO
                    FROM CHEMINOX2024..TBLSIPAMAS A 
                    LEFT OUTER JOIN CHEMINOX2024..TBLSIPATRA C ON C.FISNO=A.FATIRS_NO AND C.STHAR_TARIH=A.TARIH AND C.STHAR_ACIKLAMA=A.CARI_KODU
                    WHERE A.FTIRSIP='7' AND A.UPDATE_KODU IS NULL AND A.FATKALEM_ADEDI>0 AND C.FIRMA_DOVTUT<C.STHAR_GCMIK AND C.STHAR_HTUR='H'
                      AND A.CARI_KODU = @cari
                `);
            console.log(cariOrders.recordset);

            // Test getPurchaseOrderLines for these orders
            const orderIds = cariOrders.recordset.map(o => o.FATIRS_NO.trim());
            console.log(`\nTesting getPurchaseOrderLines for: ${orderIds.join(', ')}`);
            
            const wmsService = require('../services/wmsService');
            const lines = await wmsService.getPurchaseOrderLines(orderIds.join(','));
            console.log(`\nFetched lines count: ${lines.length}`);
            if (lines.length > 0) {
                console.log('First 3 lines sample:');
                console.log(lines.slice(0, 3));
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
