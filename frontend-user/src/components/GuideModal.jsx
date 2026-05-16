import React, { useState, useEffect } from 'react';

const GuideModal = ({ isOpen, onClose, title, data, onSelect, displayType = 'CARD' }) => {
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const filteredData = (data || []).filter(item => {
        if (!searchTerm) return true;
        return Object.values(item).some(val => 
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1rem' }}>
            <div className="card" style={{ width: '100%', maxWidth: displayType === 'GRID' ? '900px' : '500px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 className="brand-text" style={{ fontSize: '1.5rem', color: 'black' }}>{title}</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <input 
                        type="text" 
                        placeholder="Rehberde ara..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-input"
                        style={{ width: '100%' }}
                    />
                </div>

                <div style={{ overflowY: 'auto', flex: 1 }}>
                    {displayType === 'GRID' ? (
                        <table className="user-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    {filteredData.length > 0 && Object.keys(filteredData[0])
                                        .filter(key => !key.startsWith('_'))
                                        .map(key => (
                                            <th key={key}>{key}</th>
                                        ))
                                    }
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((item, idx) => (
                                    <tr key={idx} onClick={() => onSelect(item)} style={{ cursor: 'pointer' }}>
                                        {Object.entries(item)
                                            .filter(([key]) => !key.startsWith('_'))
                                            .map(([key, val], i) => (
                                                <td key={i}>{val}</td>
                                            ))
                                        }
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {filteredData.map((item, idx) => (
                                <div 
                                    key={idx} 
                                    className="guide-card" 
                                    onClick={() => onSelect(item)}
                                    style={{ 
                                        padding: '1.25rem', 
                                        background: '#f8fafc', 
                                        borderRadius: '12px', 
                                        border: '1px solid #e2e8f0', 
                                        cursor: 'pointer' 
                                    }}
                                >
                                    <div style={{ fontWeight: 'bold', color: 'var(--secondary-color)' }}>
                                        {item.code || item.CariKod || Object.values(item)[0]}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {item.label || item.CariIsim || Object.values(item)[1]}
                                    </div>
                                    {Object.values(item)[2] && (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', marginTop: '4px' }}>
                                            {Object.values(item)[2]}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {filteredData.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            Kayıt bulunamadı.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GuideModal;
