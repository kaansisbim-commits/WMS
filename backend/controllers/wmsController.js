const netsisService = require('../services/netsisService');
const wmsService = require('../services/wmsService');
const StrategyFactory = require('../services/integration/StrategyFactory');

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

exports.getStockBalance = async (req, res) => {
    try {
        const { barcode, depoKodu } = req.query;
        if (!barcode || !depoKodu) {
            return res.status(400).json({ success: false, message: 'Barkod ve DepoKodu parametreleri zorunludur.' });
        }

        const { poolPromise, sql } = require('../config/db');
        const pool = await poolPromise;

        const result = await pool.request()
            .input('barcode', sql.NVarChar, barcode)
            .input('depoKodu', sql.NVarChar, depoKodu)
            .query(`
                SELECT TOP 1 
                    b.KalanMiktar, 
                    b.StokKodu, 
                    b.SeriNo, 
                    b.LotNo, 
                    b.DepoKodu,
                    (SELECT TOP 1 STOK_ADI FROM CHEMINOX2024..TBLSTSABIT WHERE STOK_KODU = b.StokKodu) AS UrunAdi
                FROM WMS_StockBalances b
                WHERE (b.SeriNo = @barcode OR b.StokKodu = @barcode) 
                  AND b.DepoKodu = @depoKodu
                ORDER BY b.KalanMiktar DESC
            `);

        if (result.recordset.length === 0 || result.recordset[0].KalanMiktar <= 0) {
            return res.json({ success: false, balance: 0, message: 'Bu depoda okutulan ürün/seri için yeterli bakiye bulunamadı.' });
        }

        const row = result.recordset[0];

        res.json({
            success: true,
            balance: row.KalanMiktar,
            StokKodu: row.StokKodu,
            SeriNo: row.SeriNo,
            LotNo: row.LotNo,
            UrunAdi: row.UrunAdi
        });
    } catch (error) {
        console.error('getStockBalance Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getReportStockBalance = async (req, res) => {
    try {
        const { barcode } = req.query;
        if (!barcode) {
            return res.status(400).json({ success: false, message: 'Barkod parametresi zorunludur.' });
        }

        const { poolPromise, sql } = require('../config/db');
        const pool = await poolPromise;

        const result = await pool.request()
            .input('barcode', sql.NVarChar, barcode)
            .query(`
                SELECT 
                    b.DepoKodu,
                    b.SeriNo,
                    b.LotNo,
                    SUM(b.KalanMiktar) as ToplamBakiye,
                    b.StokKodu,
                    (SELECT TOP 1 STOK_ADI FROM CHEMINOX2024..TBLSTSABIT WHERE STOK_KODU = b.StokKodu) AS UrunAdi
                FROM WMS_StockBalances b
                WHERE (b.SeriNo = @barcode OR b.StokKodu = @barcode) AND b.KalanMiktar > 0
                GROUP BY b.DepoKodu, b.StokKodu, b.SeriNo, b.LotNo
                ORDER BY b.DepoKodu ASC, b.SeriNo ASC
            `);

        res.json({
            success: true,
            data: result.recordset
        });
    } catch (error) {
        console.error('getReportStockBalance Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getStockGuide = async (req, res) => {
    try {
        const { poolPromise } = require('../config/db');
        const pool = await poolPromise;

        const result = await pool.request()
            .query(`
                SELECT STOK_KODU as code, STOK_ADI as label 
                FROM CHEMINOX2024..TBLSTSABIT 
                WHERE STOK_KODU IS NOT NULL AND STOK_KODU != ''
                ORDER BY STOK_KODU ASC
            `);

        res.json({
            success: true,
            data: result.recordset
        });
    } catch (error) {
        console.error('getStockGuide Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- NetOpenX Integration & Sequential Queue ---

// Global scope kilit değişkeni (Mutex)
let isQueueProcessing = false;

/**
 * Tek bir fişin entegrasyon mantığını çalıştıran asıl fonksiyon.
 * Mevcut reduce (Satır Birleştirme), hibrit seri takibi ve payload eşleme kurallarını birebir korur.
 */
async function processSingleReceipt(receipt, pool, sql) {
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

        // Seri, SKT, Üretim Tarihi, Lot ve Lokasyon takibi parametrelerini kontrol et
        const paramReq = await pool.request()
            .query("SELECT ParamKey, ParamValue FROM WMS_SystemParameters WHERE ParamKey IN ('SERINETSISEYAZ', 'IsSKTTrackingActive', 'IsProdDateTrackingActive', 'LOKASYONTAKIBI', 'IsLotTrackingActive')");
        const params = paramReq.recordset;
        const masterSerialActive = params.find(p => p.ParamKey === 'SERINETSISEYAZ')?.ParamValue == 1;
        const sktTrackingActive = params.find(p => p.ParamKey === 'IsSKTTrackingActive')?.ParamValue == 1;
        const prodDateTrackingActive = params.find(p => p.ParamKey === 'IsProdDateTrackingActive')?.ParamValue == 1;
        const locationTrackingActive = params.find(p => p.ParamKey === 'LOKASYONTAKIBI')?.ParamValue == 1;
        const lotTrackingActive = params.find(p => p.ParamKey === 'IsLotTrackingActive')?.ParamValue == 1;

        // WMS_UIDesign tablosundan 101 ekranı (Mal Kabul) için depo kodu alanını dinamik bulalım
        const designReq = await pool.request()
            .input('scrid', sql.Int, 101)
            .query('SELECT COMPID, LabelText, SectionGroup FROM WMS_UIDesign WHERE SCRID = @scrid');
        const designFields = designReq.recordset;
        const depoField = designFields.find(f => {
            const label = String(f.LabelText).toLowerCase().replace(/[\s-]/g, '');
            return label === 'depokodu' || label === 'depo';
        });
        const depokoduCompId = depoField ? String(depoField.COMPID) : null;

        // Fiş başlığındaki (RawHeaderJSON) depo kodunu ve sipariş numarasını alalım
        let headerDepoKodu = null;
        let siparisNo = null;
        let scrid = 101;
        let headerData = {};
        try {
            headerData = receipt.RawHeaderJSON ? JSON.parse(receipt.RawHeaderJSON) : {};
            if (headerData.scrid) scrid = parseInt(headerData.scrid);

            if (depokoduCompId) {
                headerDepoKodu = headerData[depokoduCompId];
            }
            // Siparişe Bağlı Mal Kabul (102 ekranı) için sipariş numarası 10202'den gelir
            siparisNo = headerData['10202'] || headerData.orderNo || null;
        } catch (e) {
            console.error('RawHeaderJSON parse error:', e);
        }

        // Satırlardaki stok kodları için veritabanından varsayılan seri takibi (GIRISSERI) bilgilerini çek
        const uniqueStokKoduList = [...new Set(lines.map(l => l.StokKodu).filter(Boolean))];
        let stokSeriMap = {};
        if (uniqueStokKoduList.length > 0) {
            try {
                const stokQuery = uniqueStokKoduList.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
                const stokRes = await pool.request().query(`SELECT STOK_KODU, GIRIS_SERI FROM CHEMINOX2024..TBLSTSABIT WHERE STOK_KODU IN (${stokQuery})`);
                stokRes.recordset.forEach(r => {
                    stokSeriMap[r.STOK_KODU] = r.GIRIS_SERI;
                });
            } catch (err) {
                console.error('Stok bilgisi çekerken hata:', err);
            }
        }

        // Satırları işle ve hibrit seri takibi durumunu belirle
        const processedLines = lines.map(line => {
            let dynamicFields = {};
            try {
                dynamicFields = line.DynamicFieldsJSON ? JSON.parse(line.DynamicFieldsJSON) : {};
            } catch (e) {
                console.error('DynamicFieldsJSON parse error:', e);
            }

            // _GIRISSERI değeri 1, "1", true, "true" veya "E" olabilir
            // Öncelik: Dinamik Alanlar (Form) > Veritabanı (TBLSTSABIT)
            const girisSeri = dynamicFields._GIRISSERI || dynamicFields.GIRISSERI || stokSeriMap[line.StokKodu];
            const lineSerialActive = ['E', 'e', '1', 1, 'true', true].includes(girisSeri);

            // SKT değerini dinamik alanlardan (10198 veya 10298 component ID'sinden veya skt/SKT) alıyoruz
            const sktVal = dynamicFields['10198'] || dynamicFields['10298'] || dynamicFields['SKT'] || dynamicFields['skt'] || line.Skt || line.SKT || line.skt;

            // Üretim Tarihi değerini dinamik alanlardan (10197 veya 10297 component ID'sinden veya uretimTarihi/UretimTarihi) alıyoruz
            const prodDateVal = dynamicFields['10197'] || dynamicFields['10297'] || dynamicFields['UretimTarihi'] || dynamicFields['uretimTarihi'] || dynamicFields['Uretim Tarihi'] || line.UretimTarihi || line.ProdDate;

            // Lot/LotNo değerini dinamik alanlardan (10199/10299/1007 veya lotNo/LotNo) ya da veritabanından alıyoruz
            const lotVal = dynamicFields['10199'] || dynamicFields['10299'] || dynamicFields['1007'] || dynamicFields['lotNo'] || dynamicFields['LotNo'] || dynamicFields['lot'] || line.LotNo || line.LOTNO || line.lotNo;

            // Depo kodu satır bazında veya başlık bazında dinamik alanlarda olabilir
            const lineDepoKodu = (depokoduCompId && dynamicFields[depokoduCompId]) || dynamicFields['10296'] || dynamicFields['10196'] || line.DepoKodu;
            const finalDepoKodu = lineDepoKodu || headerDepoKodu;

            return {
                ...line,
                _lineSerialActive: lineSerialActive,
                _skt: sktVal,
                _prodDate: prodDateVal,
                _depoKodu: finalDepoKodu,
                _kaynakDepo: dynamicFields.KaynakDepo || headerData.kaynakDepo,
                _hedefDepo: dynamicFields.HedefDepo || headerData.hedefDepo,
                _lotNo: lotVal,
                _STHAR_NF: dynamicFields._STHAR_NF,
                _STHAR_BF: dynamicFields._STHAR_BF,
                _STRA_SIPKONT: dynamicFields._STRA_SIPKONT,
                _STHAR_ACIKLAMA: dynamicFields._STHAR_ACIKLAMA,
                _STra_SIPNUM: dynamicFields._STra_SIPNUM || dynamicFields.STra_SIPNUM || null
            };
        });

        // --- SATIR BİRLEŞTİRME (CONSOLIDATION) MANTIĞI ---
        // Aynı StokKodu'na sahip satırları grupla
        const groupedMap = processedLines.reduce((acc, line) => {
            const currentSiparisNo = line._STra_SIPNUM || siparisNo || '';
            const key = currentSiparisNo ? `${currentSiparisNo}_${line.StokKodu}` : line.StokKodu;
            if (!acc[key]) {
                acc[key] = {
                    StokKodu: line.StokKodu,
                    TotalMiktar: 0,
                    isGroupSerialActive: false,
                    SeriListesi: [],
                    DepoKodu: line._depoKodu,
                    KaynakDepo: line._kaynakDepo,
                    HedefDepo: line._hedefDepo,
                    STHAR_NF: line._STHAR_NF,
                    STHAR_BF: line._STHAR_BF,
                    STRA_SIPKONT: line._STRA_SIPKONT,
                    STHAR_ACIKLAMA: line._STHAR_ACIKLAMA,
                    STra_SIPNUM: currentSiparisNo
                };
            }

            acc[key].TotalMiktar += parseFloat(line.Miktar || 0);
            if (line._lineSerialActive) acc[key].isGroupSerialActive = true;

            if (line.SeriNo) {
                const seriItem = {
                    Seri1: line.SeriNo,
                    Miktar: parseFloat(line.Miktar || 0),
                    HareketTip: 1
                };

                // SKT takibi aktifse hem Aciklama1 hem de Acik1 alanına SKT bilgisini ekle
                if (sktTrackingActive && line._skt) {
                    let formattedSkt = '';
                    if (line._skt instanceof Date) {
                        formattedSkt = formatDate(line._skt);
                    } else {
                        const parsedDate = Date.parse(line._skt);
                        if (!isNaN(parsedDate) && typeof line._skt === 'string' && line._skt.includes('-')) {
                            formattedSkt = formatDate(new Date(line._skt));
                        } else {
                            formattedSkt = line._skt;
                        }
                    }
                    seriItem.Aciklama1 = formattedSkt;
                }

                // Üretim tarihi takibi aktifse hem Aciklama2 hem de Acik2 alanına Üretim Tarihi bilgisini ekle
                if (prodDateTrackingActive && line._prodDate) {
                    let formattedProdDate = '';
                    if (line._prodDate instanceof Date) {
                        formattedProdDate = formatDate(line._prodDate);
                    } else {
                        const parsedDate = Date.parse(line._prodDate);
                        if (!isNaN(parsedDate) && typeof line._prodDate === 'string' && line._prodDate.includes('-')) {
                            formattedProdDate = formatDate(new Date(line._prodDate));
                        } else {
                            formattedProdDate = line._prodDate;
                        }
                    }
                    seriItem.Aciklama2 = formattedProdDate;
                }

                // Lot takibi aktifse Seri2 alanına Lot numarasını ata
                if (lotTrackingActive && line._lotNo) {
                    seriItem.Seri2 = line._lotNo;
                }

                acc[key].SeriListesi.push(seriItem);
            }

            return acc;
        }, {});

        const groupedLines = Object.values(groupedMap);

        // Eğer en az bir grupta seri takibi varsa ve master parametre aktifse SeriliHesapla true olur
        const isReceiptSerialActive = masterSerialActive && groupedLines.some(g => g.isGroupSerialActive);

        const strategy = StrategyFactory.getStrategy(scrid);

        // Siparişli işlemlerde gerçek CariKod'u sipariş kalemindeki STHAR_ACIKLAMA alanından alıyoruz
        const payload = {
            SeriliHesapla: isReceiptSerialActive,
            KayitliNumaraOtomatikGuncellensin: false,
            FatUst: strategy.buildFatUst(receipt, siparisNo, groupedLines, belTarihiStr),
            Kalems: groupedLines.map(group => {
                const useSerialForThisGroup = masterSerialActive && group.isGroupSerialActive;
                return strategy.buildKalemItem(group, useSerialForThisGroup, locationTrackingActive, scrid, siparisNo);
            })
        };

        if (typeof strategy.modifyPayload === 'function') {
            strategy.modifyPayload(payload);
        }

        const integrationResult = await netsisService.sendItemSlip(payload);

        // NetOpenX başarılı oldu. Bakiye tablolarını güncelleyelim.
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            for (const line of processedLines) {
                if (!line.StokKodu) continue;

                // Strateji sınıfını çağırarak veritabanı senkronizasyonunu yönetiyoruz
                await strategy.syncDatabase(transaction, receipt, line, scrid);
            }
            await transaction.commit();
        } catch (dbError) {
            await transaction.rollback();
            console.error('[DB Balance Sync Error]:', dbError);
            throw dbError;
        }

        let generatedBelgeNo = null;
        try {
            const resultStr = JSON.stringify(integrationResult);
            const match = resultStr.match(/"FATIRS_NO"\s*:\s*"([^"]+)"/i) || resultStr.match(/"FatIrs_No"\s*:\s*"([^"]+)"/i);
            if (match && match[1]) {
                generatedBelgeNo = match[1];
            }
        } catch (e) {
            console.error('Error extracting FATIRS_NO:', e);
        }
        let updateQuery = 'UPDATE WMS_Receipts SET IntegrationStatus = 1, IntegrationErrorDesc = NULL, RetryCount = 0 WHERE ReceiptID = @id';

        if (generatedBelgeNo) {
            updateQuery = 'UPDATE WMS_Receipts SET IntegrationStatus = 1, IntegrationErrorDesc = NULL, RetryCount = 0, BelgeNo = @belgeNo WHERE ReceiptID = @id';
        }

        const req = pool.request().input('id', sql.Int, receipt.ReceiptID);
        if (generatedBelgeNo) {
            req.input('belgeNo', sql.NVarChar, generatedBelgeNo);
        }
        await req.query(updateQuery);

        return { receiptId: receipt.ReceiptID, status: 'Success', detail: integrationResult };
    } catch (err) {
        const errorDesc = err.message || 'Entegrasyon Hatası';
        await pool.request().input('id', sql.Int, receipt.ReceiptID).input('err', sql.NVarChar, errorDesc).query('UPDATE WMS_Receipts SET IntegrationStatus = 2, IntegrationErrorDesc = @err, RetryCount = RetryCount + 1 WHERE ReceiptID = @id');
        return { receiptId: receipt.ReceiptID, status: 'Error', error: errorDesc };
    }
}

/**
 * Sıralı Kuyruk (Mutex) Wrapper Servisi.
 * Aynı anda birden fazla aktarım tetiklenirse, birinin bitmesini bekler veya arka plandaki döngüye bırakır.
 */
exports.sendToNetsis = async (req, res) => {
    let lockAcquired = false;
    try {
        const { receiptId } = req.body || {};
        const { poolPromise, sql } = require('../config/db');
        const pool = await poolPromise;

        // 1. Sıralı kuyruk çalışıyorsa ve spesifik bir fiş hedeflenmemişse hemen çık (Return)
        if (isQueueProcessing && !receiptId) {
            console.log('[NetOpenX Queue] Entegrasyon kuyruğu zaten çalışıyor. Yeni istek arka planda işlenecektir.');
            return res.json({ success: true, message: 'Kuyruk arka planda zaten aktif. Belgeler sırayla aktarılacaktır.' });
        }

        // Eğer kuyruk çalışıyorsa ama spesifik bir tekil fiş aktarılmak isteniyorsa, kuyruğun boşalmasını beklemeliyiz
        if (isQueueProcessing && receiptId) {
            console.warn(`[NetOpenX Queue] Fiş #${receiptId} için istek geldi ancak kuyruk şu an meşgul. Lütfen bekleyin.`);
            return res.status(409).json({ success: false, message: 'Entegrasyon kuyruğu şu an meşgul. Lütfen daha sonra tekrar deneyin.' });
        }

        // Kuyruğu kilitle
        isQueueProcessing = true;
        lockAcquired = true;
        let results = [];

        // 2. TEKİL (Manuel) Fiş Aktarımı
        if (receiptId) {
            console.log(`[NetOpenX Queue] Fiş #${receiptId} için manuel tekil aktarım başlatılıyor.`);
            const receiptReq = await pool.request()
                .input('rid', sql.Int, receiptId)
                .query('SELECT * FROM WMS_Receipts WHERE ReceiptID = @rid');
            const receipt = receiptReq.recordset[0];

            if (!receipt) {
                return res.status(404).json({ success: false, message: 'Aktarılacak belge bulunamadı.' });
            }

            if (receipt.IntegrationStatus === 4) {
                console.log(`[NetOpenX Queue] Fiş #${receiptId} onay beklediği için aktarım atlandı.`);
                return res.json({ success: true, message: 'Belge onay beklediği için aktarım kuyruğuna alınmadı.', status: 'pending_approval' });
            }

            // Geçici olarak durumunu "Processing (3)" yapıyoruz
            await pool.request().input('id', sql.Int, receipt.ReceiptID).query('UPDATE WMS_Receipts SET IntegrationStatus = 3 WHERE ReceiptID = @id');

            const result = await processSingleReceipt(receipt, pool, sql);
            results.push(result);

            return res.json({ success: true, processedCount: 1, details: results });
        }

        // 3. TOPLU (Kuyruk) Fiş Aktarımı - Self-Healing Queue Döngüsü
        console.log('[NetOpenX Queue] Sıralı aktarım döngüsü başlatılıyor...');
        let processedCount = 0;

        while (true) {
            // Her döngüde IntegrationStatus = 0 veya (IntegrationStatus = 2 ve RetryCount < 3) olan en eski 1 (TOP 1) kaydı çekiyoruz
            const nextReceiptReq = await pool.request().query('SELECT TOP 1 * FROM WMS_Receipts WHERE IntegrationStatus = 0 OR (IntegrationStatus = 2 AND RetryCount < 3) ORDER BY CreatedAt ASC');
            const receipt = nextReceiptReq.recordset[0];

            // İşlenecek bekleyen kayıt kalmadıysa döngüden çık
            if (!receipt) {
                console.log('[NetOpenX Queue] Aktarılacak bekleyen belge kalmadı. Kuyruk sonlandırılıyor.');
                break;
            }

            console.log(`[NetOpenX Queue] Kuyruktaki fiş işleniyor -> FişID: ${receipt.ReceiptID} (Mevcut Retry: ${receipt.RetryCount || 0})`);

            // Diğer paralel işlemlerin aynı fişi seçmemesi için durumu hemen "Processing (3)" yapıyoruz
            await pool.request().input('id', sql.Int, receipt.ReceiptID).query('UPDATE WMS_Receipts SET IntegrationStatus = 3 WHERE ReceiptID = @id');

            try {
                // Tek tek sıralı olarak aktarımı çağırıp sonucunu bekliyoruz (Promise.all YOK, tamamen sıralı)
                const result = await processSingleReceipt(receipt, pool, sql);
                results.push(result);
                processedCount++;
            } catch (innerError) {
                // İç Döngü İzolasyonu: Bir fişte hata oluşsa bile döngü asla kırılmaz, bir sonrakine geçer.
                const errorDesc = innerError.message || 'Kuyruk İçi Beklenmedik Hata';
                console.error(`[NetOpenX Queue Inner Error] Fiş #${receipt.ReceiptID} işlenirken hata oluştu:`, errorDesc);

                // Veritabanında faturanın durumunu "Hata (2)" olarak işaretle, RetryCount değerini 1 arttır ve devam et
                await pool.request()
                    .input('id', sql.Int, receipt.ReceiptID)
                    .input('err', sql.NVarChar, errorDesc)
                    .query('UPDATE WMS_Receipts SET IntegrationStatus = 2, IntegrationErrorDesc = @err, RetryCount = RetryCount + 1 WHERE ReceiptID = @id');

                results.push({ receiptId: receipt.ReceiptID, status: 'Error', error: errorDesc });
            }

            // NetOpenX Kernel'inin kendini temizlemesi ve boşa çıkması için her işlemden sonra 3 saniye bekle
            console.log('[NetOpenX Queue] İşlem tamamlandı. Yeni kernele geçmeden önce 3 saniye bekleniyor...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        return res.json({ success: true, processedCount, details: results });

    } catch (error) {
        console.error('[NetOpenX Queue System Error]:', error);
        res.status(500).json({ success: false, message: 'Kuyruk Entegrasyon Hatası: ' + error.message });
    } finally {
        if (lockAcquired) {
            // Kuyruk kilitini her durumda kaldır
            isQueueProcessing = false;
            console.log('[NetOpenX Queue] Kuyruk kilidi serbest bırakıldı (isQueueProcessing = false).');
        }
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

exports.getReceiptLines = async (req, res) => {
    try {
        const lines = await wmsService.getReceiptLines(req.params.receiptId);
        res.json({ success: true, lines });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.approveReceipt = async (req, res) => {
    try {
        await wmsService.approveReceipt(req.params.receiptId);
        res.json({ success: true, message: 'Belge onaylandı.' });
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
        const data = await wmsService.executeDynamicSQL(scrid, compid, req.query);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Drafts ---
exports.getCollectiveDrafts = async (req, res) => {
    try {
        const { cari, irsaliye } = req.query;

        if (!cari || !irsaliye) {
            return res.status(400).json({ success: false, message: 'Cari ve İrsaliye parametreleri zorunludur.' });
        }

        const { poolPromise, sql } = require('../config/db');
        const pool = await poolPromise;

        // 1. MASTER LOCK KONTROLÜ
        const lockCheck = await pool.request()
            .input('cari', sql.NVarChar, cari)
            .input('irsaliye', sql.NVarChar, irsaliye)
            .query(`
                SELECT TOP 1 ReceiptID 
                FROM WMS_Receipts 
                WHERE CariKod = @cari 
                  AND BelgeNo = @irsaliye 
                  AND IntegrationStatus IN (0, 3)
            `);

        if (lockCheck.recordset.length > 0) {
            return res.status(423).json({
                success: false,
                isCompleted: true,
                message: 'Belge başka bir kullanıcı tarafından tamamlanmıştır. (Master Lock)'
            });
        }

        // 2. KÜMÜLATİF TASLAKLARI OKUMA
        const draftsCheck = await pool.request()
            .input('cari', sql.NVarChar, cari)
            .input('irsaliye', sql.NVarChar, irsaliye)
            .query(`
                SELECT HeaderData, LineData 
                FROM WMS_TransactionDrafts 
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

        let cumulativeLines = [];
        let sharedHeader = {};
        for (const row of draftsCheck.recordset) {
            const lines = row.LineData ? JSON.parse(row.LineData) : [];
            cumulativeLines = [...cumulativeLines, ...lines];

            if (Object.keys(sharedHeader).length === 0 && row.HeaderData) {
                try {
                    sharedHeader = JSON.parse(row.HeaderData);
                } catch (e) { }
            }
        }

        return res.json({
            success: true,
            isCompleted: false,
            drafts: cumulativeLines,
            sharedHeader
        });

    } catch (error) {
        console.error("Collective Drafts (Polling) Hatası:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

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

exports.getPurchaseOrderLines = async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'orderId parametresi zorunludur.' });
        }
        const lines = await wmsService.getPurchaseOrderLines(orderId);
        res.json({ success: true, lines });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Serial Cancellation (Mal Kabul İptal) ---
exports.getSerialForCancellation = async (req, res) => {
    try {
        const { serialNo } = req.params;
        if (!serialNo) {
            return res.status(400).json({ success: false, message: 'Seri numarası zorunludur.' });
        }

        const { poolPromise, sql } = require('../config/db');
        const pool = await poolPromise;

        const result = await pool.request()
            .input('serialNo', sql.NVarChar, serialNo)
            .query(`
                SELECT 
                    st.StokKodu,
                    JSON_VALUE(rl.DynamicFieldsJSON, '$."10112"') AS UrunAdi,
                    r.BelgeNo AS IrsaliyeNo,
                    r.BelgeTarihi,
                    st.Miktar AS KabulEdilenMiktar,
                    r.CariKod AS CariBilgisi,
                    st.DepoKodu,
                    st.TransactionID
                FROM WMS_SerialTransactions st
                INNER JOIN WMS_Receipts r ON st.ReceiptID = r.ReceiptID
                INNER JOIN WMS_ReceiptLines rl ON st.LineID = rl.LineID
                WHERE st.SeriNo = @serialNo AND st.HareketYonu = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Bu seri numarasına ait giriş işlemi bulunamadı.' });
        }

        res.json({ success: true, data: result.recordset[0] });
    } catch (error) {
        console.error('getSerialForCancellation Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAcceptedSerials = async (req, res) => {
    try {
        const { poolPromise, sql } = require('../config/db');
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TOP 100
                st.SeriNo,
                st.StokKodu,
                st.Miktar,
                r.BelgeNo
            FROM WMS_SerialTransactions st
            INNER JOIN WMS_Receipts r ON st.ReceiptID = r.ReceiptID
            WHERE st.HareketYonu = 1
            ORDER BY st.TransactionID DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.cancelSerialReceipt = async (req, res) => {
    try {
        const { serialNo } = req.params;
        if (!serialNo) {
            return res.status(400).json({ success: false, message: 'Seri numarası zorunludur.' });
        }

        const { poolPromise, sql } = require('../config/db');
        const pool = await poolPromise;

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. Seriye ait işlemi bul
            const txReq = await new sql.Request(transaction)
                .input('serialNo', sql.NVarChar, serialNo)
                .query('SELECT * FROM WMS_SerialTransactions WHERE SeriNo = @serialNo AND HareketYonu = 1');

            if (txReq.recordset.length === 0) {
                throw new Error('İptal edilecek seri hareketi bulunamadı.');
            }

            const txData = txReq.recordset[0];

            // 2. WMS_SerialTransactions tablosundan kaydı sil
            await new sql.Request(transaction)
                .input('transactionId', sql.Int, txData.TransactionID)
                .query('DELETE FROM WMS_SerialTransactions WHERE TransactionID = @transactionId');

            // 3. WMS_StockBalances tablosundaki KalanMiktar değerini düşür / sil
            await new sql.Request(transaction)
                .input('stokKodu', sql.NVarChar, txData.StokKodu)
                .input('depoKodu', sql.NVarChar, txData.DepoKodu)
                .input('seriNo', sql.NVarChar, txData.SeriNo)
                .input('miktar', sql.Decimal(18, 4), txData.Miktar)
                .query(`
                    UPDATE WMS_StockBalances
                    SET KalanMiktar = KalanMiktar - @miktar
                    WHERE StokKodu = @stokKodu AND DepoKodu = @depoKodu AND ISNULL(SeriNo, '') = ISNULL(@seriNo, '')

                    DELETE FROM WMS_StockBalances
                    WHERE StokKodu = @stokKodu AND DepoKodu = @depoKodu AND ISNULL(SeriNo, '') = ISNULL(@seriNo, '') AND KalanMiktar <= 0
                `);

            // 4. WMS_ReceiptLines tablosundaki kümülatif Miktar alanından düşür
            await new sql.Request(transaction)
                .input('lineId', sql.Int, txData.LineID)
                .input('miktar', sql.Decimal(18, 4), txData.Miktar)
                .query(`
                    UPDATE WMS_ReceiptLines
                    SET Miktar = Miktar - @miktar
                    WHERE LineID = @lineId
                `);

            await transaction.commit();
            res.json({ success: true, message: 'Seri numarası kabul işlemi başarıyla iptal edildi.' });
        } catch (dbError) {
            await transaction.rollback();
            throw dbError;
        }

    } catch (error) {
        console.error('cancelSerialReceipt Error:', error);
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
