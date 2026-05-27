const { poolPromise } = require('../config/db');

async function run() {
    try {
        const pool = await poolPromise;
        const res1 = await pool.request().query("UPDATE WMS_Users SET PasswordHash = '123' WHERE Username = 'admin'");
        console.log('Admin password reset result:', res1.rowsAffected);
        
        const res2 = await pool.request().query("UPDATE WMS_Users SET PasswordHash = '111' WHERE Username = 'Kaan'");
        console.log('Kaan password reset result:', res2.rowsAffected);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
