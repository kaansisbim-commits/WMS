require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const wmsRoutes = require('./routes/wms');
const authController = require('./controllers/authController');

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

app.use('/api/wms', wmsRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`WMS Backend Sunucusu ${PORT} portunda (Tüm arayüzlerde) çalışıyor...`);
});
