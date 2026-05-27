const fs = require('fs');
const path = require('path');
const { sql, poolPromise } = require('../config/db');
const bcrypt = require('bcryptjs');

// Constants
const SCHEMA_FILE = path.join(__dirname, '../config/FormSchema.json');

// --- User Management (WMS_Users) ---

exports.getUsers = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT UserID as id, Username as [user], Role as role, IsActive as isActive FROM WMS_Users');

        const users = result.recordset;

        // Fetch permissions for all users
        for (let u of users) {
            const permResult = await pool.request()
                .input('userId', sql.Int, u.id)
                .query('SELECT s.ScreenName FROM WMS_UserPermissions up JOIN WMS_Screens s ON up.ScreenID = s.ScreenID WHERE up.UserID = @userId AND up.IsAllowed = 1');
            u.permissions = permResult.recordset.map(r => r.ScreenName);
            u.isActive = u.isActive;
        }

        res.json({ success: true, data: users });
    } catch (err) {
        console.error('getUsers error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.saveUser = async (req, res) => {
    try {
        const pool = await poolPromise;
        const { id, user, pass, role, permissions } = req.body;
        const permJSON = JSON.stringify(permissions || []);

        if (id && id.toString().length < 10) { // Checking if it's not a Date.now() string -> meaning it exists in DB (numeric ID)
            // Update Existing User
            let query = 'UPDATE WMS_Users SET Username = @user, Role = @role, PermissionsJSON = @perms, UpdatedAt = GETDATE()';
            const request = pool.request()
                .input('id', sql.Int, parseInt(id))
                .input('user', sql.NVarChar, user)
                .input('role', sql.VarChar, role)
                .input('perms', sql.NVarChar, permJSON);

            if (pass && pass.trim() !== '') {
                const salt = await bcrypt.genSalt(10);
                const hash = await bcrypt.hash(pass, salt);
                query += ', PasswordHash = @hash';
                request.input('hash', sql.NVarChar, hash);
            }

            query += ' WHERE UserID = @id';
            await request.query(query);
            res.json({ success: true, message: 'Kullanıcı güncellendi.' });

        } else {
            // Insert New User
            if (!pass) return res.status(400).json({ success: false, message: 'Şifre zorunludur.' });

            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(pass, salt);

            const result = await pool.request()
                .input('user', sql.NVarChar, user)
                .input('hash', sql.NVarChar, hash)
                .input('role', sql.VarChar, role)
                .input('perms', sql.NVarChar, permJSON)
                .query(`
                    INSERT INTO WMS_Users (Username, PasswordHash, Role, PermissionsJSON, IsActive) 
                    OUTPUT INSERTED.UserID as newId
                    VALUES (@user, @hash, @role, @perms, 1)
                `);
            res.json({ success: true, message: 'Yeni kullanıcı oluşturuldu.', newId: result.recordset[0].newId });
        }
    } catch (err) {
        console.error('saveUser error:', err);
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ success: false, message: 'Bu kullanıcı adı zaten mevcut.' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.toggleUserStatus = async (req, res) => {
    try {
        const pool = await poolPromise;
        const { id, isActive } = req.body;
        await pool.request()
            .input('id', sql.Int, parseInt(id))
            .input('isActive', sql.Bit, isActive ? 1 : 0)
            .query('UPDATE WMS_Users SET IsActive = @isActive, UpdatedAt = GETDATE() WHERE UserID = @id');

        res.json({ success: true, message: `Kullanıcı ${isActive ? 'Aktif' : 'Pasif'} yapıldı.` });
    } catch (err) {
        console.error('toggleStatus error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { user, pass } = req.body;
        const pool = await poolPromise;

        const result = await pool.request()
            .input('user', sql.NVarChar, user)
            .query('SELECT UserID as id, Username as [user], PasswordHash as pass, Role as role, PermissionsJSON as permissions, IsActive as isActive FROM WMS_Users WHERE Username = @user');

        if (result.recordset.length === 0) {
            return res.status(401).json({ success: false, message: 'Hatalı kullanıcı veya şifre!' });
        }

        const foundUser = result.recordset[0];

        if (!foundUser.isActive) {
            return res.status(403).json({ success: false, message: 'Hesabınız pasif duruma alınmıştır. Sisteme giriş yapamazsınız.' });
        }

        let isMatch = false;

        // Plain text fallback for smooth migration (if DB has plain text passwords initially)
        if (!foundUser.pass.startsWith('$2')) {
            if (foundUser.pass === pass) {
                isMatch = true;
                // Auto-hash the plain text password for future
                const salt = await bcrypt.genSalt(10);
                const hash = await bcrypt.hash(pass, salt);
                await pool.request()
                    .input('id', sql.Int, foundUser.id)
                    .input('hash', sql.NVarChar, hash)
                    .query('UPDATE WMS_Users SET PasswordHash = @hash WHERE UserID = @id');
            }
        } else {
            isMatch = await bcrypt.compare(pass, foundUser.pass);
        }

        if (isMatch) {
            // Remove password from response
            delete foundUser.pass;
            
            // Fetch dynamic permissions from DB
            const permResult = await pool.request()
                .input('userId', sql.Int, foundUser.id)
                .query(`
                    SELECT s.ScreenID, s.ScreenName, s.SCRID, s.RoutePath 
                    FROM WMS_UserPermissions up
                    JOIN WMS_Screens s ON up.ScreenID = s.ScreenID
                    WHERE up.UserID = @userId AND up.IsAllowed = 1 AND s.IsActive = 1
                `);

            // Map RoutePath (e.g., '/mal-kabul') to string identifier ('mal-kabul') for frontend compatibility
            foundUser.permissions = permResult.recordset.map(r => r.RoutePath.replace('/', ''));
            foundUser.dynamicScreens = permResult.recordset;

            res.json({ success: true, data: foundUser, token: 'Admin123Token' });
        } else {
            res.status(401).json({ success: false, message: 'Hatalı kullanıcı veya şifre!' });
        }
    } catch (err) {
        console.error('login error:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
};

// --- Schema Management (Legacy JSON) ---
exports.getSchema = (req, res) => {
    try {
        if (!fs.existsSync(SCHEMA_FILE)) return res.status(404).json({ success: false, message: 'Şema dosyası bulunamadı.' });
        res.json({ success: true, data: JSON.parse(fs.readFileSync(SCHEMA_FILE)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.saveSchema = (req, res) => {
    fs.writeFileSync(SCHEMA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true, message: 'Ekran şeması kaydedildi.' });
};

// --- Dynamic Screen Permissions ---
exports.getScreens = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT ScreenID, ScreenName, SCRID, RoutePath FROM WMS_Screens WHERE IsActive = 1 ORDER BY ScreenID ASC');
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('getScreens error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getUserPermissions = async (req, res) => {
    try {
        const pool = await poolPromise;
        const { userId } = req.params;
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query('SELECT ScreenID FROM WMS_UserPermissions WHERE UserID = @userId AND IsAllowed = 1');
        res.json({ success: true, data: result.recordset.map(r => r.ScreenID) });
    } catch (err) {
        console.error('getUserPermissions error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateUserPermissions = async (req, res) => {
    try {
        const pool = await poolPromise;
        const { userId } = req.params;
        const { screenIds } = req.body; // array of ScreenID integers

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const request = new sql.Request(transaction);
            await request
                .input('userId', sql.Int, userId)
                .query('DELETE FROM WMS_UserPermissions WHERE UserID = @userId');

            if (screenIds && Array.isArray(screenIds) && screenIds.length > 0) {
                for (const screenId of screenIds) {
                    const insertReq = new sql.Request(transaction);
                    await insertReq
                        .input('userId', sql.Int, userId)
                        .input('screenId', sql.Int, screenId)
                        .query('INSERT INTO WMS_UserPermissions (UserID, ScreenID, IsAllowed) VALUES (@userId, @screenId, 1)');
                }
            }

            await transaction.commit();
            res.json({ success: true, message: 'Yetkiler başarıyla güncellendi.' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('updateUserPermissions error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

