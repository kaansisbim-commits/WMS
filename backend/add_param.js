const { poolPromise, sql } = require('./config/db');

async function addParameter() {
    try {
        const pool = await poolPromise;
        const check = await pool.request()
            .input('key', sql.VarChar, 'MALKABULONAY')
            .query("SELECT * FROM WMS_SystemParameters WHERE ParamKey = @key");

        if (check.recordset.length === 0) {
            await pool.request()
                .input('key', sql.VarChar, 'MALKABULONAY')
                .input('val', sql.Bit, 0)
                .input('desc', sql.NVarChar, 'Mal Kabul (101 ve 102) onay mekanizması aktif/pasif kontrolü')
                .input('disp', sql.NVarChar, 'Mal Kabul Onay Sistemi')
                .query(`
                    INSERT INTO WMS_SystemParameters (ParamKey, ParamValue, Description, DisplayName)
                    VALUES (@key, @val, @desc, @disp)
                `);
            console.log("MALKABULONAY parametresi eklendi.");
        } else {
            console.log("MALKABULONAY parametresi zaten mevcut.");
        }
    } catch (err) {
        console.error("Hata:", err);
    } finally {
        process.exit(0);
    }
}

addParameter();
