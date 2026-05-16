import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ConfigProvider, useConfig } from './context/ConfigContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import MalKabul from './pages/MalKabul';
import './index.css';

const MainApp = () => {
    const { user, setUser } = useConfig();

    const handleLogin = async (e) => {
        e.preventDefault();
        const u = e.target.user.value;
        const p = e.target.pass.value;
        const host = window.location.hostname;
        
        try {
            const res = await fetch(`http://${host}:8080/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: u, pass: p })
            });
            const data = await res.json();
            if (data.success) {
                // ConfigContext içindeki user state'ini güncelliyoruz.
                // Bu sayede Sidebar ve diğer ekranlar otomatik olarak yetkileri tanıyacak.
                setUser(data.data);
            } else {
                alert(data.message);
            }
        } catch (err) {
            alert('Sunucu bağlantı hatası.');
        }
    };

    if (!user) {
        return (
            <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '2.5rem' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <h1 className="brand-text" style={{ fontSize: '1.8rem', color: 'var(--primary-color)' }}>KAAN WMS</h1>
                        <p style={{ color: 'var(--text-muted)' }}>Saha Personeli Girişi</p>
                    </div>
                    <form onSubmit={handleLogin}>
                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label className="form-label">Kullanıcı Adı</label>
                            <input name="user" className="form-input" type="text" required />
                        </div>
                        <div className="form-group" style={{ marginBottom: '2rem' }}>
                            <label className="form-label">Şifre</label>
                            <input name="pass" className="form-input" type="password" required />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '3.5rem', fontSize: '1.1rem' }}>Sisteme Giriş Yap</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <Router>
            <div className="app-container">
                <Sidebar />
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/mal-kabul" element={
                            user.role === 'admin' || user.permissions?.includes('mal-kabul') 
                                ? <MalKabul /> 
                                : <div style={{padding:'2rem', textAlign:'center'}}>Bu ekrana yetkiniz yok.</div>
                        } />
                        <Route path="*" element={<div>404 - Sayfa Bulunamadı</div>} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
};

const App = () => {
    return (
        <ConfigProvider>
            <MainApp />
        </ConfigProvider>
    );
};

export default App;
