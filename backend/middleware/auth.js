/**
 * Simple Authentication Middleware
 * Checks for a static token in the Authorization header.
 */
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.AUTH_TOKEN || 'Admin123Token';

    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
        return res.status(401).json({
            success: false,
            message: 'Yetkisiz erişim. Lütfen giriş yapın.'
        });
    }

    // In a real app, you would decode JWT or check session here.
    req.user = { id: 'admin', role: 'admin' };
    next();
};

module.exports = authMiddleware;
