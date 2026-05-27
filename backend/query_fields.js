const { poolPromise } = require('./config/db');

async function run() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM WMS_UIDesign');
        console.log('--- WMS_UIDesign Table ---');
        console.dir(result.recordset, { depth: null });
        
        const params = await pool.request().query('SELECT * FROM WMS_SystemParameters');
        console.log('--- WMS_SystemParameters Table ---');
        console.dir(params.recordset, { depth: null });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
