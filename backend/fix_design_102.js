const { poolPromise, sql } = require('./config/db');

async function run() {
    try {
        const pool = await poolPromise;
        console.log('Inserting Waybill fields for Screen 102...');

        // 1. Check and insert 10203 (İrsaliye Numarası)
        const check10203 = await pool.request()
            .input('scrid', sql.Int, 102)
            .input('compid', sql.Int, 10203)
            .query('SELECT COMPID FROM WMS_UIDesign WHERE SCRID = @scrid AND COMPID = @compid');

        if (check10203.recordset.length === 0) {
            await pool.request()
                .input('SCRID', sql.Int, 102)
                .input('COMPID', sql.Int, 10203)
                .input('LabelText', sql.NVarChar, 'İrsaliye Numarası')
                .input('ComponentType', sql.VarChar, 'TEXT')
                .input('DefaultValue', sql.NVarChar, '')
                .input('GuideDisplayType', sql.VarChar, 'CARD')
                .input('DataSourceSQL', sql.NVarChar, '')
                .input('MaxLength', sql.Int, 15)
                .input('SortOrder', sql.Int, 3)
                .input('IsVisible', sql.Bit, 1)
                .input('IsRequired', sql.Bit, 1)
                .input('GuideMappingJSON', sql.NVarChar, '[]')
                .input('SectionGroup', sql.VarChar, 'HEADER')
                .query(`
                    INSERT INTO WMS_UIDesign (SCRID, COMPID, LabelText, ComponentType, DefaultValue, GuideDisplayType, DataSourceSQL, MaxLength, SortOrder, IsVisible, IsRequired, GuideMappingJSON, SectionGroup)
                    VALUES (@SCRID, @COMPID, @LabelText, @ComponentType, @DefaultValue, @GuideDisplayType, @DataSourceSQL, @MaxLength, @SortOrder, @IsVisible, @IsRequired, @GuideMappingJSON, @SectionGroup)
                `);
            console.log('10203 İrsaliye Numarası inserted successfully.');
        } else {
            console.log('10203 İrsaliye Numarası already exists.');
        }

        // 2. Check and insert 10204 (İrsaliye Tarihi)
        const check10204 = await pool.request()
            .input('scrid', sql.Int, 102)
            .input('compid', sql.Int, 10204)
            .query('SELECT COMPID FROM WMS_UIDesign WHERE SCRID = @scrid AND COMPID = @compid');

        if (check10204.recordset.length === 0) {
            await pool.request()
                .input('SCRID', sql.Int, 102)
                .input('COMPID', sql.Int, 10204)
                .input('LabelText', sql.NVarChar, 'İrsaliye Tarihi')
                .input('ComponentType', sql.VarChar, 'DATE')
                .input('DefaultValue', sql.NVarChar, '')
                .input('GuideDisplayType', sql.VarChar, 'CARD')
                .input('DataSourceSQL', sql.NVarChar, '')
                .input('MaxLength', sql.Int, 50)
                .input('SortOrder', sql.Int, 4)
                .input('IsVisible', sql.Bit, 1)
                .input('IsRequired', sql.Bit, 1)
                .input('GuideMappingJSON', sql.NVarChar, '[]')
                .input('SectionGroup', sql.VarChar, 'HEADER')
                .query(`
                    INSERT INTO WMS_UIDesign (SCRID, COMPID, LabelText, ComponentType, DefaultValue, GuideDisplayType, DataSourceSQL, MaxLength, SortOrder, IsVisible, IsRequired, GuideMappingJSON, SectionGroup)
                    VALUES (@SCRID, @COMPID, @LabelText, @ComponentType, @DefaultValue, @GuideDisplayType, @DataSourceSQL, @MaxLength, @SortOrder, @IsVisible, @IsRequired, @GuideMappingJSON, @SectionGroup)
                `);
            console.log('10204 İrsaliye Tarihi inserted successfully.');
        } else {
            console.log('10204 İrsaliye Tarihi already exists.');
        }

        console.log('Database script ran successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Database migration failed:', err);
        process.exit(1);
    }
}

run();
