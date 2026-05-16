/**
 * Transaction Logging Middleware
 * Logs every write operation to the TransactionLogs table (placeholder).
 */
const transactionLogger = (req, res, next) => {
    // Only log write operations (POST, PUT, DELETE)
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const logData = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl,
            user: req.user ? req.user.id : 'anonymous',
            payload: req.body,
            ip: req.ip
        };

        console.log(`[TRANSACTION LOG]: ${JSON.stringify(logData)}`);
        
        // TODO: Insert logData into MSSQL TransactionLogs table
        // Example: await db.query('INSERT INTO TransactionLogs ...')
    }
    next();
};

module.exports = transactionLogger;
