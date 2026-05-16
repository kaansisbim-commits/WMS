const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request()
            .query("UPDATE WMS_SystemParameters SET ParamKey = 'IsProdDateTrackingActive' WHERE ParamKey = 'NULLIsProdDateTrackingActive'");
        console.log('Rows affected:', result.rowsAffected);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
