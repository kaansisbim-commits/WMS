require('dotenv').config();
const { sql, poolPromise } = require('./config/db');

async function setupPermissions() {
    try {
        const pool = await poolPromise;
        console.log('Veritabanına bağlanıldı, yetkilendirme tabloları kontrol ediliyor...');

        // WMS_Screens Tablosu
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WMS_Screens' and xtype='U')
            BEGIN
                CREATE TABLE WMS_Screens (
                    ScreenID INT IDENTITY(1,1) PRIMARY KEY,
                    ScreenName NVARCHAR(100) NOT NULL,
                    SCRID INT,
                    RoutePath NVARCHAR(100) NOT NULL,
                    IsActive BIT DEFAULT 1
                )
                PRINT 'WMS_Screens tablosu oluşturuldu.'
            END
            ELSE
            BEGIN
                PRINT 'WMS_Screens tablosu zaten mevcut.'
            END
        `);

        // WMS_UserPermissions Tablosu
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WMS_UserPermissions' and xtype='U')
            BEGIN
                CREATE TABLE WMS_UserPermissions (
                    PermissionID INT IDENTITY(1,1) PRIMARY KEY,
                    UserID INT FOREIGN KEY REFERENCES WMS_Users(UserID),
                    ScreenID INT FOREIGN KEY REFERENCES WMS_Screens(ScreenID),
                    IsAllowed BIT DEFAULT 1,
                    UpdatedAt DATETIME DEFAULT GETDATE()
                )
                PRINT 'WMS_UserPermissions tablosu oluşturuldu.'
            END
            ELSE
            BEGIN
                PRINT 'WMS_UserPermissions tablosu zaten mevcut.'
            END
        `);

        // Insert initial screens
        const screens = [
            { name: 'Mal Kabul', scrid: 101, route: '/mal-kabul' },
            { name: 'Siparişli Mal Kabul', scrid: 102, route: '/siparisli-mal-kabul' },
            { name: 'Mal Kabul Onay', scrid: 103, route: '/mal-kabul-onay' },
            { name: 'Mal Kabul İptal', scrid: 104, route: '/mal-kabul-iptal' }
        ];

        for (const screen of screens) {
            await pool.request()
                .input('name', sql.NVarChar, screen.name)
                .input('scrid', sql.Int, screen.scrid)
                .input('route', sql.NVarChar, screen.route)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM WMS_Screens WHERE RoutePath = @route)
                    BEGIN
                        INSERT INTO WMS_Screens (ScreenName, SCRID, RoutePath) 
                        VALUES (@name, @scrid, @route)
                        PRINT 'Ekran eklendi: ' + @name
                    END
                `);
        }

        console.log('Yetkilendirme altyapısı başarıyla kuruldu.');
        process.exit(0);
    } catch (err) {
        console.error('Hata oluştu:', err);
        process.exit(1);
    }
}

setupPermissions();
