require('dotenv').config({ path: '../.env' });
const { poolPromise } = require('../config/db');
const wmsService = require('../services/wmsService');

async function run() {
    try {
        const pool = await poolPromise;
        
        console.log('Testing executeDynamicSQL with cariKod filter...');
        const result = await wmsService.executeDynamicSQL(102, 10202, { cariKod: '320-01-U015' });
        console.log(`Results count for '320-01-U015': ${result.length}`);
        console.log(result.slice(0, 3));

        console.log('\nTesting executeDynamicSQL with empty filter (should show all)...');
        const allResult = await wmsService.executeDynamicSQL(102, 10202, {});
        console.log(`Results count total: ${allResult.length}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
