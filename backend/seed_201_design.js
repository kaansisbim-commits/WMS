const { poolPromise, sql } = require('./config/db');

async function run() {
    try {
        const pool = await poolPromise;
        
        const scrid = 201;

        // Helper to check and insert component
        const ensureComponent = async (compId, labelText, compType, dataSourceSql, sortOrder, sectionGroup) => {
            const check = await pool.request()
                .input('scrid', sql.Int, scrid)
                .input('compid', sql.Int, compId)
                .query('SELECT COMPID FROM WMS_UIDesign WHERE SCRID = @scrid AND COMPID = @compid');

            if (check.recordset.length === 0) {
                await pool.request()
                    .input('scrid', sql.Int, scrid)
                    .input('compid', sql.Int, compId)
                    .input('labelText', sql.NVarChar, labelText)
                    .input('compType', sql.VarChar, compType)
                    .input('dataSourceSql', sql.NVarChar, dataSourceSql)
                    .input('sortOrder', sql.Int, sortOrder)
                    .input('sectionGroup', sql.VarChar, sectionGroup)
                    .query(`
                        INSERT INTO WMS_UIDesign (SCRID, COMPID, LabelText, ComponentType, DefaultValue, GuideDisplayType, DataSourceSQL, MaxLength, SortOrder, IsVisible, IsRequired, GuideMappingJSON, SectionGroup)
                        VALUES (@scrid, @compid, @labelText, @compType, '', 'CARD', @dataSourceSql, 50, @sortOrder, 1, 1, '[]', @sectionGroup)
                    `);
                console.log(`Inserted Component #${compId} (${labelText}) successfully.`);
            } else {
                console.log(`Component #${compId} (${labelText}) already exists. Skipping.`);
            }
        };

        // 1. Kaynak Depo (20101)
        await ensureComponent(20101, 'Kaynak Depo', 'GUIDE', 'SELECT DEPO_KODU,DEPO_ISMI FROM CHEMINOX2024..TBLSTOKDP', 1, 'HEADER');

        // 2. Hedef Depo (20102)
        await ensureComponent(20102, 'Hedef Depo', 'GUIDE', 'SELECT DEPO_KODU,DEPO_ISMI FROM CHEMINOX2024..TBLSTOKDP', 2, 'HEADER');

        console.log('Seed completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Seed failed:', err);
        process.exit(1);
    }
}

run();
