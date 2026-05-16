const express = require('express');
const router = express.Router();
const wmsController = require('../controllers/wmsController');
const authMiddleware = require('../middleware/auth');
const transactionLogger = require('../middleware/logger');

// All routes require authentication
router.use(authMiddleware);

// Apply transaction logging to all routes
router.use(transactionLogger);

// GET Data (MSSQL)
router.get('/data', wmsController.getData);

// POST Data (WMS Local Save)
router.post('/process', wmsController.postData);

// NetOpenX Integration (Worker & Logs)
router.post('/integration/send-to-netsis', wmsController.sendToNetsis);
router.post('/integration/test-connection', wmsController.testConnection);
router.get('/integration/logs', wmsController.getIntegrationLogs);


// GET Parameters
router.get('/parameters', wmsController.getParameters);
router.post('/parameters', wmsController.updateParameters);

// UI Design
router.get('/design', wmsController.getUIDesign);
router.post('/design', wmsController.saveUIDesign);
router.delete('/design/remove', wmsController.deleteUIDesign);
router.get('/dynamic-query', wmsController.executeDynamicSQL);

// Traceability
router.get('/serials/next', wmsController.getNextSerial);

// Drafts
router.get('/drafts/get-active', wmsController.getActiveDraft);
router.post('/drafts/save', wmsController.saveDraft);

module.exports = router;
