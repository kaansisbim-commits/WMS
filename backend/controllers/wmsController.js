const axios = require('axios');
const { poolPromise, sql } = require('../config/db');

/**
 * WMS Controller
 * Handles MSSQL Reads and NetOpenX Writes
 */

// MSSQL GET: Sipariş veya Stok Bilgisi Çekme
exports.getData = async (req, res) => {
    try {
        const { queryType, params } = req.query;

        // Mock Response for Demonstration
        // In real: const result = await sql.query(`SELECT * FROM ${queryType} ...`);

        let mockData = [];
        if (queryType === 'Siparisler') {
            mockData = [
                { SiparisNo: 'SIP001', CariKod: 'M001', Tarih: '2026-05-13' },
                { SiparisNo: 'SIP002', CariKod: 'M002', Tarih: '2026-05-13' }
            ];
        } else if (queryType === 'Stoklar') {
            mockData = [
                { StokKodu: 'STK001', StokIsmi: 'Laptop', Bakiye: 50 },
                { StokKodu: 'STK002', StokIsmi: 'Mouse', Bakiye: 200 }
            ];
        }

        res.json({ success: true, data: mockData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// NetOpenX POST: Mal Kabul veya Sevk Kaydı Atma
exports.postData = async (req, res) => {
    try {
        const payload = req.body;
        const { draftId } = req.query;

        console.log('[NETOPENX PAYLOAD]:', payload);

        // Integration with NetOpenX REST API
        /*
        const response = await axios.post(`${process.env.NETOPENX_URL}/PostOperation`, payload, {
            auth: {
                username: process.env.NETOPENX_USER,
                password: process.env.NETOPENX_PASS
            }
        });
        */

        // If a draft was used, mark it as inactive (completed)
        if (draftId) {
            const pool = await poolPromise;
            await pool.request()
                .input('id', sql.Int, parseInt(draftId))
                .query('UPDATE WMS_TransactionDrafts SET IsActive = 0, LastUpdatedAt = GETDATE() WHERE DraftID = @id');
        }

        // Mock success response
        res.json({
            success: true,
            message: 'İşlem başarıyla Logo Netsis\'e aktarıldı.',
            transactionId: 'TRX-' + Math.random().toString(36).substr(2, 9)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'NetOpenX Hatası: ' + error.message });
    }
};

// Dynamic Parameters (Stored in DB: WMS_SystemParameters)
exports.getParameters = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT ParamKey, ParamValue, Description FROM WMS_SystemParameters');

        // Return as array of objects for the UI to render dynamically
        const parameters = result.recordset.map(row => {
            console.log(`ParamKey: ${row.ParamKey}, ParamValue: ${row.ParamValue}, Type: ${typeof row.ParamValue}`);
            return {
                key: row.ParamKey,
                value: row.ParamValue == 1 || row.ParamValue === true,
                description: row.Description
            };
        });

        res.json({ success: true, data: parameters });
    } catch (error) {
        console.error('SQL getParameters error:', error);
        res.status(500).json({ success: false, message: 'Database hatası: ' + error.message });
    }
};

exports.updateParameters = async (req, res) => {
    try {
        const paramsArray = req.body; // Expecting array of {key, value}
        const pool = await poolPromise;

        for (const param of paramsArray) {
            await pool.request()
                .input('key', sql.VarChar, param.key)
                .input('val', sql.Bit, param.value ? 1 : 0)
                .query('UPDATE WMS_SystemParameters SET ParamValue = @val WHERE ParamKey = @key');
        }

        res.json({ success: true, message: 'Parametreler MSSQL üzerinde güncellendi.' });
    } catch (error) {
        console.error('SQL updateParameters error:', error);
        res.status(500).json({ success: false, message: 'Kayıt hatası: ' + error.message });
    }
};

// UI Design Management (WMS_UIDesign Table)
exports.getUIDesign = async (req, res) => {
    try {
        const { scrid } = req.query;
        const pool = await poolPromise;
        const result = await pool.request()
            .input('scrid', sql.Int, parseInt(scrid))
            .query('SELECT * FROM WMS_UIDesign WHERE SCRID = @scrid ORDER BY SortOrder');

        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error('getUIDesign error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.saveUIDesign = async (req, res) => {
    try {
        const { scrid, fields } = req.body;
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
            res.json({ success: true, message: 'Tasarım veritabanına kaydedildi.' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        console.error('saveUIDesign error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// UI Tasarımı Bileşen Silme
exports.deleteUIDesign = async (req, res) => {
    try {
        const { ScreenCode, ComponentID } = req.body;
        
        if (!ScreenCode || !ComponentID) {
            return res.status(400).json({ success: false, message: 'ScreenCode ve ComponentID zorunludur.' });
        }

        const pool = await poolPromise;
        const result = await pool.request()
            .input('SCRID', sql.Int, parseInt(ScreenCode))
            .input('COMPID', sql.Int, parseInt(ComponentID))
            .query('DELETE FROM WMS_UIDesign WHERE SCRID = @SCRID AND COMPID = @COMPID');
            
        // Eğer veritabanında zaten yoksa (yeni eklenip henüz kaydedilmemiş bir satırsa),
        // işlemi yine de başarılı sayıyoruz ki arayüzden (state) silinebilsin.
        res.json({ 
            success: true, 
            message: result.rowsAffected[0] > 0 
                ? 'Bileşen başarıyla silindi.' 
                : 'Bileşen veritabanında bulunamadı (Zaten silinmiş veya henüz kaydedilmemiş olabilir).' 
        });
    } catch (error) {
        console.error('deleteUIDesign error:', error);
        res.status(500).json({ success: false, message: 'Bileşen silinirken hata oluştu: ' + error.message });
    }
};

// Dinamik Rehber Verisi Çekme
exports.executeDynamicSQL = async (req, res) => {
    try {
        const { scrid, compid } = req.query;
        const pool = await poolPromise;

        const fieldInfo = await pool.request()
            .input('sc', sql.Int, parseInt(scrid))
            .input('cid', sql.Int, parseInt(compid))
            .query('SELECT DataSourceSQL FROM WMS_UIDesign WHERE SCRID = @sc AND COMPID = @cid');

        const rawSQL = fieldInfo.recordset[0]?.DataSourceSQL;
        if (!rawSQL) return res.status(404).json({ success: false, message: 'Sorgu bulunamadı.' });

        // Basit Güvenlik Kontrolü
        const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER'];
        if (forbidden.some(k => rawSQL.toUpperCase().includes(k))) {
            return res.status(403).json({ success: false, message: 'Güvenlik: Sadece SELECT sorgularına izin verilir.' });
        }

        const result = await pool.request().query(rawSQL);
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, message: 'SQL Hatası: ' + error.message });
    }
};

// Drafts (Taslaklar)
exports.saveDraft = async (req, res) => {
    try {
        const { userId, screenCode, headerData, lineData } = req.body;
        const pool = await poolPromise;

        // Check if active draft exists
        const check = await pool.request()
            .input('uid', sql.VarChar, String(userId))
            .input('sc', sql.VarChar, String(screenCode))
            .query('SELECT DraftID FROM WMS_TransactionDrafts WHERE UserID = @uid AND ScreenCode = @sc AND IsActive = 1');

        if (check.recordset.length > 0) {
            if (!lineData || lineData.length === 0) {
                // Tüm kalemler silindiyse veya boş gönderildiyse taslağı pasife çek
                await pool.request()
                    .input('id', sql.Int, check.recordset[0].DraftID)
                    .query('UPDATE WMS_TransactionDrafts SET IsActive = 0, LastUpdatedAt = GETDATE() WHERE DraftID = @id');
            } else {
                // Update
                await pool.request()
                    .input('hd', sql.NVarChar, JSON.stringify(headerData))
                    .input('ld', sql.NVarChar, JSON.stringify(lineData))
                    .input('id', sql.Int, check.recordset[0].DraftID)
                    .query('UPDATE WMS_TransactionDrafts SET HeaderData = @hd, LineData = @ld, LastUpdatedAt = GETDATE() WHERE DraftID = @id');
            }
        } else {
            // Eğer liste boşken save atılıyorsa hiç taslak oluşturma
            if (lineData && lineData.length > 0) {
                // Insert
                await pool.request()
                    .input('uid', sql.VarChar, String(userId))
                    .input('sc', sql.VarChar, String(screenCode))
                    .input('hd', sql.NVarChar, JSON.stringify(headerData))
                    .input('ld', sql.NVarChar, JSON.stringify(lineData))
                    .query('INSERT INTO WMS_TransactionDrafts (UserID, ScreenCode, HeaderData, LineData, IsActive, CreatedAt, LastUpdatedAt) VALUES (@uid, @sc, @hd, @ld, 1, GETDATE(), GETDATE())');
            }
        }

        res.json({ success: true, message: 'Taslak başarıyla kaydedildi.' });
    } catch (error) {
        console.error('saveDraft error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getActiveDraft = async (req, res) => {
    try {
        const { userId, screenCode } = req.query;
        const pool = await poolPromise;

        const result = await pool.request()
            .input('uid', sql.VarChar, String(userId))
            .input('sc', sql.VarChar, String(screenCode))
            .query('SELECT * FROM WMS_TransactionDrafts WHERE UserID = @uid AND ScreenCode = @sc AND IsActive = 1');

        if (result.recordset.length > 0) {
            res.json({ success: true, draft: result.recordset[0] });
        } else {
            res.json({ success: true, draft: null });
        }
    } catch (error) {
        console.error('getActiveDraft error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Traceability (Seri Numarası Üretimi) ---
exports.getNextSerial = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT CAST(YEAR(GETDATE()) AS VARCHAR(4)) + 
                   RIGHT('000000' + CAST(NEXT VALUE FOR WMS_SerialSeq AS VARCHAR(6)), 6) AS SerialNumber
        `);
        
        if (result.recordset.length > 0) {
            res.json({ success: true, serial: result.recordset[0].SerialNumber });
        } else {
            throw new Error('Seri numarası üretilemedi.');
        }
    } catch (error) {
        console.error('getNextSerial error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'SQL Hatası: WMS_SerialSeq nesnesi bulunamadı veya yetki yok. Lütfen veritabanında Sequence oluşturduğunuzdan emin olun.' 
        });
    }
};
