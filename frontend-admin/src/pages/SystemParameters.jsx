import React, { useState, useEffect } from 'react';

const SystemParameters = () => {
    const [params, setParams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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

    const toggleParam = (key) => {
        setParams(prev => prev.map(p =>
            p.key === key ? { ...p, value: !p.value } : p
        ));
    };

    const handleSave = () => {
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
                if (res.success) alert('Sistem parametreleri MSSQL veritabanına başarıyla kaydedildi!');
                else alert('Hata: ' + res.message);
            })
            .catch(err => alert('Bağlantı hatası: ' + err.message));
    };

    if (loading) return <div>Yükleniyor...</div>;
    if (error) return (
        <div className="card" style={{ border: '2px solid #fee2e2', background: '#fef2f2', color: '#991b1b' }}>
            <h2>⚠️ Hata</h2>
            <p>{error}</p>
        </div>
    );

    return (
        <div className="parameters-page">
            <div className="page-header">
                <h1 className="brand-text page-title">Sistem Parametreleri</h1>
                <p className="text-muted">Sadece Yetkili Kullanıcıların parametreleri yönetmesi önerilir.</p>
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

                <button className="btn btn-primary" style={{ width: '100%', marginTop: '3rem', height: '4rem', fontSize: '1.2rem' }} onClick={handleSave}>
                    Değişiklikleri Veritabanına Kaydet
                </button>
            </div>
        </div>
    );
};

export default SystemParameters;
