import React, { useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import './AdminPortal.css';

const AdminPortal = () => {
    const { params, setParams, formSchema, setFormSchema } = useConfig();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loginData, setLoginData] = useState({ user: '', pass: '' });

    const handleLogin = (e) => {
        e.preventDefault();
        if (loginData.user === 'Admin' && loginData.pass === '123') {
            setIsAuthenticated(true);
        } else {
            alert('Hatalı giriş!');
        }
    };

    const toggleParam = (key) => {
        setParams({ ...params, [key]: !params[key] });
    };

    const handleMove = (index, direction) => {
        const newFields = [...formSchema.malKabul];
        const targetIndex = index + direction;
        
        if (targetIndex < 0 || targetIndex >= newFields.length) return;
        
        // Swap
        const temp = newFields[index];
        newFields[index] = newFields[targetIndex];
        newFields[targetIndex] = temp;
        
        // Update orders
        const updatedFields = newFields.map((f, i) => ({ ...f, order: i + 1 }));
        setFormSchema({ ...formSchema, malKabul: updatedFields });
    };

    const handleLabelChange = (index, newLabel) => {
        const newFields = [...formSchema.malKabul];
        newFields[index].label = newLabel;
        setFormSchema({ ...formSchema, malKabul: newFields });
    };

    if (!isAuthenticated) {
        return (
            <div style={{ maxWidth: '400px', margin: '4rem auto' }}>
                <div className="card">
                    <h2 className="brand-text">Yönetim Girişi</h2>
                    <form onSubmit={handleLogin} style={{ marginTop: '1.5rem' }}>
                        <div className="form-group">
                            <label className="form-label">Kullanıcı Adı</label>
                            <input 
                                className="form-input" 
                                type="text" 
                                value={loginData.user} 
                                onChange={(e) => setLoginData({...loginData, user: e.target.value})}
                                placeholder="Admin"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Şifre</label>
                            <input 
                                className="form-input" 
                                type="password" 
                                value={loginData.pass} 
                                onChange={(e) => setLoginData({...loginData, pass: e.target.value})}
                                placeholder="123"
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Giriş Yap</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <h1 className="brand-text">Yönetim Paneli</h1>
            <p className="text-muted">Sistem parametrelerini ve ekran yapılarını buradan yönetebilirsiniz.</p>

            <div className="card" style={{ marginTop: '2rem' }}>
                <h3>Parametrik Kontroller</h3>
                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Lot Takibi Var mı?</span>
                        <button 
                            className={`btn ${params.lotTakibiVarMi ? 'btn-primary' : 'btn-accent'}`}
                            onClick={() => toggleParam('lotTakibiVarMi')}
                        >
                            {params.lotTakibiVarMi ? 'Evet' : 'Hayır'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Siparişe Bağlı Mal Kabul Zorunlu mu?</span>
                        <button 
                            className={`btn ${params.siparisliMalKabulZorunluMu ? 'btn-primary' : 'btn-accent'}`}
                            onClick={() => toggleParam('siparisliMalKabulZorunluMu')}
                        >
                            {params.siparisliMalKabulZorunluMu ? 'Evet' : 'Hayır'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Stok Sayım Modülü Aktif mi?</span>
                        <button 
                            className={`btn ${params.stokSayimActive ? 'btn-primary' : 'btn-accent'}`}
                            onClick={() => toggleParam('stokSayimActive')}
                        >
                            {params.stokSayimActive ? 'Evet' : 'Hayır'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginTop: '2rem' }}>
                <h3>Ekran Tasarımcısı (Mal Kabul)</h3>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    Sürükle-bırak mantığıyla alanların sırasını ve isimlerini değiştirebilirsiniz.
                </p>
                
                <div className="designer-list">
                    {formSchema?.malKabul?.map((field, index) => (
                        <div key={field.id} className="designer-item">
                            <div className="item-controls">
                                <button className="ctrl-btn" onClick={() => handleMove(index, -1)} disabled={index === 0}>▲</button>
                                <button className="ctrl-btn" onClick={() => handleMove(index, 1)} disabled={index === formSchema.malKabul.length - 1}>▼</button>
                            </div>
                            <div className="item-info">
                                <input 
                                    className="item-label-input"
                                    value={field.label}
                                    onChange={(e) => handleLabelChange(index, e.target.value)}
                                />
                                <span className="item-id">{field.id}</span>
                            </div>
                            <div className="item-status">
                                {field.visibilityCondition !== 'always' ? (
                                    <span className="badge badge-param">Parametrik</span>
                                ) : (
                                    <span className="badge badge-fixed">Sabit</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                
                <button className="btn btn-primary" style={{ marginTop: '2rem', width: '100%' }} onClick={() => alert('Ayarlar kaydedildi!')}>
                    Tasarımı Kaydet
                </button>
            </div>
        </div>
    );
};

export default AdminPortal;
