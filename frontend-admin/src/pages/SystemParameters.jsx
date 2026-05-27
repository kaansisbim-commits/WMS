import React, { useState, useEffect } from 'react';

const SystemParameters = () => {
    const [params, setParams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // NetOpenX Connection Test States
    const [connectionStatus, setConnectionStatus] = useState('idle'); // idle, loading, success, error
    const [testError, setTestError] = useState('');

    // Save States
    const [saveStatus, setSaveStatus] = useState({ message: '', type: '' }); // type: 'success', 'error', 'info'
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const host = window.location.hostname;
        fetch(`http://${host}:8080/api/wms/parameters`, {
            headers: { 'Authorization': 'Bearer Admin123Token' }
        })
            .then(res => res.json())
            .then(res => {
                if (res.success) setParams(res.data || []);
                else setError(res.message);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    const handleTestConnection = () => {
        setConnectionStatus('loading');
        setTestError('');
        const host = window.location.hostname;

        fetch(`http://${host}:8080/api/wms/integration/test-connection`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer Admin123Token'
            }
        })

            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setConnectionStatus('success');
                } else {
                    setConnectionStatus('error');
                    setTestError(data.message || 'Bilinmeyen hata');
                }
            })
            .catch(err => {
                setConnectionStatus('error');
                setTestError(err.message);
            });
    };

    const toggleParam = (key) => {
        setParams(prev => prev.map(p =>
            p.key === key ? { ...p, value: !p.value } : p
        ));
    };

    const handleSave = () => {
        setSaving(true);
        setSaveStatus({ message: 'Sistem parametreleri kaydediliyor...', type: 'info' });
        const host = window.location.hostname;
        fetch(`http://${host}:8080/api/wms/parameters`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer Admin123Token'
            },
            body: JSON.stringify(params)
        })
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    setSaveStatus({ message: 'Sistem parametreleri MSSQL veritabanına başarıyla kaydedildi!', type: 'success' });
                    setTimeout(() => setSaveStatus({ message: '', type: '' }), 4000);
                } else {
                    setSaveStatus({ message: 'Hata: ' + res.message, type: 'error' });
                }
            })
            .catch(err => {
                setSaveStatus({ message: 'Bağlantı hatası: ' + err.message, type: 'error' });
            })
            .finally(() => {
                setSaving(false);
            });
    };

    if (loading) return <div>Yükleniyor...</div>;
    if (error) return (
        <div className="card" style={{ border: '2px solid #fee2e2', background: '#fef2f2', color: '#991b1b' }}>
            <h2>⚠️ Hata</h2>
            <p>{error}</p>
        </div>
    );

    const getStatusStyles = () => {
        switch (connectionStatus) {
            case 'loading': return { background: '#94a3b8', cursor: 'wait' };
            case 'success': return { background: '#22c55e', color: '#fff' };
            case 'error': return { background: '#ef4444', color: '#fff' };
            default: return { background: 'var(--primary-color)', color: '#fff' };
        }
    };

    return (
        <div className="parameters-page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="brand-text page-title">Sistem Parametreleri</h1>
                    <p className="text-muted">Sadece Yetkili Kullanıcıların parametreleri yönetmesi önerilir.</p>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <button
                        className="btn"
                        onClick={handleTestConnection}
                        disabled={connectionStatus === 'loading'}
                        style={{
                            ...getStatusStyles(),
                            transition: 'all 0.3s ease',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '8px',
                            fontWeight: '600',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                    >
                        {connectionStatus === 'loading' ? '⏳ Test Ediliyor...' :
                         connectionStatus === 'success' ? '✅ Bağlantı Başarılı' :
                         connectionStatus === 'error' ? '❌ Bağlantı Başarısız' :
                         '🔗 NetOpenX Bağlantısını Test Et'}
                    </button>
                    {connectionStatus === 'error' && (
                        <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '8px', maxWidth: '250px', marginLeft: 'auto' }}>
                            {testError}
                        </div>
                    )}
                </div>
            </div>

            <div className="card" style={{ maxWidth: '900px' }}>
                <h3 style={{ marginBottom: '2rem' }}>Parametre Kontrolleri</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {Array.isArray(params) && params.map(param => (
                        <div key={param.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div>
                                <div style={{ fontWeight: '700', fontSize: '1.1rem', color: 'var(--secondary-color)' }}>
                                    {param.displayName || param.key}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    {param.description || 'Açıklama belirtilmemiş.'}
                                </div>
                            </div>
                            <button
                                className={`btn ${param.value ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => toggleParam(param.key)}
                                style={{ minWidth: '120px' }}
                            >
                                {param.value ? 'AÇIK' : 'KAPALI'}
                            </button>
                        </div>
                    ))}

                    {params.length === 0 && (
                        <div className="text-muted">Veritabanında henüz parametre tanımlanmamış.</div>
                    )}
                </div>

                {saveStatus.message && (
                    <div style={{
                        marginTop: '2rem',
                        padding: '1rem 1.5rem',
                        borderRadius: '12px',
                        backgroundColor: saveStatus.type === 'success' ? '#dcfce7' : saveStatus.type === 'error' ? '#fee2e2' : '#e0f2fe',
                        color: saveStatus.type === 'success' ? '#166534' : saveStatus.type === 'error' ? '#991b1b' : '#075985',
                        border: `1px solid ${saveStatus.type === 'success' ? '#bbf7d0' : saveStatus.type === 'error' ? '#fecaca' : '#bae6fd'}`,
                        fontWeight: '600',
                        fontSize: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{saveStatus.type === 'success' ? '✅' : saveStatus.type === 'error' ? '❌' : 'ℹ️'}</span>
                            <span>{saveStatus.message}</span>
                        </div>
                        <button 
                            onClick={() => setSaveStatus({ message: '', type: '' })} 
                            style={{ 
                                background: 'none', 
                                border: 'none', 
                                cursor: 'pointer', 
                                fontWeight: 'bold', 
                                color: 'inherit',
                                fontSize: '1.2rem',
                                padding: '0 4px',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            ✕
                        </button>
                    </div>
                )}

                <button 
                    className="btn btn-primary" 
                    style={{ 
                        width: '100%', 
                        marginTop: '3rem', 
                        height: '4rem', 
                        fontSize: '1.2rem',
                        opacity: saving ? 0.7 : 1,
                        cursor: saving ? 'wait' : 'pointer'
                    }} 
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? '⏳ Kaydediliyor...' : 'Değişiklikleri Veritabanına Kaydet'}
                </button>
            </div>
        </div>
    );
};

export default SystemParameters;
