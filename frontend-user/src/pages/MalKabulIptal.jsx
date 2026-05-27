import React, { useState, useEffect, useRef } from 'react';
import { useConfig } from '../context/ConfigContext';
import { fetchApi } from '../utils/api';
import QrScannerModal from '../components/QrScannerModal';

const MalKabulIptal = () => {
    const { user } = useConfig();
    const [serialNo, setSerialNo] = useState('');
    const [serialData, setSerialData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    
    // UI State
    const [toastMessage, setToastMessage] = useState(null);
    const [showGuide, setShowGuide] = useState(false);
    const [guideSerials, setGuideSerials] = useState([]);
    const [guideLoading, setGuideLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const inputRef = useRef(null);

    // 7 saniye kuralı timer ref
    const timerRef = useRef(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const showToast = (msg) => {
        setToastMessage(msg);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setToastMessage(null);
            handleClear(); // Ekranı temizle ve yeni tarama için hazırla
        }, 7000);
    };

    const handleClear = () => {
        setSerialNo('');
        setSerialData(null);
        setError(null);
        if (inputRef.current) inputRef.current.focus();
    };

    const fetchSerialData = async (querySerial) => {
        if (!querySerial) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchApi(`/serial-cancellation/${encodeURIComponent(querySerial)}`);
            if (data.success) {
                setSerialData(data.data);
            } else {
                setSerialData(null);
                setError(data.message || 'Kayıt bulunamadı.');
            }
        } catch (err) {
            setError('Bağlantı hatası.');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            fetchSerialData(serialNo.trim());
        }
    };

    const handleBlur = () => {
        if (serialNo.trim() && !serialData && !showGuide) {
            fetchSerialData(serialNo.trim());
        }
    };

    const openGuide = async () => {
        setShowGuide(true);
        setGuideLoading(true);
        try {
            const data = await fetchApi(`/serial-cancellation`);
            if (data.success) {
                setGuideSerials(data.data);
            }
        } catch (err) {
            console.error('Rehber yükleme hatası', err);
        } finally {
            setGuideLoading(false);
        }
    };

    const selectFromGuide = (selectedSerial) => {
        setSerialNo(selectedSerial);
        setShowGuide(false);
        fetchSerialData(selectedSerial);
    };

    const handleScan = (scannedSerial) => {
        setSerialNo(scannedSerial);
        setShowScanner(false);
        fetchSerialData(scannedSerial);
    };

    const handleCancelReceipt = async () => {
        setLoading(true);
        try {
            const data = await fetchApi(`/serial-cancellation/${encodeURIComponent(serialData.SeriNo || serialNo)}`, {
                method: 'DELETE'
            });
            if (data.success) {
                setShowConfirm(false);
                showToast("Seri numarası kabul işlemi başarıyla iptal edildi.");
            } else {
                setError(data.message || 'İptal işlemi başarısız oldu.');
                setShowConfirm(false);
            }
        } catch (err) {
            setError('İptal sırasında bağlantı hatası oluştu.');
            setShowConfirm(false);
        } finally {
            setLoading(false);
        }
    };

    // Styling object for Detay Kartı
    const cardStyle = {
        background: '#f8fafc',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        border: '1px solid #e2e8f0',
        marginTop: '2rem'
    };

    const labelStyle = {
        color: '#64748b',
        fontSize: '0.875rem',
        fontWeight: '500',
        marginBottom: '0.25rem',
        display: 'block'
    };

    const valueStyle = {
        color: '#0f172a',
        fontSize: '1rem',
        fontWeight: '600',
        padding: '0.5rem',
        background: '#fff',
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
        minHeight: '40px',
        display: 'flex',
        alignItems: 'center'
    };

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
    };

    return (
        <div className="page-container" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', position: 'relative', minHeight: '80vh' }}>
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <h1 className="page-title" style={{ fontSize: '1.8rem', color: '#1e293b' }}>Mal Kabul İptal</h1>
                <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Hatalı kabul edilen seri numarasının giriş hareketini ve bakiyesini siler.</p>
            </div>

            <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label className="form-label" style={{ fontWeight: '600', color: '#334155' }}>Seri Numarası / QR Kod</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                ref={inputRef}
                                type="text"
                                className="form-input"
                                style={{ flex: 1, height: '45px', fontSize: '1.1rem' }}
                                placeholder="Barkod okutunuz..."
                                value={serialNo}
                                onChange={(e) => setSerialNo(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={handleBlur}
                                disabled={loading}
                            />
                            <button 
                                className="btn btn-secondary"
                                style={{ height: '45px', padding: '0 1.5rem' }}
                                onClick={openGuide}
                                disabled={loading}
                            >
                                🔍 Rehber
                            </button>
                            <button 
                                className="btn btn-primary"
                                style={{ height: '45px', padding: '0 1.5rem', background: '#3b82f6', color: 'white', border: 'none' }}
                                onClick={() => setShowScanner(true)}
                                disabled={loading}
                            >
                                📷 Kamera
                            </button>
                            {(serialNo || serialData) && (
                                <button 
                                    className="btn btn-danger"
                                    style={{ height: '45px', background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1' }}
                                    onClick={handleClear}
                                    disabled={loading}
                                >
                                    Temizle
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {error && (
                    <div style={{ padding: '1rem', background: '#fef2f2', color: '#ef4444', borderRadius: '8px', marginTop: '1rem', border: '1px solid #fca5a5' }}>
                        ⚠️ {error}
                    </div>
                )}
            </div>

            {loading && !serialData && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    <div className="spinner" style={{ margin: '0 auto', marginBottom: '1rem' }}></div>
                    Sorgulanıyor...
                </div>
            )}

            {serialData && (
                <div style={cardStyle} className="fade-in">
                    <h3 style={{ fontSize: '1.2rem', color: '#0f172a', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>İşlem Detay Kartı</h3>
                    
                    <div style={gridStyle}>
                        <div>
                            <span style={labelStyle}>Stok Kodu</span>
                            <div style={valueStyle}>{serialData.StokKodu}</div>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <span style={labelStyle}>Ürün Adı</span>
                            <div style={valueStyle}>{serialData.UrunAdi || '-'}</div>
                        </div>
                        <div>
                            <span style={labelStyle}>Kabul Edilen Miktar</span>
                            <div style={valueStyle}>{serialData.KabulEdilenMiktar}</div>
                        </div>
                    </div>

                    <div style={gridStyle}>
                        <div>
                            <span style={labelStyle}>İrsaliye / Belge No</span>
                            <div style={valueStyle}>{serialData.IrsaliyeNo}</div>
                        </div>
                        <div>
                            <span style={labelStyle}>Belge Tarihi</span>
                            <div style={valueStyle}>{serialData.BelgeTarihi ? new Date(serialData.BelgeTarihi).toLocaleDateString('tr-TR') : '-'}</div>
                        </div>
                        <div>
                            <span style={labelStyle}>Cari Kodu</span>
                            <div style={valueStyle}>{serialData.CariBilgisi}</div>
                        </div>
                        <div>
                            <span style={labelStyle}>Depo Kodu</span>
                            <div style={valueStyle}>{serialData.DepoKodu}</div>
                        </div>
                    </div>

                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <button 
                            onClick={() => setShowConfirm(true)}
                            className="btn btn-danger"
                            style={{ 
                                padding: '0.75rem 2rem', 
                                fontSize: '1.1rem', 
                                background: '#ef4444', 
                                border: 'none',
                                boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.4)'
                            }}
                            disabled={loading}
                        >
                            {loading ? 'İşleniyor...' : 'Kabulü İptal Et'}
                        </button>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {showConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    background: 'rgba(15, 23, 42, 0.7)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="card scale-in" style={{ maxWidth: '450px', width: '100%', padding: '2rem' }}>
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#ef4444', fontSize: '3rem' }}>
                            ⚠️
                        </div>
                        <h3 style={{ textAlign: 'center', fontSize: '1.25rem', marginBottom: '1rem', color: '#0f172a' }}>Emin misiniz?</h3>
                        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '2rem', lineHeight: '1.5' }}>
                            Bu seri numarasına ait WMS stok giriş kaydı kalıcı olarak silinecektir. Bu işlem geri alınamaz.
                        </p>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button 
                                className="btn btn-secondary" 
                                style={{ flex: 1 }} 
                                onClick={() => setShowConfirm(false)}
                                disabled={loading}
                            >
                                Vazgeç
                            </button>
                            <button 
                                className="btn btn-danger" 
                                style={{ flex: 1, background: '#ef4444', border: 'none' }} 
                                onClick={handleCancelReceipt}
                                disabled={loading}
                            >
                                {loading ? 'Siliniyor...' : 'Evet, Sil'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Guide/Lookup Modal */}
            {showGuide && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    background: 'rgba(15, 23, 42, 0.5)', zIndex: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="card scale-in" style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Kabul Edilmiş Seriler (Son 100)</h3>
                            <button onClick={() => setShowGuide(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>×</button>
                        </div>
                        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
                            {guideLoading ? (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>Yükleniyor...</div>
                            ) : guideSerials.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Kayıt bulunamadı.</div>
                            ) : (
                                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #e2e8f0' }}>Seri No</th>
                                            <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #e2e8f0' }}>Stok Kodu</th>
                                            <th style={{ textAlign: 'right', padding: '0.75rem', borderBottom: '2px solid #e2e8f0' }}>Miktar</th>
                                            <th style={{ textAlign: 'center', padding: '0.75rem', borderBottom: '2px solid #e2e8f0' }}>İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {guideSerials.map((g, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '0.75rem', fontWeight: '500' }}>{g.SeriNo}</td>
                                                <td style={{ padding: '0.75rem', color: '#64748b' }}>{g.StokKodu}</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>{g.Miktar}</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                    <button 
                                                        className="btn btn-primary"
                                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                                                        onClick={() => selectFromGuide(g.SeriNo)}
                                                    >
                                                        Seç
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Camera Modal */}
            <QrScannerModal 
                isOpen={showScanner} 
                onClose={() => setShowScanner(false)} 
                onScan={handleScan} 
            />

            {/* 7 Seconds Fixed Bottom Toast */}
            {toastMessage && (
                <div style={{
                    position: 'fixed',
                    bottom: '2rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#10b981',
                    color: '#fff',
                    padding: '1rem 2rem',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    zIndex: 2000,
                    animation: 'slideUp 0.3s ease-out'
                }}>
                    <span style={{ fontSize: '1.5rem' }}>✓</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: '500' }}>{toastMessage}</span>
                </div>
            )}

            <style>{`
                @keyframes slideUp {
                    from { transform: translate(-50%, 100%); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }
                .fade-in {
                    animation: fadeIn 0.4s ease-out;
                }
                .scale-in {
                    animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export default MalKabulIptal;
