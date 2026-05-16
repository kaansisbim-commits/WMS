const { poolPromise, sql } = require('../config/db');

/**
 * WMS Service
 * Handles all MSSQL operations and business logic for WMS
 */
class WMSService {
    
    async getUIDesign(scrid) {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('scrid', sql.Int, parseInt(scrid))
            .query('SELECT * FROM WMS_UIDesign WHERE SCRID = @scrid ORDER BY SortOrder');
        return result.recordset;
    }

    async saveUIDesign(scrid, fields) {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const request = new sql.Request(transaction);
            await request.input('scrid', sql.Int, parseInt(scrid))
                .query('DELETE FROM WMS_UIDesign WHERE SCRID = @scrid');

            for (const field of fields) {
                const insertReq = new sql.Request(transaction);
                await insertReq
                    .input('SCRID', sql.Int, parseInt(scrid))
                    .input('COMPID', sql.Int, parseInt(field.COMPID))
                    .input('LabelText', sql.NVarChar, field.LabelText)
                    .input('ComponentType', sql.VarChar, field.ComponentType || 'TEXT')
                    .input('DefaultValue', sql.NVarChar, field.DefaultValue || '')
                    .input('GuideDisplayType', sql.VarChar, field.GuideDisplayType || 'CARD')
                    .input('DataSourceSQL', sql.NVarChar, field.DataSourceSQL || '')
                    .input('MaxLength', sql.Int, parseInt(field.MaxLength) || 0)
                    .input('SortOrder', sql.Int, field.SortOrder)
                    .input('IsVisible', sql.Bit, field.IsVisible ? 1 : 0)
                    .input('IsRequired', sql.Bit, field.IsRequired ? 1 : 0)
                    .input('GuideMappingJSON', sql.NVarChar, field.GuideMappingJSON ? JSON.stringify(field.GuideMappingJSON) : '')
                    .input('SectionGroup', sql.VarChar, field.SectionGroup || 'HEADER')
                    .query(`
                        INSERT INTO WMS_UIDesign (
                            SCRID, COMPID, LabelText, ComponentType, 
                            DefaultValue, GuideDisplayType, DataSourceSQL, 
                            MaxLength, SortOrder, IsVisible, IsRequired,
                            GuideMappingJSON, SectionGroup
                        )
                        VALUES (
                            @SCRID, @COMPID, @LabelText, @ComponentType, 
                            @DefaultValue, @GuideDisplayType, @DataSourceSQL, 
                            @MaxLength, @SortOrder, @IsVisible, @IsRequired,
                            @GuideMappingJSON, @SectionGroup
                        )
                    `);
            }
            await transaction.commit();
            return true;
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }

    async deleteUIDesignComponent(scrid, compid) {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('SCRID', sql.Int, parseInt(scrid))
            .input('COMPID', sql.Int, parseInt(compid))
            .query('DELETE FROM WMS_UIDesign WHERE SCRID = @SCRID AND COMPID = @COMPID');
        return result.rowsAffected[0] > 0;
    }

    async getSystemParameters() {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT ParamKey, ParamValue, Description, DisplayName FROM WMS_SystemParameters');
        return result.recordset.map(row => ({
            key: row.ParamKey,
            value: row.ParamValue == 1 || row.ParamValue === true,
            description: row.Description,
            displayName: row.DisplayName
        }));
    }

    async updateParameters(paramsArray) {
        const pool = await poolPromise;
        for (const param of paramsArray) {
            await pool.request()
                .input('key', sql.VarChar, param.key)
                .input('val', sql.Bit, param.value ? 1 : 0)
                .query('UPDATE WMS_SystemParameters SET ParamValue = @val WHERE ParamKey = @key');

            // Business logic for dynamic UI triggers
            await this._handleUIDynamicTriggers(pool, param.key, param.value);
        }
        return true;
    }

    async _handleUIDynamicTriggers(pool, key, value) {
        const dynamicFieldsConfig = {
            'IsLotTrackingActive': { compId: 10199, labelText: 'Lot No', type: 'TEXT' },
            'IsSKTTrackingActive': { compId: 10198, labelText: 'SKT', type: 'DATE' },
            'IsProdDateTrackingActive': { compId: 10197, labelText: 'Üretim Tarihi', type: 'DATE' }
        };

        if (dynamicFieldsConfig[key]) {
            const config = dynamicFieldsConfig[key];
            const isActive = value ? 1 : 0;
            const scrid = 101;

            const checkField = await pool.request()
                .input('scrid', sql.Int, scrid)
                .input('compid', sql.Int, config.compId)
                .query('SELECT COMPID FROM WMS_UIDesign WHERE SCRID = @scrid AND COMPID = @compid');

            if (checkField.recordset.length > 0) {
                await pool.request()
                    .input('scrid', sql.Int, scrid)
                    .input('compid', sql.Int, config.compId)
                    .input('isVisible', sql.Bit, isActive)
                    .input('isRequired', sql.Bit, isActive)
                    .query('UPDATE WMS_UIDesign SET IsVisible = @isVisible, IsRequired = @isRequired WHERE SCRID = @scrid AND COMPID = @compid');
            } else if (isActive) {
                const maxSortResult = await pool.request()
                    .input('scrid', sql.Int, scrid)
                    .query("SELECT ISNULL(MAX(SortOrder), 0) as MaxSort FROM WMS_UIDesign WHERE SCRID = @scrid AND SectionGroup = 'LINE'");
                const newSortOrder = maxSortResult.recordset[0].MaxSort + 1;

                await pool.request()
                    .input('scrid', sql.Int, scrid)
                    .input('compid', sql.Int, config.compId)
                    .input('labelText', sql.NVarChar, config.labelText)
                    .input('compType', sql.VarChar, config.type)
                    .input('sortOrder', sql.Int, newSortOrder)
                    .query(`
                        INSERT INTO WMS_UIDesign (SCRID, COMPID, LabelText, ComponentType, DefaultValue, GuideDisplayType, DataSourceSQL, MaxLength, SortOrder, IsVisible, IsRequired, GuideMappingJSON, SectionGroup)
                        VALUES (@scrid, @compid, @labelText, @compType, '', 'CARD', '', 50, @sortOrder, 1, 1, '[]', 'LINE')
                    `);
            }
        }
    }

    async saveReceipt(payload, draftId, createdBy) {
        const pool = await poolPromise;
        
        // Dynamic field mapping
        const designReq = await pool.request().query("SELECT COMPID, LabelText FROM WMS_UIDesign WHERE SCRID = 101");
        const fieldMap = {};
        designReq.recordset.forEach(f => {
            const safeKey = String(f.LabelText).toLowerCase().replace(/[\s-]/g, '');
            fieldMap[safeKey] = String(f.COMPID);
        });

        const compIdCariKod = fieldMap['cariseçim'] || fieldMap['carikod'] || '10101';
        const compIdBelgeNo = fieldMap['irsaliyenumarası'] || fieldMap['irsaliyeno'] || '10102';
        const compIdBelgeTarihi = fieldMap['irsaliyetarihi'] || '10103';
        const compIdStok = fieldMap['ürünseçimi'] || fieldMap['stokkodu'] || '10104';
        const compIdMiktar = fieldMap['miktar'] || '10105';
        const compIdBirim = fieldMap['ölçübirimi'] || '10106';
        const compIdSeriNo = fieldMap['serino'] || '10108';

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const receiptResult = await new sql.Request(transaction)
                .input('CariKod', sql.NVarChar, payload.header[compIdCariKod] || 'BELIRSİZ')
                .input('BelgeNo', sql.NVarChar, payload.header[compIdBelgeNo] || '')
                .input('BelgeTarihi', sql.DateTime, payload.header[compIdBelgeTarihi] ? new Date(payload.header[compIdBelgeTarihi]) : null)
                .input('CreatedBy', sql.NVarChar, createdBy)
                .input('RawHeaderJSON', sql.NVarChar, JSON.stringify(payload.header))
                .query(`
                    INSERT INTO WMS_Receipts (CariKod, BelgeNo, BelgeTarihi, CreatedBy, RawHeaderJSON, IntegrationStatus)
                    OUTPUT INSERTED.ReceiptID
                    VALUES (@CariKod, @BelgeNo, @BelgeTarihi, @CreatedBy, @RawHeaderJSON, 0)
                `);

            const receiptId = receiptResult.recordset[0].ReceiptID;

            for (const line of payload.lines) {
                const coreKeys = [compIdStok, compIdMiktar, compIdBirim, compIdSeriNo];
                const dynamicFields = {};
                for (const key in line) {
                    if (!coreKeys.includes(key)) dynamicFields[key] = line[key];
                }

                await new sql.Request(transaction)
                    .input('ReceiptID', sql.Int, receiptId)
                    .input('StokKodu', sql.NVarChar, line[compIdStok] || '')
                    .input('Miktar', sql.Decimal(18, 4), parseFloat(line[compIdMiktar]) || 0)
                    .input('Birim', sql.NVarChar, line[compIdBirim] || '')
                    .input('SeriNo', sql.NVarChar, line[compIdSeriNo] || '')
                    .input('DynamicFieldsJSON', sql.NVarChar, JSON.stringify(dynamicFields))
                    .query(`INSERT INTO WMS_ReceiptLines (ReceiptID, StokKodu, Miktar, Birim, SeriNo, DynamicFieldsJSON) VALUES (@ReceiptID, @StokKodu, @Miktar, @Birim, @SeriNo, @DynamicFieldsJSON)`);
            }

            if (draftId && draftId !== 'null' && draftId !== 'undefined') {
                await new sql.Request(transaction)
                    .input('id', sql.Int, parseInt(draftId))
                    .query('UPDATE WMS_TransactionDrafts SET IsActive = 0, LastUpdatedAt = GETDATE() WHERE DraftID = @id');
            } else {
                // Fallback: Kullanıcı ID ve ekran kodu üzerinden aktif taslağı temizle
                await new sql.Request(transaction)
                    .input('uid', sql.VarChar, String(payload.userId || ''))
                    .query("UPDATE WMS_TransactionDrafts SET IsActive = 0, LastUpdatedAt = GETDATE() WHERE UserID = @uid AND ScreenCode = '101' AND IsActive = 1");
            }

            await transaction.commit();
            return receiptId;
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }

    async getIntegrationLogs(page = 1, pageSize = 15, statusFilter = null) {
        const pool = await poolPromise;
        const offset = (parseInt(page) - 1) * parseInt(pageSize);

        let whereClause = '';
        if (statusFilter !== null && statusFilter !== undefined && statusFilter !== '' && statusFilter !== 'all') {
            whereClause = ' WHERE IntegrationStatus = @status';
        }

        const query = `
            SELECT ReceiptID, BelgeNo, CariKod, BelgeTarihi, CreatedBy, CreatedAt, IntegrationStatus, IntegrationErrorDesc 
            FROM WMS_Receipts 
            ${whereClause}
            ORDER BY CreatedAt DESC 
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `;

        const countQuery = `SELECT COUNT(*) as TotalCount FROM WMS_Receipts ${whereClause}`;

        const request = pool.request()
            .input('offset', sql.Int, offset)
            .input('limit', sql.Int, parseInt(pageSize));

        if (whereClause) {
            request.input('status', sql.Int, parseInt(statusFilter));
        }

        const [dataResult, countResult] = await Promise.all([
            request.query(query),
            pool.request()
                .input('status', sql.Int, whereClause ? parseInt(statusFilter) : null)
                .query(countQuery)
        ]);

        return {
            logs: dataResult.recordset,
            totalCount: countResult.recordset[0].TotalCount,
            totalPages: Math.ceil(countResult.recordset[0].TotalCount / pageSize),
            currentPage: parseInt(page)
        };
    }

    async executeDynamicSQL(scrid, compid) {
        const pool = await poolPromise;
        const fieldInfo = await pool.request()
            .input('sc', sql.Int, parseInt(scrid))
            .input('cid', sql.Int, parseInt(compid))
            .query('SELECT DataSourceSQL FROM WMS_UIDesign WHERE SCRID = @sc AND COMPID = @cid');

        const rawSQL = fieldInfo.recordset[0]?.DataSourceSQL;
        if (!rawSQL) throw new Error('Sorgu bulunamadı.');

        const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER'];
        if (forbidden.some(k => rawSQL.toUpperCase().includes(k))) throw new Error('Güvenlik: Sadece SELECT sorgularına izin verilir.');

        const result = await pool.request().query(rawSQL);
        return result.recordset;
    }

    async saveDraft(userId, screenCode, headerData, lineData) {
        const pool = await poolPromise;
        const check = await pool.request()
            .input('uid', sql.VarChar, String(userId))
            .input('sc', sql.VarChar, String(screenCode))
            .query('SELECT DraftID FROM WMS_TransactionDrafts WHERE UserID = @uid AND ScreenCode = @sc AND IsActive = 1');

        if (check.recordset.length > 0) {
            const draftId = check.recordset[0].DraftID;
            if (!lineData || lineData.length === 0) {
                await pool.request().input('id', sql.Int, draftId).query('UPDATE WMS_TransactionDrafts SET IsActive = 0, LastUpdatedAt = GETDATE() WHERE DraftID = @id');
            } else {
                await pool.request()
                    .input('hd', sql.NVarChar, JSON.stringify(headerData))
                    .input('ld', sql.NVarChar, JSON.stringify(lineData))
                    .input('id', sql.Int, draftId)
                    .query('UPDATE WMS_TransactionDrafts SET HeaderData = @hd, LineData = @ld, LastUpdatedAt = GETDATE() WHERE DraftID = @id');
            }
        } else if (lineData && lineData.length > 0) {
            await pool.request()
                .input('uid', sql.VarChar, String(userId))
                .input('sc', sql.VarChar, String(screenCode))
                .input('hd', sql.NVarChar, JSON.stringify(headerData))
                .input('ld', sql.NVarChar, JSON.stringify(lineData))
                .query('INSERT INTO WMS_TransactionDrafts (UserID, ScreenCode, HeaderData, LineData, IsActive, CreatedAt, LastUpdatedAt) VALUES (@uid, @sc, @hd, @ld, 1, GETDATE(), GETDATE())');
        }
        return true;
    }

    async getActiveDraft(userId, screenCode) {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('uid', sql.VarChar, String(userId))
            .input('sc', sql.VarChar, String(screenCode))
            .query('SELECT * FROM WMS_TransactionDrafts WHERE UserID = @uid AND ScreenCode = @sc AND IsActive = 1');
        return result.recordset[0] || null;
    }

    async getNextSerial() {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT CAST(YEAR(GETDATE()) AS VARCHAR(4)) + RIGHT('000000' + CAST(NEXT VALUE FOR WMS_SerialSeq AS VARCHAR(6)), 6) AS SerialNumber");
        if (result.recordset.length > 0) return result.recordset[0].SerialNumber;
        throw new Error('Seri numarası üretilemedi.');
    }
}

module.exports = new WMSService();
