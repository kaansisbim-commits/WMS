import React, { useState, useEffect } from 'react';

const PrinterSettings = () => {
    const [printers, setPrinters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState({ show: false, message: '' });
    const [editingPrinter, setEditingPrinter] = useState(null);

    // Form state
    const [printerName, setPrinterName] = useState('');
    const [connectionMethod, setConnectionMethod] = useState('NETWORK');
    const [ipAddress, setIpAddress] = useState('');
    const [port, setPort] = useState(9100);
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        loadPrinters();
    }, []);

    const loadPrinters = async () => {
        try {
            setLoading(true);
            const host = window.location.hostname;
            const res = await fetch(`http://${host}:8080/api/admin/printers`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
            });
            const data = await res.json();
            if (data.success) setPrinters(data.data || []);
        } catch (err) {
            console.error('Yazıcılar yüklenirken hata:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                printerId: editingPrinter ? editingPrinter.PrinterID : null,
                printerName,
                connectionMethod,
                ipAddress,
                port: Number(port),
                isActive
            };

            const host = window.location.hostname;
            const res = await fetch(`http://${host}:8080/api/admin/printers`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}` 
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.success) {
                showToast(data.message || 'İşlem başarılı.');
                loadPrinters();
                handleCancel();
            } else {
                alert('Hata: ' + data.message);
            }
        } catch (err) {
            console.error(err);
            alert('Yazıcı kaydedilirken bir hata oluştu.');
        }
    };

    const handleEdit = (printer) => {
        setEditingPrinter(printer);
        setPrinterName(printer.PrinterName);
        setConnectionMethod(printer.ConnectionMethod);
        setIpAddress(printer.IPAddress || '');
        setPort(printer.Port || 9100);
        setIsActive(printer.IsActive);
    };

    const handleCancel = () => {
        setEditingPrinter(null);
        setPrinterName('');
        setConnectionMethod('NETWORK');
        setIpAddress('');
        setPort(9100);
        setIsActive(true);
    };

    const showToast = (message) => {
        setToast({ show: true, message });
        setTimeout(() => {
            setToast({ show: false, message: '' });
        }, 7000);
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Yazıcı Tanımlamaları</h1>
                <p style={{ color: 'var(--text-muted)' }}>Sistemde kullanılacak barkod yazıcıları tanımlayın</p>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
                <div className="card">
                    <h3 style={{ marginBottom: '1rem' }}>Mevcut Yazıcılar</h3>
                    {loading ? (
                        <p>Yükleniyor...</p>
                    ) : (
                        <table className="data-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Yazıcı Adı</th>
                                    <th>Bağlantı</th>
                                    <th>IP : Port</th>
                                    <th>Durum</th>
                                    <th>İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printers.length === 0 ? (
                                    <tr><td colSpan="6" style={{ textAlign: 'center' }}>Kayıtlı yazıcı bulunamadı.</td></tr>
                                ) : printers.map(p => (
                                    <tr key={p.PrinterID}>
                                        <td>{p.PrinterID}</td>
                                        <td>{p.PrinterName}</td>
                                        <td>{p.ConnectionMethod}</td>
                                        <td>{p.ConnectionMethod === 'NETWORK' ? `${p.IPAddress}:${p.Port}` : '-'}</td>
                                        <td>
                                            <span style={{ 
                                                padding: '4px 8px', 
                                                borderRadius: '4px', 
                                                background: p.IsActive ? '#dcfce7' : '#fee2e2', 
                                                color: p.IsActive ? '#166534' : '#991b1b',
                                                fontSize: '0.85rem'
                                            }}>
                                                {p.IsActive ? 'Aktif' : 'Pasif'}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="btn btn-outline" style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }} onClick={() => handleEdit(p)}>
                                                Düzenle
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="card">
                    <h3 style={{ marginBottom: '1.5rem' }}>{editingPrinter ? 'Yazıcı Düzenle' : 'Yeni Yazıcı Ekle'}</h3>
                    <form onSubmit={handleSave}>
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label className="form-label">Yazıcı Adı</label>
                            <input className="form-input" required value={printerName} onChange={e => setPrinterName(e.target.value)} placeholder="Örn: Mal Kabul ZT411" />
                        </div>
                        
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label className="form-label">Bağlantı Türü</label>
                            <select className="form-input" value={connectionMethod} onChange={e => setConnectionMethod(e.target.value)}>
                                <option value="NETWORK">NETWORK (IP)</option>
                                <option value="LOCAL">LOCAL (İstemci)</option>
                            </select>
                        </div>

                        {connectionMethod === 'NETWORK' && (
                            <>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label className="form-label">IP Adresi</label>
                                    <input className="form-input" required value={ipAddress} onChange={e => setIpAddress(e.target.value)} placeholder="192.168.1.50" />
                                </div>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label className="form-label">Port</label>
                                    <input className="form-input" type="number" required value={port} onChange={e => setPort(e.target.value)} />
                                </div>
                            </>
                        )}

                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                                Aktif Yazıcı
                            </label>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{editingPrinter ? 'Güncelle' : 'Ekle'}</button>
                            {editingPrinter && (
                                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={handleCancel}>İptal</button>
                            )}
                        </div>
                    </form>
                </div>
            </div>

            {toast.show && (
                <div style={{
                    position: 'fixed',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#10b981',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    zIndex: 9999,
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    ✅ {toast.message}
                </div>
            )}
        </div>
    );
};

export default PrinterSettings;
