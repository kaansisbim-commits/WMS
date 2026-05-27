const express = require('express');
const router = express.Router();
const wmsController = require('../controllers/wmsController');
const labelController = require('../controllers/labelController');
const authMiddleware = require('../middleware/auth');
const transactionLogger = require('../middleware/logger');

// All routes require authentication
router.use(authMiddleware);

// Apply transaction logging to all routes
router.use(transactionLogger);

// GET Data (MSSQL)
router.get('/data', wmsController.getData);
router.get('/stock-balance', wmsController.getStockBalance);
router.get('/reports/stock-balance', wmsController.getReportStockBalance);
router.get('/reports/stock-guide', wmsController.getStockGuide);

// POST Data (WMS Local Save)
router.post('/process', wmsController.postData);

// NetOpenX Integration (Worker & Logs)
router.post('/integration/send-to-netsis', wmsController.sendToNetsis);
router.post('/integration/test-connection', wmsController.testConnection);
router.get('/integration/logs', wmsController.getIntegrationLogs);
router.get('/integration/orders/:orderId/lines', wmsController.getPurchaseOrderLines);
router.get('/integration/receipts/:receiptId/lines', wmsController.getReceiptLines);
router.put('/integration/receipts/:receiptId/approve', wmsController.approveReceipt);

// GET Parameters
router.get('/parameters', wmsController.getParameters);
router.post('/parameters', wmsController.updateParameters);

// UI Design
router.get('/design', wmsController.getUIDesign);
router.post('/design', wmsController.saveUIDesign);
router.delete('/design/remove', wmsController.deleteUIDesign);
router.get('/dynamic-query', wmsController.executeDynamicSQL);

// Labels
router.post('/labels/render/:templateId', labelController.renderTemplate);
router.get('/labels/available', labelController.getAvailableLabels);

// Printers
const printerController = require('../controllers/printerController');
router.get('/printers', printerController.getPrinters);

// Traceability
router.get('/serials/next', wmsController.getNextSerial);

// Serial Cancellation
router.get('/serial-cancellation', wmsController.getAcceptedSerials);
router.get('/serial-cancellation/:serialNo', wmsController.getSerialForCancellation);
router.delete('/serial-cancellation/:serialNo', wmsController.cancelSerialReceipt);

// Drafts
router.get('/drafts/collective', wmsController.getCollectiveDrafts);
router.get('/drafts/get-active', wmsController.getActiveDraft);
router.post('/drafts/save', wmsController.saveDraft);

module.exports = router;
