const { sql, poolPromise } = require('./config/db');

async function run() {
    try {
        const pool = await poolPromise;
        
        // 1. Create WMS_SerialTransactions
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WMS_SerialTransactions]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[WMS_SerialTransactions](
                    [TransactionID] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    [ReceiptID] [int] NULL,
                    [LineID] [int] NULL,
                    [StokKodu] [nvarchar](50) NULL,
                    [HareketYonu] [smallint] NULL,
                    [Miktar] [decimal](18, 4) NULL,
                    [SeriNo] [nvarchar](50) NULL,
                    [LotNo] [nvarchar](50) NULL,
                    [UretimTarihi] [datetime] NULL,
                    [SKT] [datetime] NULL,
                    [DepoKodu] [nvarchar](50) NULL,
                    [CreatedAt] [datetime] DEFAULT GETDATE(),
                    CONSTRAINT FK_SerialTransactions_Receipts FOREIGN KEY (ReceiptID) REFERENCES WMS_Receipts(ReceiptID),
                    CONSTRAINT FK_SerialTransactions_Lines FOREIGN KEY (LineID) REFERENCES WMS_ReceiptLines(LineID) ON DELETE CASCADE
                )
            END
        `);
        console.log('WMS_SerialTransactions table created.');

        // Indexes for WMS_SerialTransactions
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_WMS_SerialTransactions_StokKodu' AND object_id = OBJECT_ID('WMS_SerialTransactions'))
            BEGIN
                CREATE NONCLUSTERED INDEX [IX_WMS_SerialTransactions_StokKodu] ON [dbo].[WMS_SerialTransactions] ([StokKodu])
            END
            
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_WMS_SerialTransactions_SeriNo' AND object_id = OBJECT_ID('WMS_SerialTransactions'))
            BEGIN
                CREATE NONCLUSTERED INDEX [IX_WMS_SerialTransactions_SeriNo] ON [dbo].[WMS_SerialTransactions] ([SeriNo])
            END

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_WMS_SerialTransactions_LotNo' AND object_id = OBJECT_ID('WMS_SerialTransactions'))
            BEGIN
                CREATE NONCLUSTERED INDEX [IX_WMS_SerialTransactions_LotNo] ON [dbo].[WMS_SerialTransactions] ([LotNo])
            END
        `);
        console.log('Indexes for WMS_SerialTransactions created.');

        // 2. Create WMS_StockBalances
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WMS_StockBalances]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[WMS_StockBalances](
                    [BalanceID] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    [StokKodu] [nvarchar](50) NOT NULL,
                    [DepoKodu] [nvarchar](50) NOT NULL,
                    [SeriNo] [nvarchar](50) NULL,
                    [LotNo] [nvarchar](50) NULL,
                    [KalanMiktar] [decimal](18, 4) NULL,
                    [LastUpdatedAt] [datetime] DEFAULT GETDATE(),
                    CONSTRAINT UQ_WMS_StockBalances UNIQUE (StokKodu, DepoKodu, SeriNo, LotNo)
                )
            END
        `);
        console.log('WMS_StockBalances table created.');

        process.exit(0);
    } catch (err) {
        console.error('Error creating tables:', err);
        process.exit(1);
    }
}

run();
