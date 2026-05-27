import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import menuConfig from '../config/MenuConfig.json';
import { useConfig } from '../context/ConfigContext';
import './Sidebar.css';

const Sidebar = ({ isOpen, toggleSidebar }) => {
    const { user, params, setUser } = useConfig();
    const [isMalKabulOpen, setIsMalKabulOpen] = useState(false);
    const [isTransferOpen, setIsTransferOpen] = useState(false);
    const [isRaporlarOpen, setIsRaporlarOpen] = useState(false);

    const filteredMenu = menuConfig.menuItems.filter(item => {
        // Permission check
        if (user.role !== 'admin' && !user.permissions?.includes(item.id)) return false;
        
        // Parametric check
        if (item.params && item.params.active) {
            if (!params[item.params.active]) return false;
        }
        
        return true;
    });

    return (
        <>
            <div className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <h2 className="brand-text">KAAN WMS</h2>
                </div>
                <nav className="sidebar-nav">
                    {filteredMenu.map(item => {
                        if (item.id === 'mal-kabul-onay') return null; // Alt menüde işlenecek
                        if (item.id === 'mal-kabul-iptal') return null; // Alt menüde işlenecek

                        if (item.id === 'mal-kabul') {
                            return (
                                <div key="mal-kabul-group" style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div 
                                        className={`nav-item ${isMalKabulOpen ? 'active' : ''}`}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={() => setIsMalKabulOpen(!isMalKabulOpen)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span className="nav-icon">📥</span>
                                            <span className="nav-label">Mal Kabul</span>
                                        </div>
                                        <span style={{ 
                                            fontSize: '0.8rem', 
                                            transition: 'transform 0.3s', 
                                            transform: isMalKabulOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                            marginRight: '8px'
                                        }}>▼</span>
                                    </div>
                                    <div className={`submenu ${isMalKabulOpen ? 'open' : ''}`}>
                                        <NavLink 
                                            to="/mal-kabul" 
                                            className={({ isActive }) => `nav-item submenu-item ${isActive ? 'active' : ''}`}
                                            onClick={() => window.innerWidth <= 768 && toggleSidebar()}
                                        >
                                            <span className="nav-icon">▹</span>
                                            <span className="nav-label">Doğrudan Mal Kabul</span>
                                        </NavLink>

                                        {(params.SIPBAGMALKABUL == 1 || params.SIPBAGMALKABUL === true) && (
                                            <NavLink 
                                                to="/siparisli-mal-kabul" 
                                                className={({ isActive }) => `nav-item submenu-item ${isActive ? 'active' : ''}`}
                                                onClick={() => window.innerWidth <= 768 && toggleSidebar()}
                                            >
                                                <span className="nav-icon">▹</span>
                                                <span className="nav-label">Siparişe Bağlı Mal Kabul</span>
                                            </NavLink>
                                        )}

                                        {filteredMenu.some(m => m.id === 'mal-kabul-onay') && (
                                            <NavLink 
                                                to="/mal-kabul-onay" 
                                                className={({ isActive }) => `nav-item submenu-item ${isActive ? 'active' : ''}`}
                                                onClick={() => window.innerWidth <= 768 && toggleSidebar()}
                                            >
                                                <span className="nav-icon">▹</span>
                                                <span className="nav-label">Mal Kabul Onay</span>
                                            </NavLink>
                                        )}

                                        {filteredMenu.some(m => m.id === 'mal-kabul-iptal') && (
                                            <NavLink 
                                                to="/mal-kabul-iptal" 
                                                className={({ isActive }) => `nav-item submenu-item ${isActive ? 'active' : ''}`}
                                                onClick={() => window.innerWidth <= 768 && toggleSidebar()}
                                            >
                                                <span className="nav-icon">▹</span>
                                                <span className="nav-label">Mal Kabul İptal</span>
                                            </NavLink>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        if (item.id === 'transfer-islemleri') {
                            return (
                                <div key="transfer-group" style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div 
                                        className={`nav-item ${isTransferOpen ? 'active' : ''}`}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={() => setIsTransferOpen(!isTransferOpen)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span className="nav-icon">🔄</span>
                                            <span className="nav-label">Transfer İşlemleri</span>
                                        </div>
                                        <span style={{ 
                                            fontSize: '0.8rem', 
                                            transition: 'transform 0.3s', 
                                            transform: isTransferOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                            marginRight: '8px'
                                        }}>▼</span>
                                    </div>
                                    <div className={`submenu ${isTransferOpen ? 'open' : ''}`}>
                                        <NavLink 
                                            to="/transfer/depolar-arasi" 
                                            className={({ isActive }) => `nav-item submenu-item ${isActive ? 'active' : ''}`}
                                            onClick={() => window.innerWidth <= 768 && toggleSidebar()}
                                        >
                                            <span className="nav-icon">▹</span>
                                            <span className="nav-label">Depolar Arası Transfer</span>
                                        </NavLink>
                                    </div>
                                </div>
                            );
                        }

                        if (item.id === 'raporlar') {
                            return (
                                <div key="raporlar-group" style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div 
                                        className={`nav-item ${isRaporlarOpen ? 'active' : ''}`}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={() => setIsRaporlarOpen(!isRaporlarOpen)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span className="nav-icon">📊</span>
                                            <span className="nav-label">Raporlar</span>
                                        </div>
                                        <span style={{ 
                                            fontSize: '0.8rem', 
                                            transition: 'transform 0.3s', 
                                            transform: isRaporlarOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                            marginRight: '8px'
                                        }}>▼</span>
                                    </div>
                                    <div className={`submenu ${isRaporlarOpen ? 'open' : ''}`}>
                                        <NavLink 
                                            to="/raporlar/bakiye-sorgulama" 
                                            className={({ isActive }) => `nav-item submenu-item ${isActive ? 'active' : ''}`}
                                            onClick={() => window.innerWidth <= 768 && toggleSidebar()}
                                        >
                                            <span className="nav-icon">▹</span>
                                            <span className="nav-label">Bakiye Sorgulama</span>
                                        </NavLink>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <NavLink 
                                key={item.id} 
                                to={item.path} 
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                onClick={() => window.innerWidth <= 768 && toggleSidebar()}
                            >
                                <span className="nav-icon">▹</span>
                                <span className="nav-label">{item.label}</span>
                            </NavLink>
                        );
                    })}
                </nav>
                <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="user-info">
                        <span className="user-name">{user.user?.toUpperCase() || 'PERSONEL'}</span>
                        <span className="user-role">{user.role?.toUpperCase()}</span>
                    </div>
                    <button 
                        onClick={() => setUser(null)}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            width: '100%', padding: '0.75rem', background: '#fee2e2', color: '#dc2626',
                            border: '1px solid #f87171', borderRadius: '8px', cursor: 'pointer',
                            fontWeight: '600', fontSize: '0.9rem', transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = '#fca5a5'; e.currentTarget.style.color = '#b91c1c'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                    >
                        <span style={{ fontSize: '1.2rem' }}>🚪</span> Güvenli Çıkış
                    </button>
                </div>
            </div>
            {isOpen && <div className="sidebar-overlay" onClick={toggleSidebar}></div>}
        </>
    );
};

export default Sidebar;
