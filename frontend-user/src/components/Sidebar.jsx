import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import menuConfig from '../config/MenuConfig.json';
import { useConfig } from '../context/ConfigContext';
import './Sidebar.css';

const Sidebar = ({ isOpen, toggleSidebar }) => {
    const { user, params, setUser } = useConfig();

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
                    {filteredMenu.map(item => (
                        <NavLink 
                            key={item.id} 
                            to={item.path} 
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            onClick={() => window.innerWidth <= 768 && toggleSidebar()}
                        >
                            <span className="nav-icon">▹</span>
                            <span className="nav-label">{item.label}</span>
                        </NavLink>
                    ))}
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
