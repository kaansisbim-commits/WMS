const { poolPromise, sql } = require('./config/db');

async function run() {
    try {
        const pool = await poolPromise;
        console.log('Starting dynamic fields migration for Screen 102...');

        // Fetch active tracking parameters
        const paramReq = await pool.request()
            .query("SELECT ParamKey, ParamValue FROM WMS_SystemParameters WHERE ParamKey IN ('LOKASYONTAKIBI', 'IsProdDateTrackingActive', 'IsSKTTrackingActive', 'IsLotTrackingActive')");
        const params = paramReq.recordset;

        const isLocationActive = params.find(p => p.ParamKey === 'LOKASYONTAKIBI')?.ParamValue == 1;
        const isProdDateActive = params.find(p => p.ParamKey === 'IsProdDateTrackingActive')?.ParamValue == 1;
        const isSktActive = params.find(p => p.ParamKey === 'IsSKTTrackingActive')?.ParamValue == 1;
        const isLotActive = params.find(p => p.ParamKey === 'IsLotTrackingActive')?.ParamValue == 1;

        console.log('Current System Parameter States:');
        console.log(`- LOKASYONTAKIBI (Depo Kodu): ${isLocationActive}`);
        console.log(`- IsProdDateTrackingActive (Üretim Tarihi): ${isProdDateActive}`);
        console.log(`- IsSKTTrackingActive (SKT): ${isSktActive}`);
        console.log(`- IsLotTrackingActive (Lot No): ${isLotActive}`);

        // Helper to check and insert component
        const ensureComponent = async (compId, labelText, compType, dataSourceSql, sortOrder, isActive) => {
            const check = await pool.request()
                .input('scrid', sql.Int, 102)
                .input('compid', sql.Int, compId)
                .query('SELECT COMPID FROM WMS_UIDesign WHERE SCRID = @scrid AND COMPID = @compid');

            if (check.recordset.length === 0) {
                if (isActive) {
                    await pool.request()
                        .input('scrid', sql.Int, 102)
                        .input('compid', sql.Int, compId)
                        .input('labelText', sql.NVarChar, labelText)
                        .input('compType', sql.VarChar, compType)
                        .input('dataSourceSql', sql.NVarChar, dataSourceSql)
                        .input('sortOrder', sql.Int, sortOrder)
                        .query(`
                            INSERT INTO WMS_UIDesign (SCRID, COMPID, LabelText, ComponentType, DefaultValue, GuideDisplayType, DataSourceSQL, MaxLength, SortOrder, IsVisible, IsRequired, GuideMappingJSON, SectionGroup)
                            VALUES (@scrid, @compid, @labelText, @compType, '', 'CARD', @dataSourceSql, 50, @sortOrder, 1, 1, '[]', 'LINE')
                        `);
                    console.log(`Inserted Component #${compId} (${labelText}) successfully.`);
                } else {
                    console.log(`Component #${compId} (${labelText}) does not exist, but parameter is inactive. Skipping.`);
                }
            } else {
                // If it already exists, update its visibility based on current parameter status
                await pool.request()
                    .input('scrid', sql.Int, 102)
                    .input('compid', sql.Int, compId)
                    .input('isVisible', sql.Bit, isActive ? 1 : 0)
                    .input('isRequired', sql.Bit, isActive ? 1 : 0)
                    .query('UPDATE WMS_UIDesign SET IsVisible = @isVisible, IsRequired = @isRequired WHERE SCRID = @scrid AND COMPID = @compid');
                console.log(`Updated Component #${compId} (${labelText}) status to: visible=${isActive}, required=${isActive}.`);
            }
        };

        // 1. Depo Kodu (10296)
        await ensureComponent(10296, 'Depo Kodu', 'GUIDE', 'SELECT DEPO_KODU,DEPO_ISMI FROM CHEMINOX2024..TBLSTOKDP', 13, isLocationActive);

        // 2. Üretim Tarihi (10297)
        await ensureComponent(10297, 'Üretim Tarihi', 'DATE', '', 12, isProdDateActive);

        // 3. SKT (10298)
        await ensureComponent(10298, 'SKT', 'DATE', '', 11, isSktActive);

        // 4. Lot No (10299)
        await ensureComponent(10299, 'Lot No', 'TEXT', '', 10, isLotActive);

        console.log('Dynamic fields migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
