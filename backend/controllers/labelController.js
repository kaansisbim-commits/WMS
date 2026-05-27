const { poolPromise } = require('../config/db');
const sql = require('mssql');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

// Get all label templates
exports.getTemplates = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`SELECT * FROM WMS_LabelTemplates WHERE IsActive = 1 ORDER BY CreatedAt DESC`);
        
        // Parse JSON strings to actual JSON objects for the frontend
        const templates = result.recordset.map(row => ({
            ...row,
            DesignSchemaJSON: row.DesignSchemaJSON ? JSON.parse(row.DesignSchemaJSON) : [],
            TargetScreens: row.TargetScreens ? JSON.parse(row.TargetScreens) : []
        }));

        res.json({ success: true, data: templates });
    } catch (err) {
        console.error('[LabelController] getTemplates Error:', err);
        res.status(500).json({ success: false, message: 'Şablonlar yüklenirken bir hata oluştu.' });
    }
};

// Save a label template
exports.saveTemplate = async (req, res) => {
    const { templateId, templateName, processCode, widthMM, heightMM, designSchema, targetScreens } = req.body;

    if (!templateName || !widthMM || !heightMM || !designSchema) {
        return res.status(400).json({ success: false, message: 'Gerekli alanlar eksik.' });
    }

    try {
        const pool = await poolPromise;
        const schemaString = JSON.stringify(designSchema);
        const targetScreensString = targetScreens ? JSON.stringify(targetScreens) : null;

        if (templateId) {
            // Update existing
            await pool.request()
                .input('Id', sql.Int, templateId)
                .input('Name', sql.NVarChar, templateName)
                .input('Code', sql.VarChar, processCode || null)
                .input('Width', sql.Int, widthMM)
                .input('Height', sql.Int, heightMM)
                .input('Schema', sql.NVarChar, schemaString)
                .input('Target', sql.NVarChar, targetScreensString)
                .query(`
                    UPDATE WMS_LabelTemplates 
                    SET TemplateName = @Name, ProcessCode = @Code, WidthMM = @Width, HeightMM = @Height, DesignSchemaJSON = @Schema, TargetScreens = @Target
                    WHERE TemplateID = @Id
                `);
            res.json({ success: true, message: 'Şablon başarıyla güncellendi.', templateId });
        } else {
            // Insert new
            const result = await pool.request()
                .input('Name', sql.NVarChar, templateName)
                .input('Code', sql.VarChar, processCode || null)
                .input('Width', sql.Int, widthMM)
                .input('Height', sql.Int, heightMM)
                .input('Schema', sql.NVarChar, schemaString)
                .input('Target', sql.NVarChar, targetScreensString)
                .query(`
                    INSERT INTO WMS_LabelTemplates (TemplateName, ProcessCode, WidthMM, HeightMM, DesignSchemaJSON, TargetScreens, IsActive)
                    OUTPUT inserted.TemplateID
                    VALUES (@Name, @Code, @Width, @Height, @Schema, @Target, 1)
                `);
            res.json({ success: true, message: 'Şablon başarıyla kaydedildi.', templateId: result.recordset[0].TemplateID });
        }
    } catch (err) {
        console.error('[LabelController] saveTemplate Error:', err);
        res.status(500).json({ success: false, message: 'Şablon kaydedilirken bir hata oluştu.' });
    }
};

// Helper: Replace variables in string (e.g. {SeriNo} -> 12345)
const replaceVariables = (text, data) => {
    if (!text) return '';
    let result = String(text);
    for (const [key, value] of Object.entries(data)) {
        // Escape the key and add curly braces explicitly escaped for regex
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\{${escapedKey}\\}`, 'g');
        result = result.replace(regex, value !== undefined && value !== null ? String(value) : '');
    }
    return result;
};

// Turkish character replacement to avoid PDFKit WinAnsi errors
const replaceTurkishChars = (str) => {
    if (!str) return '';
    const map = {
        'ç': 'c', 'Ç': 'C',
        'ğ': 'g', 'Ğ': 'G',
        'ı': 'i', 'I': 'I', 'İ': 'I',
        'ö': 'o', 'Ö': 'O',
        'ş': 's', 'Ş': 'S',
        'ü': 'u', 'Ü': 'U'
    };
    return str.replace(/[çÇğĞıIİöÖşŞüÜ]/g, match => map[match]);
};

// Generate ZPL from schema
const generateZPL = (schema, width, height, data) => {
    // 8 dots per mm is standard for 203 DPI printers
    const dpmm = 8;
    let zpl = `^XA\n^PW${width * dpmm}\n^LL${height * dpmm}\n`;

    schema.forEach(item => {
        const x = Math.round(item.x * dpmm);
        const y = Math.round(item.y * dpmm);
        const value = replaceVariables(item.value, data);

        if (item.type === 'text' || item.type === 'staticText') {
            const fontSize = Math.round((item.fontSize || 12) * dpmm / 3); // rough conversion
            zpl += `^FO${x},${y}^A0N,${fontSize},${fontSize}^FD${value}^FS\n`;
        } else if (item.type === 'barcode') {
            const heightDots = Math.round(20 * dpmm); // arbitrary 20mm height
            zpl += `^FO${x},${y}^BCN,${heightDots},Y,N,N^FD${value}^FS\n`;
        } else if (item.type === 'qrcode') {
            const mag = 4; // magnification
            zpl += `^FO${x},${y}^BQN,2,${mag}^FDQA,${value}^FS\n`;
        }
    });

    zpl += `^XZ`;
    return zpl;
};

// Generate Base64 PDF from schema
const generatePDF = (schema, widthMM, heightMM, data) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Conversion: 1 mm = 2.83465 points
            const mmToPt = 2.83465;
            
            const doc = new PDFDocument({
                size: [widthMM * mmToPt, heightMM * mmToPt],
                margin: 0
            });

            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData.toString('base64'));
            });

            // Draw elements
            for (const item of schema) {
                try {
                    const x = (item.x || 0) * mmToPt;
                    const y = (item.y || 0) * mmToPt;
                    let value = replaceVariables(item.value, data);
                    
                    // Replace Turkish chars because default Helvetica only supports WinAnsi
                    value = replaceTurkishChars(value);

                    if (item.type === 'text' || item.type === 'staticText') {
                        doc.fontSize(item.fontSize || 12).text(value, x, y);
                    } else if (item.type === 'barcode') {
                        // Simple text representation for barcode in PDF since we don't have a barcode library built into pdfkit
                        doc.rect(x, y, 150, 30).stroke(); // Placeholder box
                        doc.fontSize(10).text(`[BARCODE: ${value}]`, x + 5, y + 10);
                    } else if (item.type === 'qrcode') {
                        // Generate real QR code image
                        const qrDataUrl = await QRCode.toDataURL(value, { margin: 0 });
                        doc.image(qrDataUrl, x, y, { width: 50, height: 50 }); // Adjust size automatically to 50pt (~17mm)
                    }
                } catch(e) {
                    console.error("PDF Element Draw Error:", e);
                }
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};


// Render template to ZPL and PDF
exports.renderTemplate = async (req, res) => {
    const { templateId } = req.params;
    const renderData = req.body; // e.g. { SeriNo: "S123", StokKodu: "STK01" }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('Id', sql.Int, templateId)
            .query(`SELECT * FROM WMS_LabelTemplates WHERE TemplateID = @Id AND IsActive = 1`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Şablon bulunamadı.' });
        }

        const template = result.recordset[0];
        const schema = template.DesignSchemaJSON ? JSON.parse(template.DesignSchemaJSON) : [];
        
        // Generate ZPL
        const zpl = generateZPL(schema, template.WidthMM || 50, template.HeightMM || 30, renderData);
        
        // Generate PDF
        const pdfBase64 = await generatePDF(schema, template.WidthMM || 50, template.HeightMM || 30, renderData);

        res.json({
            success: true,
            data: {
                zpl: zpl,
                pdfBase64: pdfBase64,
                templateName: template.TemplateName
            }
        });

    } catch (err) {
        console.error('[LabelController] renderTemplate Error:', err);
        res.status(500).json({ success: false, message: 'Etiket oluşturulurken bir hata oluştu: ' + (err.message || '') });
    }
};

// Get available labels for a specific screen
exports.getAvailableLabels = async (req, res) => {
    try {
        const { scrid } = req.query;
        if (!scrid) {
            return res.status(400).json({ success: false, message: 'scrid parametresi gerekli.' });
        }

        const pool = await poolPromise;
        const result = await pool.request()
            .query(`SELECT TemplateID, TemplateName, TargetScreens FROM WMS_LabelTemplates WHERE IsActive = 1`);
            
        // Filter in memory since we stored as JSON
        const availableLabels = result.recordset.filter(row => {
            if (!row.TargetScreens) return false;
            try {
                const screens = JSON.parse(row.TargetScreens);
                return screens.includes(scrid.toString());
            } catch (e) {
                return false;
            }
        }).map(row => ({
            TemplateID: row.TemplateID,
            TemplateName: row.TemplateName
        }));

        res.json({ success: true, data: availableLabels });
    } catch (err) {
        console.error('[LabelController] getAvailableLabels Error:', err);
        res.status(500).json({ success: false, message: 'Aktif etiketler getirilirken hata oluştu.' });
    }
};
