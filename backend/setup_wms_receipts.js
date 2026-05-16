const { sql, poolPromise } = require('./config/db');

async function run() {
    try {
        const pool = await poolPromise;
        
        // 1. Create WMS_Receipts
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WMS_Receipts]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[WMS_Receipts](
                    [ReceiptID] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    [CariKod] [nvarchar](50) NULL,
                    [BelgeNo] [nvarchar](50) NULL,
                    [BelgeTarihi] [datetime] NULL,
                    [CreatedBy] [nvarchar](50) NULL,
                    [CreatedAt] [datetime] DEFAULT GETDATE(),
                    [IntegrationStatus] [int] DEFAULT 0,
                    [IntegrationErrorDesc] [nvarchar](max) NULL,
                    [NetsisDekontNo] [nvarchar](50) NULL,
                    [RawHeaderJSON] [nvarchar](max) NULL
                )
            END
        `);
        console.log('WMS_Receipts table ready.');

        // 2. Create WMS_ReceiptLines
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WMS_ReceiptLines]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[WMS_ReceiptLines](
                    [LineID] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    [ReceiptID] [int] NOT NULL,
                    [StokKodu] [nvarchar](50) NULL,
                    [Miktar] [decimal](18, 4) NULL,
                    [Birim] [nvarchar](20) NULL,
                    [SeriNo] [nvarchar](50) NULL,
                    [LotNo] [nvarchar](50) NULL,
                    [DepoKodu] [int] NULL,
                    [RawLineJSON] [nvarchar](max) NULL,
                    FOREIGN KEY (ReceiptID) REFERENCES WMS_Receipts(ReceiptID) ON DELETE CASCADE
                )
            END
        `);
        console.log('WMS_ReceiptLines table ready.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
