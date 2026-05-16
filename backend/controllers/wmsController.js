const netsisService = require('../services/netsisService');
const wmsService = require('../services/wmsService');

/**
 * WMS Controller
 * Entry point for WMS related requests. Handles req/res and calls services.
 */

// --- MSSQL Data (Local WMS) ---
exports.getData = async (req, res) => {
    try {
        // This is a generic GET, we can keep it simple or route to specific service methods
        res.json({ success: true, message: 'Data route active' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.postData = async (req, res) => {
    try {
        const payload = req.body;
        const { draftId } = req.query;
        const userId = String(payload.userId || '0');
        const username = String(payload.username || 'Admin');

        if (!payload || !payload.header || !payload.lines) {
            return res.status(400).json({ success: false, message: 'Geçersiz veri formatı.' });
        }

        const receiptId = await wmsService.saveReceipt(payload, draftId, username);
        res.json({ success: true, message: 'Fiş başarıyla kaydedildi.', receiptId });
    } catch (error) {
        console.error('postData Error:', error);
        res.status(500).json({ success: false, message: 'WMS Kayıt Hatası: ' + error.message });
    }
};

// --- NetOpenX Integration ---
exports.sendToNetsis = async (req, res) => {
    try {
        const { receiptId } = req.body || {};
        const { poolPromise, sql } = require('../config/db'); // Needed for the specific query logic here
        const pool = await poolPromise;

        let queryStr = 'SELECT TOP 10 * FROM WMS_Receipts WHERE IntegrationStatus IN (0, 2) ORDER BY CreatedAt ASC';
        let request = pool.request();

        if (receiptId) {
            queryStr = 'SELECT * FROM WMS_Receipts WHERE ReceiptID = @rid';
            request.input('rid', sql.Int, receiptId);
        }

        const receiptReq = await request.query(queryStr);
        const receipts = receiptReq.recordset;

        if (receipts.length === 0) {
            return res.json({ success: true, message: 'Aktarılacak bekleyen fiş bulunamadı.' });
        }

        let results = [];
        for (const receipt of receipts) {
            try {
                const linesReq = await pool.request()
                    .input('ReceiptID', sql.Int, receipt.ReceiptID)
                    .query('SELECT * FROM WMS_ReceiptLines WHERE ReceiptID = @ReceiptID');
                const lines = linesReq.recordset;

                // Tarih formatını güvenli hale getirelim (UTC kaymalarını önlemek için)
                const formatDate = (d) => {
                    const date = d ? new Date(d) : new Date();
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                };

                const belTarihiStr = formatDate(receipt.BelgeTarihi);

                // Seri takibi parametresini kontrol et
                const paramReq = await pool.request()
                    .input('pKey', sql.VarChar, 'SERINETSISEYAZ')
                    .query('SELECT ParamValue FROM WMS_SystemParameters WHERE ParamKey = @pKey');
                const masterSerialActive = paramReq.recordset[0]?.ParamValue == 1;

                // Satırları işle ve hibrit seri takibi durumunu belirle
                const processedLines = lines.map(line => {
                    let dynamicFields = {};
                    try {
                        dynamicFields = line.DynamicFieldsJSON ? JSON.parse(line.DynamicFieldsJSON) : {};
                    } catch (e) {
                        console.error('DynamicFieldsJSON parse error:', e);
                    }

                    // _GIRISSERI değeri 1, "1", true, "true" veya "E" olabilir
                    const lineSerialActive =

                        dynamicFields._GIRISSERI === 'E';

                    return { ...line, _lineSerialActive: lineSerialActive };
                });

                // --- SATIR BİRLEŞTİRME (CONSOLIDATION) MANTIĞI ---
                // Aynı StokKodu'na sahip satırları grupla
                const groupedMap = processedLines.reduce((acc, line) => {
                    const key = line.StokKodu;
                    if (!acc[key]) {
                        acc[key] = {
                            StokKodu: key,
                            TotalMiktar: 0,
                            isGroupSerialActive: false,
                            SeriListesi: []
                        };
                    }

                    acc[key].TotalMiktar += parseFloat(line.Miktar || 0);
                    if (line._lineSerialActive) acc[key].isGroupSerialActive = true;

                    if (line.SeriNo) {
                        acc[key].SeriListesi.push({
                            Seri1: line.SeriNo,
                            Miktar: parseFloat(line.Miktar || 0),
                            HareketTip: 1
                        });
                    }

                    return acc;
                }, {});

                const groupedLines = Object.values(groupedMap);

                // Eğer en az bir grupta seri takibi varsa ve master parametre aktifse SeriliHesapla true olur
                const isReceiptSerialActive = masterSerialActive && groupedLines.some(g => g.isGroupSerialActive);

                const payload = {
                    SeriliHesapla: isReceiptSerialActive,
                    KayitliNumaraOtomatikGuncellensin: true,
                    FatUst: {
                        CariKod: receipt.CariKod,
                        Tarih: belTarihiStr,
                        TIPI: 2,
                        KDV_DAHILMI: false,
                        Tip: 3,
                        FATIRS_NO: receipt.BelgeNo || '',
                        SUBE_KODU: parseInt(process.env.NETOPENX_BRANCH || '0'),
                        PROJE_KODU: "0",
                        SIPARIS_TEST: belTarihiStr
                    },
                    Kalems: groupedLines.map(group => {
                        const useSerialForThisGroup = masterSerialActive && group.isGroupSerialActive;

                        const item = {
                            SeriTakibi: useSerialForThisGroup ? "E" : "H",
                            StokKodu: group.StokKodu,
                            STra_GCMIK: group.TotalMiktar,
                            DEPO_KODU: 1,
                            STra_Sube: parseInt(process.env.NETOPENX_BRANCH || '0')
                        };

                        // Eğer bu grup için seri takibi aktifse KalemSeri dizisini ekle
                        if (useSerialForThisGroup && group.SeriListesi.length > 0) {
                            item.KalemSeri = group.SeriListesi;
                        }

                        return item;
                    })
                };

                const integrationResult = await netsisService.sendItemSlip(payload);
                await pool.request().input('id', sql.Int, receipt.ReceiptID).query('UPDATE WMS_Receipts SET IntegrationStatus = 1, IntegrationErrorDesc = NULL WHERE ReceiptID = @id');
                results.push({ receiptId: receipt.ReceiptID, status: 'Success', detail: integrationResult });
            } catch (err) {
                const errorDesc = err.message || 'Entegrasyon Hatası';
                await pool.request().input('id', sql.Int, receipt.ReceiptID).input('err', sql.NVarChar, errorDesc).query('UPDATE WMS_Receipts SET IntegrationStatus = 2, IntegrationErrorDesc = @err WHERE ReceiptID = @id');
                results.push({ receiptId: receipt.ReceiptID, status: 'Error', error: errorDesc });
            }
        }
        res.json({ success: true, processedCount: receipts.length, details: results });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Integration Worker Error: ' + error.message });
    }
};

exports.getIntegrationLogs = async (req, res) => {
    try {
        const { page = 1, pageSize = 15, status } = req.query;
        const result = await wmsService.getIntegrationLogs(page, pageSize, status);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- System Parameters ---
exports.getParameters = async (req, res) => {
    try {
        const data = await wmsService.getSystemParameters();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateParameters = async (req, res) => {
    try {
        await wmsService.updateParameters(req.body);
        res.json({ success: true, message: 'Parametreler güncellendi.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- UI Design ---
exports.getUIDesign = async (req, res) => {
    try {
        const { scrid } = req.query;
        const data = await wmsService.getUIDesign(scrid);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.saveUIDesign = async (req, res) => {
    try {
        const { scrid, fields } = req.body;
        await wmsService.saveUIDesign(scrid, fields);
        res.json({ success: true, message: 'Tasarım kaydedildi.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteUIDesign = async (req, res) => {
    try {
        const { ScreenCode, ComponentID } = req.body;
        const deleted = await wmsService.deleteUIDesignComponent(ScreenCode, ComponentID);
        res.json({ success: true, message: deleted ? 'Bileşen silindi.' : 'Bileşen bulunamadı.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.executeDynamicSQL = async (req, res) => {
    try {
        const { scrid, compid } = req.query;
        const data = await wmsService.executeDynamicSQL(scrid, compid);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Drafts ---
exports.saveDraft = async (req, res) => {
    try {
        const { userId, screenCode, headerData, lineData } = req.body;
        await wmsService.saveDraft(userId, screenCode, headerData, lineData);
        res.json({ success: true, message: 'Taslak kaydedildi.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getActiveDraft = async (req, res) => {
    try {
        const { userId, screenCode } = req.query;
        const draft = await wmsService.getActiveDraft(userId, screenCode);
        res.json({ success: true, draft });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Traceability ---
exports.getNextSerial = async (req, res) => {
    try {
        const serial = await wmsService.getNextSerial();
        res.json({ success: true, serial });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Diagnostic ---
exports.testConnection = async (req, res) => {
    try {
        const data = await netsisService.getToken();
        res.json({ success: true, message: 'NetOpenX Bağlantısı Başarılı', data });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message, detail: error.raw || error });
    }
};
