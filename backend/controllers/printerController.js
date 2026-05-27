const { poolPromise } = require('../config/db');
const sql = require('mssql');

// Admin & User: Get all printers (optionally filter by IsActive)
exports.getPrinters = async (req, res) => {
    try {
        const pool = await poolPromise;
        const { activeOnly } = req.query;
        let query = 'SELECT * FROM WMS_Printers';
        
        if (activeOnly === 'true') {
            query += ' WHERE IsActive = 1';
        }
        
        const result = await pool.request().query(query);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('[PrinterController] getPrinters Error:', err);
        res.status(500).json({ success: false, message: 'Yazıcılar yüklenirken hata oluştu.' });
    }
};

// Admin: Save or Update Printer
exports.savePrinter = async (req, res) => {
    const { printerId, printerName, connectionMethod, ipAddress, port, isActive } = req.body;
    
    if (!printerName || !connectionMethod) {
        return res.status(400).json({ success: false, message: 'Yazıcı adı ve bağlantı yöntemi zorunludur.' });
    }
    
    try {
        const pool = await poolPromise;
        
        if (printerId) {
            // Update
            await pool.request()
                .input('Id', sql.Int, printerId)
                .input('Name', sql.NVarChar, printerName)
                .input('Method', sql.VarChar, connectionMethod)
                .input('IP', sql.VarChar, ipAddress || null)
                .input('Port', sql.Int, port || 9100)
                .input('Active', sql.Bit, isActive !== undefined ? isActive : 1)
                .query(`
                    UPDATE WMS_Printers
                    SET PrinterName = @Name, ConnectionMethod = @Method, IPAddress = @IP, Port = @Port, IsActive = @Active
                    WHERE PrinterID = @Id
                `);
            res.json({ success: true, message: 'Yazıcı başarıyla güncellendi.' });
        } else {
            // Insert
            await pool.request()
                .input('Name', sql.NVarChar, printerName)
                .input('Method', sql.VarChar, connectionMethod)
                .input('IP', sql.VarChar, ipAddress || null)
                .input('Port', sql.Int, port || 9100)
                .input('Active', sql.Bit, isActive !== undefined ? isActive : 1)
                .query(`
                    INSERT INTO WMS_Printers (PrinterName, ConnectionMethod, IPAddress, Port, IsActive)
                    VALUES (@Name, @Method, @IP, @Port, @Active)
                `);
            res.json({ success: true, message: 'Yazıcı başarıyla eklendi.' });
        }
    } catch (err) {
        console.error('[PrinterController] savePrinter Error:', err);
        res.status(500).json({ success: false, message: 'Yazıcı kaydedilirken hata oluştu.' });
    }
};
