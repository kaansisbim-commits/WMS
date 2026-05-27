require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const wmsRoutes = require('./routes/wms');
const authController = require('./controllers/authController');
const labelController = require('./controllers/labelController');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({ origin: true, credentials: true })); // Allow all for debugging
app.use(express.json());
app.use(morgan('dev')); // Request logging

// Routes
app.post('/api/auth/login', authController.login);
app.get('/api/admin/users', authController.getUsers);
app.post('/api/admin/users', authController.saveUser);
app.put('/api/admin/users/toggle-status', authController.toggleUserStatus);
app.get('/api/admin/schema', authController.getSchema);
app.post('/api/admin/schema', authController.saveSchema);
app.get('/api/admin/screens', authController.getScreens);
app.get('/api/admin/users/:userId/permissions', authController.getUserPermissions);
app.post('/api/admin/users/:userId/permissions', authController.updateUserPermissions);

app.get('/api/admin/label-templates', labelController.getTemplates);
app.post('/api/admin/label-templates', labelController.saveTemplate);

const printerController = require('./controllers/printerController');
app.get('/api/admin/printers', printerController.getPrinters);
app.post('/api/admin/printers', printerController.savePrinter);

app.use('/api/wms', wmsRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Start Server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`WMS Backend Sunucusu ${PORT} portunda (Tüm arayüzlerde) çalışıyor...`);
    
    // Otomatik Kolon Kontrolü (Self-Healing Migration) ve Arayüz Senkronizasyonu
    try {
        const { poolPromise } = require('./config/db');
        const pool = await poolPromise;
        console.log('[Database Migration] WMS_Receipts tablosu RetryCount kolonu kontrol ediliyor...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('WMS_Receipts') AND name = 'RetryCount')
            BEGIN
                ALTER TABLE WMS_Receipts ADD RetryCount INT NOT NULL DEFAULT 0;
                PRINT 'RetryCount kolonu başarıyla eklendi.';
            END
        `);
        console.log('[Database Migration] Şema uyumluluğu doğrulandı.');

        console.log('[Database Migration] WMS_LabelTemplates tablosu kontrol ediliyor...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WMS_LabelTemplates]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[WMS_LabelTemplates](
                    [TemplateID] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    [TemplateName] [nvarchar](255) NOT NULL,
                    [ProcessCode] [varchar](50) NULL,
                    [WidthMM] [int] NOT NULL DEFAULT 50,
                    [HeightMM] [int] NOT NULL DEFAULT 30,
                    [DesignSchemaJSON] [nvarchar](max) NULL,
                    [TargetScreens] [nvarchar](500) NULL,
                    [IsActive] [bit] NOT NULL DEFAULT 1,
                    [CreatedAt] [datetime] NOT NULL DEFAULT GETDATE()
                );
                PRINT 'WMS_LabelTemplates tablosu oluşturuldu.';
            END
            ELSE
            BEGIN
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('WMS_LabelTemplates') AND name = 'TargetScreens')
                BEGIN
                    ALTER TABLE WMS_LabelTemplates ADD TargetScreens NVARCHAR(500) NULL;
                    PRINT 'TargetScreens kolonu WMS_LabelTemplates tablosuna eklendi.';
                END
            END
        `);

        console.log('[Database Migration] WMS_Printers tablosu kontrol ediliyor...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WMS_Printers]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[WMS_Printers](
                    [PrinterID] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    [PrinterName] [nvarchar](255) NOT NULL,
                    [ConnectionMethod] [varchar](50) NOT NULL DEFAULT 'NETWORK',
                    [IPAddress] [varchar](50) NULL,
                    [Port] [int] NOT NULL DEFAULT 9100,
                    [IsActive] [bit] NOT NULL DEFAULT 1
                );
                PRINT 'WMS_Printers tablosu oluşturuldu.';
            END
        `);

        // İrsaliye Numarası alanını zorunlu ve 15 karakter olarak güncelle
        console.log('[Database Migration] İrsaliye Numarası alan gereksinimleri güncelleniyor...');
        await pool.request().query(`
            UPDATE WMS_UIDesign 
            SET IsRequired = 1, MaxLength = 15 
            WHERE SCRID IN (101, 102) AND (LabelText LIKE '%İrsaliye%' OR COMPID IN (1002, 10102))
        `);

        // Parametre görünürlüklerini sunucu başlangıcında otomatik eşitleyelim
        console.log('[Database Migration] Sistem parametreleri ve arayüz görünürlükleri senkronize ediliyor...');
        const wmsService = require('./services/wmsService');
        const params = await wmsService.getSystemParameters();
        for (const param of params) {
            await wmsService._handleUIDynamicTriggers(pool, param.key, param.value);
        }
        console.log('[Database Migration] Arayüz senkronizasyonu tamamlandı.');
    } catch (migrationErr) {
        console.error('[Database Migration Error] Otomatik şema güncellemesi/senkronizasyonu başarısız:', migrationErr.message);
    }
});
