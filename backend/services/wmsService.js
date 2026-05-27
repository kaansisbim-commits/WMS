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
            'IsLotTrackingActive': { compId: 10199, compId102: 10299, labelText: 'Lot No', type: 'TEXT' },
            'IsSKTTrackingActive': { compId: 10198, compId102: 10298, labelText: 'SKT', type: 'DATE' },
            'IsProdDateTrackingActive': { compId: 10197, compId102: 10297, labelText: 'Üretim Tarihi', type: 'DATE' },
            'LOKASYONTAKIBI': { compId: 10196, compId102: 10296, labelText: 'Depo Kodu', type: 'TEXT' }
        };

        if (dynamicFieldsConfig[key]) {
            const config = dynamicFieldsConfig[key];
            const isActive = value ? 1 : 0;

            const applyForScreen = async (scrid, defaultCompId) => {
                let targetCompId = defaultCompId;

                // Eğer anahtar LOKASYONTAKIBI ise, UIDesign tablosunda zaten kayıtlı bir "depokodu" veya "depo" alanı var mı diye kontrol edelim
                if (key === 'LOKASYONTAKIBI') {
                    const existingFields = await pool.request()
                        .input('scrid', sql.Int, scrid)
                        .query('SELECT COMPID, LabelText FROM WMS_UIDesign WHERE SCRID = @scrid');
                    
                    const depoField = existingFields.recordset.find(f => {
                        const label = String(f.LabelText).toLowerCase().replace(/[\s-]/g, '');
                        return label === 'depokodu' || label === 'depo';
                    });
                    
                    if (depoField) {
                        targetCompId = depoField.COMPID;
                    }
                }

                const checkField = await pool.request()
                    .input('scrid', sql.Int, scrid)
                    .input('compid', sql.Int, targetCompId)
                    .query('SELECT COMPID FROM WMS_UIDesign WHERE SCRID = @scrid AND COMPID = @compid');

                if (checkField.recordset.length > 0) {
                    await pool.request()
                        .input('scrid', sql.Int, scrid)
                        .input('compid', sql.Int, targetCompId)
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
                        .input('compid', sql.Int, targetCompId)
                        .input('labelText', sql.NVarChar, config.labelText)
                        .input('compType', sql.VarChar, config.type)
                        .input('sortOrder', sql.Int, newSortOrder)
                        .query(`
                            INSERT INTO WMS_UIDesign (SCRID, COMPID, LabelText, ComponentType, DefaultValue, GuideDisplayType, DataSourceSQL, MaxLength, SortOrder, IsVisible, IsRequired, GuideMappingJSON, SectionGroup)
                            VALUES (@scrid, @compid, @labelText, @compType, '', 'CARD', '', 50, @sortOrder, 1, 1, '[]', 'LINE')
                        `);
                }
            };

            await applyForScreen(101, config.compId);
            await applyForScreen(102, config.compId102);
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
        const compIdLotNo = fieldMap['lotnumarası'] || fieldMap['lotno'] || fieldMap['lot'] || '10199';

        let finalCariKod = payload.header[compIdCariKod] || 'BELIRSİZ';
        
        // Fallback: Siparişe bağlı mal kabulde gerçek CariKod'u kalemlerdeki _STHAR_ACIKLAMA alanından besleyelim
        if (payload.lines && payload.lines.length > 0) {
            const firstLine = payload.lines[0];
            const lineCariKod = firstLine._STHAR_ACIKLAMA || firstLine.STHAR_ACIKLAMA || firstLine['_STHAR_ACIKLAMA'];
            if (lineCariKod) {
                finalCariKod = lineCariKod;
            }
        }

        const scrid = parseInt(payload.header.scrid || '0');
        
        // 201 Depolar Arası Transfer ekranında Cari Kod sabit olarak DAT olmalıdır
        if (scrid === 201) {
            finalCariKod = 'DAT';
        }

        let initialStatus = 0;
        
        // Sadece Mal Kabul ekranları (101, 102 vb.) için onay mekanizması işletilir.
        if (scrid === 101 || scrid === 102) {
            const paramReq = await pool.request().query("SELECT ParamValue FROM WMS_SystemParameters WHERE ParamKey = 'MALKABULONAY'");
            const malkabulOnayVal = paramReq.recordset.length > 0 ? paramReq.recordset[0].ParamValue : 0;
            initialStatus = (malkabulOnayVal == 1 || malkabulOnayVal === '1' || malkabulOnayVal === true) ? 4 : 0;
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const receiptResult = await new sql.Request(transaction)
                .input('CariKod', sql.NVarChar, finalCariKod)
                .input('BelgeNo', sql.NVarChar, payload.header[compIdBelgeNo] || '')
                .input('BelgeTarihi', sql.DateTime, payload.header[compIdBelgeTarihi] ? new Date(payload.header[compIdBelgeTarihi]) : null)
                .input('CreatedBy', sql.NVarChar, createdBy)
                .input('RawHeaderJSON', sql.NVarChar, JSON.stringify(payload.header))
                .input('IntegrationStatus', sql.Int, initialStatus)
                .query(`
                    INSERT INTO WMS_Receipts (CariKod, BelgeNo, BelgeTarihi, CreatedBy, RawHeaderJSON, IntegrationStatus)
                    OUTPUT INSERTED.ReceiptID
                    VALUES (@CariKod, @BelgeNo, @BelgeTarihi, @CreatedBy, @RawHeaderJSON, @IntegrationStatus)
                `);

            const receiptId = receiptResult.recordset[0].ReceiptID;

            for (const line of payload.lines) {
                const coreKeys = [compIdStok, compIdMiktar, compIdBirim, compIdSeriNo, compIdLotNo];
                const dynamicFields = {};
                for (const key in line) {
                    if (!coreKeys.includes(key) && key !== '1007' && key !== 'lotNo' && key !== 'LotNo') {
                        dynamicFields[key] = line[key];
                    }
                }

                // Extract lot value from line using different possible keys
                const lotVal = line[compIdLotNo] || line['1007'] || line['lotNo'] || line['LotNo'] || line['lot'] || '';

                // Depo Kodu bulma mantığı (Header ve Line için, hem 101 hem 102 ID'lerini kapsar)
                const depokoduKeys = ['10196', '10296', 'depoKodu', 'DepoKodu', 'depo', 'Depo'];
                let headerDepoKodu = null;
                for (const k of depokoduKeys) {
                    if (payload.header && payload.header[k] !== undefined && payload.header[k] !== null && payload.header[k] !== '') {
                        headerDepoKodu = payload.header[k];
                        break;
                    }
                }

                let lineDepoKodu = null;
                for (const k of depokoduKeys) {
                    if ((line[k] !== undefined && line[k] !== null && line[k] !== '') || (dynamicFields[k] !== undefined && dynamicFields[k] !== null && dynamicFields[k] !== '')) {
                        lineDepoKodu = line[k] || dynamicFields[k];
                        break;
                    }
                }
                const finalDepoKodu = String(lineDepoKodu || headerDepoKodu || '0');
                
                const stokKodu = line[compIdStok] || line.StokKodu || '';
                const miktar = parseFloat(line[compIdMiktar] || line.Miktar) || 0;
                const seriNo = line[compIdSeriNo] || line.SeriNo || '';

                const lineResult = await new sql.Request(transaction)
                    .input('ReceiptID', sql.Int, receiptId)
                    .input('StokKodu', sql.NVarChar, stokKodu)
                    .input('Miktar', sql.Decimal(18, 4), miktar)
                    .input('Birim', sql.NVarChar, line[compIdBirim] || line.Birim || '')
                    .input('SeriNo', sql.NVarChar, seriNo)
                    .input('LotNo', sql.NVarChar, lotVal)
                    .input('DynamicFieldsJSON', sql.NVarChar, JSON.stringify(dynamicFields))
                    .query(`
                        INSERT INTO WMS_ReceiptLines (ReceiptID, StokKodu, Miktar, Birim, SeriNo, LotNo, DynamicFieldsJSON) 
                        OUTPUT INSERTED.LineID
                        VALUES (@ReceiptID, @StokKodu, @Miktar, @Birim, @SeriNo, @LotNo, @DynamicFieldsJSON)
                    `);
                
                const lineId = lineResult.recordset[0].LineID;
            }

            // Deactivate all active drafts for this Cari and Irsaliye (Master Lock Enforcement)
            await new sql.Request(transaction)
                .input('cari', sql.NVarChar, finalCariKod)
                .input('irsaliye', sql.NVarChar, payload.header[compIdBelgeNo] || '')
                .query(`
                    UPDATE WMS_TransactionDrafts 
                    SET IsActive = 0, LastUpdatedAt = GETDATE() 
                    WHERE IsActive = 1
                      AND (
                          JSON_VALUE(HeaderData, '$."10101"') = @cari OR 
                          JSON_VALUE(HeaderData, '$."10201"') = @cari OR 
                          JSON_VALUE(HeaderData, '$.cariKod') = @cari OR 
                          JSON_VALUE(HeaderData, '$._cariKod') = @cari
                      )
                      AND (
                          JSON_VALUE(HeaderData, '$."10102"') = @irsaliye OR 
                          JSON_VALUE(HeaderData, '$."10203"') = @irsaliye OR 
                          JSON_VALUE(HeaderData, '$.irsaliyeNo') = @irsaliye
                      )
                `);

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

    async executeDynamicSQL(scrid, compid, queryParams = {}) {
        const pool = await poolPromise;
        const fieldInfo = await pool.request()
            .input('sc', sql.Int, parseInt(scrid))
            .input('cid', sql.Int, parseInt(compid))
            .query('SELECT DataSourceSQL FROM WMS_UIDesign WHERE SCRID = @sc AND COMPID = @cid');

        let rawSQL = fieldInfo.recordset[0]?.DataSourceSQL;
        if (!rawSQL) throw new Error('Sorgu bulunamadı.');

        const forbiddenRegex = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)\b/i;
        if (forbiddenRegex.test(rawSQL)) throw new Error('Güvenlik: Sadece SELECT sorgularına izin verilir.');

        const request = pool.request();
        if (queryParams.cariKod) {
            request.input('cariKod', sql.VarChar, String(queryParams.cariKod).trim());
            // If the query lists orders, we append a filter for A.CARI_KODU dynamically
            if (rawSQL.includes('A.CARI_KODU')) {
                rawSQL = `${rawSQL} AND A.CARI_KODU = @cariKod`;
            }
        }

        const result = await request.query(rawSQL);
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

    async getPurchaseOrderLines(orderId) {
        const pool = await poolPromise;
        const ids = String(orderId).split(',').map(id => id.trim()).filter(Boolean);
        if (ids.length === 0) return [];

        const request = pool.request();
        const parameterNames = ids.map((id, index) => {
            const paramName = `orderId_${index}`;
            request.input(paramName, sql.VarChar, id);
            return `@${paramName}`;
        });

        const queryStr = `
            SELECT 
                C.STOK_KODU,
                CHEMINOX2024.dbo.TRK(S.STOK_ADI) AS STOK_ADI,
                C.STHAR_GCMIK AS MIKTAR,
                C.FIRMA_DOVTUT AS TESLIM_MIKTAR,
                (C.STHAR_GCMIK - C.FIRMA_DOVTUT) AS KALAN_MIKTAR,
                S.GIRIS_SERI AS _GIRISSERI,
                C.STHAR_NF AS _STHAR_NF,
                C.STHAR_BF AS _STHAR_BF,
                C.STRA_SIPKONT AS _STRA_SIPKONT,
                C.STHAR_ACIKLAMA AS _STHAR_ACIKLAMA,
                C.FISNO AS SIPARIS_NO
            FROM CHEMINOX2024..TBLSIPATRA C 
            LEFT OUTER JOIN CHEMINOX2024..TBLSTSABIT S ON S.STOK_KODU = C.STOK_KODU
            WHERE C.STHAR_GCKOD='G' AND C.STHAR_FTIRSIP='7' AND C.STHAR_HTUR='H' AND C.FISNO IN (${parameterNames.join(', ')})
        `;
        const result = await request.query(queryStr);
        return result.recordset;
    }

    async getReceiptLines(receiptId) {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('rid', sql.Int, parseInt(receiptId))
            .query('SELECT * FROM WMS_ReceiptLines WHERE ReceiptID = @rid');
        return result.recordset;
    }

    async approveReceipt(receiptId) {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('rid', sql.Int, parseInt(receiptId))
            .query('UPDATE WMS_Receipts SET IntegrationStatus = 0 WHERE ReceiptID = @rid AND IntegrationStatus = 4');
        return result.rowsAffected[0] > 0;
    }
}

module.exports = new WMSService();
