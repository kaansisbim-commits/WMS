import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import UserManagement from './pages/UserManagement';
import FormDesigner from './pages/FormDesigner';
import SystemParameters from './pages/SystemParameters';
import IntegrationMonitor from './pages/IntegrationMonitor';
import './App.css';

const App = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [screensOpen, setScreensOpen] = useState(true);
    
    const handleLogin = async (u, p) => {
        const host = window.location.hostname;
        try {
            const res = await fetch(`http://${host}:8080/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: u, pass: p })
            });
            const data = await res.json();
            if (data.success) {
                if (data.data.role !== 'admin') {
                    alert('Bu panele sadece yöneticiler giriş yapabilir.');
                    return;
                }
                localStorage.setItem('adminToken', data.token);
                setIsLoggedIn(true);
            } else {
                alert(data.message);
            }
        } catch (err) {
            alert('Sunucu bağlantı hatası.');
        }
    };

    if (!isLoggedIn) {
        return (
            <div className="login-screen">
                <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '3rem' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                        <h1 className="brand-text" style={{ fontSize: '2rem', color: 'var(--secondary-color)' }}>KAAN WMS</h1>
                        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Yönetim Paneli Girişi</p>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); handleLogin(e.target.user.value, e.target.pass.value); }}>
                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label className="form-label">Yönetici Adı</label>
                            <input name="user" className="form-input" type="text" defaultValue="Admin" style={{ height: '3.5rem' }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: '2rem' }}>
                            <label className="form-label">Şifre</label>
                            <input name="pass" className="form-input" type="password" defaultValue="123" style={{ height: '3.5rem' }} />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '3.5rem', fontSize: '1.1rem' }}>Sisteme Giriş Yap</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <Router>
            <div className="admin-container">
                <aside className="admin-sidebar">
                    <div className="sidebar-header">
                        <h2 className="brand-text" style={{ fontSize: '1.75rem' }}>WMS PORTAL</h2>
                    </div>
                    <nav className="sidebar-nav">
                        <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <span style={{ fontSize: '1.2rem', marginRight: '12px' }}>👤</span> Kullanıcı Yönetimi
                        </NavLink>
                        <NavLink to="/parameters" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <span style={{ fontSize: '1.2rem', marginRight: '12px' }}>⚙️</span> Sistem Parametreleri
                        </NavLink>
                        <NavLink to="/monitor" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <span style={{ fontSize: '1.2rem', marginRight: '12px' }}>📡</span> Aktarım İzleme
                        </NavLink>

                        <div 
                            className={`nav-group-header ${screensOpen ? 'open' : ''}`} 
                            onClick={() => setScreensOpen(!screensOpen)}
                        >
                            <span style={{ flex: 1 }}>EKRAN TASARIMLARI</span>
                            <span style={{ fontSize: '0.8rem', transition: 'transform 0.3s', transform: screensOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                        </div>
                        
                        <div className={`submenu ${screensOpen ? 'open' : ''}`}>
                            <NavLink to="/designer" className={({ isActive }) => `nav-item submenu-item ${isActive ? 'active' : ''}`}>
                                <span style={{ fontSize: '1.1rem', marginRight: '12px' }}>🏗️</span> Mal Kabul
                            </NavLink>
                        </div>
                    </nav>
                    <div style={{ padding: '2rem', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <button className="btn btn-outline" style={{ width: '100%', background: 'transparent', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }} onClick={() => setIsLoggedIn(false)}>
                            Güvenli Çıkış
                        </button>
                    </div>
                </aside>
                <main className="admin-content">
                    <Routes>
                        <Route path="/users" element={<UserManagement />} />
                        <Route path="/designer" element={<FormDesigner />} />
                        <Route path="/parameters" element={<SystemParameters />} />
                        <Route path="/monitor" element={<IntegrationMonitor />} />
                        <Route path="/" element={<Navigate to="/users" />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
};

export default App;
