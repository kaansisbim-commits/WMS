import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ConfigProvider, useConfig } from './context/ConfigContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import MalKabul from './pages/MalKabul';
import POMalKabul from './pages/POMalKabul';
import MalKabulOnay from './pages/MalKabulOnay';
import MalKabulIptal from './pages/MalKabulIptal';
import Transfer201 from './pages/Transfer201';
import BakiyeSorgulama from './pages/BakiyeSorgulama';
import './index.css';

const MainApp = () => {
    const { user, setUser } = useConfig();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth > 768);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

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
            <div className={`app-layout ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
                <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
                
                <div className="content-wrapper">
                    <header className="app-header">
                        <button className="hamburger-btn" onClick={toggleSidebar}>
                            {isSidebarOpen ? '✕' : '☰'}
                        </button>
                        <div className="header-title">
                            <span className="user-badge">{user.role?.toUpperCase()}</span>
                        </div>
                    </header>

                    <main className="main-content">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/mal-kabul" element={
                                user.role === 'admin' || user.permissions?.includes('mal-kabul') 
                                    ? <MalKabul screenCode="101" /> 
                                    : <div style={{padding:'2rem', textAlign:'center'}}>Bu ekrana yetkiniz yok.</div>
                            } />
                            <Route path="/siparisli-mal-kabul" element={
                                user.role === 'admin' || user.permissions?.includes('siparisli-mal-kabul') 
                                    ? <POMalKabul /> 
                                    : <div style={{padding:'2rem', textAlign:'center'}}>Bu ekrana yetkiniz yok.</div>
                            } />
                            <Route path="/mal-kabul-onay" element={
                                user.role === 'admin' || user.permissions?.includes('mal-kabul-onay') 
                                    ? <MalKabulOnay /> 
                                    : <div style={{padding:'2rem', textAlign:'center'}}>Bu ekrana yetkiniz yok.</div>
                            } />
                            <Route path="/mal-kabul-iptal" element={
                                user.role === 'admin' || user.permissions?.includes('mal-kabul-iptal')
                                    ? <MalKabulIptal /> 
                                    : <div style={{padding:'2rem', textAlign:'center'}}>Bu ekrana yetkiniz yok.</div>
                            } />
                            <Route path="/transfer/depolar-arasi" element={
                                user.role === 'admin' || user.permissions?.includes('transfer-islemleri')
                                    ? <Transfer201 screenCode="201" /> 
                                    : <div style={{padding:'2rem', textAlign:'center'}}>Bu ekrana yetkiniz yok.</div>
                            } />
                            <Route path="/raporlar/bakiye-sorgulama" element={
                                user.role === 'admin' || user.permissions?.includes('raporlar')
                                    ? <BakiyeSorgulama /> 
                                    : <div style={{padding:'2rem', textAlign:'center'}}>Bu ekrana yetkiniz yok.</div>
                            } />
                            <Route path="*" element={<div>404 - Sayfa Bulunamadı</div>} />
                        </Routes>
                    </main>
                </div>
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
