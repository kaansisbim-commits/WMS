const { sql } = require('../../config/db');

class DefaultStrategy {
    buildFatUst(receipt, siparisNo, groupedLines, belTarihiStr) {
        let fatUstCariKod = receipt.CariKod;
        if (siparisNo && groupedLines.length > 0 && groupedLines[0].STHAR_ACIKLAMA) {
            fatUstCariKod = groupedLines[0].STHAR_ACIKLAMA;
        }

        return {
            CariKod: fatUstCariKod,
            Tarih: belTarihiStr,
            TIPI: 2,
            KDV_DAHILMI: false,
            Tip: 3, // Standart mal kabul vs için Tip=3
            FATIRS_NO: receipt.BelgeNo || '',
            SUBE_KODU: parseInt(process.env.NETOPENX_BRANCH || '0'),
            PROJE_KODU: "0",
            SIPARIS_TEST: belTarihiStr
        };
    }

    buildKalemItem(group, useSerialForThisGroup, locationTrackingActive, scrid, siparisNo) {
        let finalItemDepoKodu = 0;
        if (locationTrackingActive && group.DepoKodu) {
            const parsedDepo = parseInt(group.DepoKodu);
            if (!isNaN(parsedDepo)) {
                finalItemDepoKodu = parsedDepo;
            }
        }

        const item = {
            SeriTakibi: useSerialForThisGroup ? "E" : "H",
            StokKodu: group.StokKodu,
            STra_GCMIK: group.TotalMiktar,
            DEPO_KODU: finalItemDepoKodu,
            STra_Sube: parseInt(process.env.NETOPENX_BRANCH || '0')
        };

        if (siparisNo || group.STra_SIPNUM) {
            item.STra_SIPNUM = group.STra_SIPNUM || siparisNo;
            if (group.STHAR_NF !== undefined) item.STra_NF = group.STHAR_NF;
            if (group.STHAR_BF !== undefined) item.Stra_BF = group.STHAR_BF;
            if (group.STRA_SIPKONT !== undefined) item.STRA_SIPKONT = group.STRA_SIPKONT;
        }

        if (useSerialForThisGroup && group.SeriListesi.length > 0) {
            item.KalemSeri = group.SeriListesi;
        }

        return item;
    }

    async syncDatabase(transaction, receipt, line, scrid) {
        const stokKodu = line.StokKodu;
        const miktar = parseFloat(line.Miktar || 0);
        const seriNo = line.SeriNo || null;
        const lotVal = line._lotNo || null;
        const finalDepoKodu = String(line._depoKodu || '0');
        const lineId = line.LineID;

        // 1. WMS_SerialTransactions Tablosuna Yaz (HareketYonu = 1: Giriş)
        await new sql.Request(transaction)
            .input('ReceiptID', sql.Int, receipt.ReceiptID)
            .input('LineID', sql.Int, lineId)
            .input('StokKodu', sql.NVarChar, stokKodu)
            .input('HareketYonu', sql.SmallInt, 1)
            .input('Miktar', sql.Decimal(18, 4), miktar)
            .input('SeriNo', sql.NVarChar, seriNo)
            .input('LotNo', sql.NVarChar, lotVal)
            .input('DepoKodu', sql.NVarChar, finalDepoKodu)
            .query(`
                INSERT INTO WMS_SerialTransactions (ReceiptID, LineID, StokKodu, HareketYonu, Miktar, SeriNo, LotNo, DepoKodu)
                VALUES (@ReceiptID, @LineID, @StokKodu, @HareketYonu, @Miktar, @SeriNo, @LotNo, @DepoKodu)
            `);

        // 2. WMS_StockBalances Tablosunu Güncelle (Upsert: Varsa ekle, yoksa yarat)
        await new sql.Request(transaction)
            .input('StokKodu', sql.NVarChar, stokKodu)
            .input('DepoKodu', sql.NVarChar, finalDepoKodu)
            .input('SeriNo', sql.NVarChar, seriNo)
            .input('LotNo', sql.NVarChar, lotVal)
            .input('Miktar', sql.Decimal(18, 4), miktar)
            .query(`
                UPDATE WMS_StockBalances
                SET KalanMiktar = ISNULL(KalanMiktar, 0) + @Miktar, LastUpdatedAt = GETDATE()
                WHERE StokKodu = @StokKodu AND DepoKodu = @DepoKodu 
                  AND ISNULL(SeriNo, '') = ISNULL(@SeriNo, '') 
                  AND ISNULL(LotNo, '') = ISNULL(@LotNo, '')

                IF @@ROWCOUNT = 0
                BEGIN
                    INSERT INTO WMS_StockBalances (StokKodu, DepoKodu, SeriNo, LotNo, KalanMiktar)
                    VALUES (@StokKodu, @DepoKodu, @SeriNo, @LotNo, @Miktar)
                END
            `);
    }
}

module.exports = DefaultStrategy;
