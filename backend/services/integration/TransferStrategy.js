const { sql } = require('../../config/db');

class TransferStrategy {
    buildFatUst(receipt, siparisNo, groupedLines, belTarihiStr) {
        return {
            CariKod: "000000000000000",
            Tarih: belTarihiStr,
            TIPI: 2,
            KDV_DAHILMI: false,
            Tip: 5, // 201 Transfer ekranı Ambar Fişi tipindedir
            // FATIRS_NO: receipt.BelgeNo || '', // FATIRS_NO gönderilmeyecek
            SUBE_KODU: parseInt(process.env.NETOPENX_BRANCH || '0'),
            PROJE_KODU: "0",
            SIPARIS_TEST: belTarihiStr
        };
    }

    modifyPayload(payload) {
        // Ambar fişi transferlerinde Seri ana dizinde gönderilmeli
        payload.Seri = "DAT";
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
            DEPO_KODU: parseInt(group.KaynakDepo || 0),
            Gir_Depo_Kodu: parseInt(group.HedefDepo || 0),
            STra_Sube: parseInt(process.env.NETOPENX_BRANCH || '0'),
            STra_GC: "C",
            STra_FTIRSIP: "8"
        };

        if (useSerialForThisGroup && group.SeriListesi.length > 0) {
            item.KalemSeri = group.SeriListesi.map(s => ({ ...s, HareketTip: 2 }));
        }

        return item;
    }

    async syncDatabase(transaction, receipt, line, scrid) {
        const stokKodu = line.StokKodu;
        const miktar = parseFloat(line.Miktar || 0);
        const seriNo = line.SeriNo || null;
        const lotVal = line._lotNo || null;
        const lineId = line.LineID;
        const kaynak = String(line._kaynakDepo || '0');
        const hedef = String(line._hedefDepo || '0');

        // Kaynak Depo Çıkışı (-1)
        await new sql.Request(transaction)
            .input('ReceiptID', sql.Int, receipt.ReceiptID)
            .input('LineID', sql.Int, lineId)
            .input('StokKodu', sql.NVarChar, stokKodu)
            .input('HareketYonu', sql.SmallInt, -1)
            .input('Miktar', sql.Decimal(18, 4), miktar)
            .input('SeriNo', sql.NVarChar, seriNo)
            .input('LotNo', sql.NVarChar, lotVal)
            .input('DepoKodu', sql.NVarChar, kaynak)
            .query(`
                INSERT INTO WMS_SerialTransactions (ReceiptID, LineID, StokKodu, HareketYonu, Miktar, SeriNo, LotNo, DepoKodu)
                VALUES (@ReceiptID, @LineID, @StokKodu, @HareketYonu, @Miktar, @SeriNo, @LotNo, @DepoKodu)
            `);

        // Kaynak Depo Bakiye Düş
        await new sql.Request(transaction)
            .input('StokKodu', sql.NVarChar, stokKodu)
            .input('DepoKodu', sql.NVarChar, kaynak)
            .input('SeriNo', sql.NVarChar, seriNo)
            .input('LotNo', sql.NVarChar, lotVal)
            .input('Miktar', sql.Decimal(18, 4), miktar)
            .query(`
                UPDATE WMS_StockBalances
                SET KalanMiktar = ISNULL(KalanMiktar, 0) - @Miktar, LastUpdatedAt = GETDATE()
                WHERE StokKodu = @StokKodu AND DepoKodu = @DepoKodu 
                  AND ISNULL(SeriNo, '') = ISNULL(@SeriNo, '') 
                  AND ISNULL(LotNo, '') = ISNULL(@LotNo, '')
            `);

        // Hedef Depo Girişi (1)
        await new sql.Request(transaction)
            .input('ReceiptID', sql.Int, receipt.ReceiptID)
            .input('LineID', sql.Int, lineId)
            .input('StokKodu', sql.NVarChar, stokKodu)
            .input('HareketYonu', sql.SmallInt, 1)
            .input('Miktar', sql.Decimal(18, 4), miktar)
            .input('SeriNo', sql.NVarChar, seriNo)
            .input('LotNo', sql.NVarChar, lotVal)
            .input('DepoKodu', sql.NVarChar, hedef)
            .query(`
                INSERT INTO WMS_SerialTransactions (ReceiptID, LineID, StokKodu, HareketYonu, Miktar, SeriNo, LotNo, DepoKodu)
                VALUES (@ReceiptID, @LineID, @StokKodu, @HareketYonu, @Miktar, @SeriNo, @LotNo, @DepoKodu)
            `);

        // Hedef Depo Bakiye Artır (Upsert)
        await new sql.Request(transaction)
            .input('StokKodu', sql.NVarChar, stokKodu)
            .input('DepoKodu', sql.NVarChar, hedef)
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

module.exports = TransferStrategy;
