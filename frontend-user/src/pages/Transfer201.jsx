import React, { useState, useEffect } from 'react';
import { useConfig } from '../context/ConfigContext';
import GuideModal from '../components/GuideModal';
import { fetchApi } from '../utils/api';

const Transfer201 = ({ screenCode = "201" }) => {
    const { user } = useConfig();
    const USER_ID = user?.user || user?.id;
    const [sourceDepo, setSourceDepo] = useState('');
    const [targetDepo, setTargetDepo] = useState('');
    const [barcode, setBarcode] = useState('');
    const [drafts, setDrafts] = useState([]);
    const [toast, setToast] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });

    const [modalConfig, setModalConfig] = useState({ isOpen: false, type: '', title: '', data: [], displayType: 'CARD' });

    useEffect(() => {
        const checkDraft = async () => {
            if (!USER_ID) return;
            try {
                const res = await fetchApi(`/drafts/get-active?userId=${USER_ID}&screenCode=${screenCode}`);
                if (res.success && res.draft) {
                    setConfirmModal({
                        isOpen: true,
                        title: 'Yarım Kalan İşlem',
                        message: 'Bu ekranda yarım kalan bir işleminiz bulundu. Kaldığınız yerden devam etmek ister misiniz?',
                        onConfirm: () => {
                            const savedHeader = JSON.parse(res.draft.HeaderData || '{}');
                            const savedLines = JSON.parse(res.draft.LineData || '[]');
                            
                            if (savedHeader.sourceDepo) setSourceDepo(savedHeader.sourceDepo);
                            if (savedHeader.targetDepo) setTargetDepo(savedHeader.targetDepo);
                            if (savedLines.length > 0) setDrafts(savedLines);
                            
                            setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
                        },
                        onCancel: async () => {
                            try {
                                await fetchApi('/drafts/save', {
                                    method: 'POST',
                                    body: JSON.stringify({ userId: USER_ID, screenCode, headerData: {}, lineData: [] })
                                });
                            } catch (e) {}
                            setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
                        }
                    });
                }
            } catch (error) {
                console.error("Draft check failed:", error);
            }
        };

        checkDraft();
    }, [USER_ID, screenCode]);

    const saveDraftToDB = async (header, lines) => {
        if (!USER_ID) return;
        try {
            await fetchApi('/drafts/save', {
                method: 'POST',
                body: JSON.stringify({
                    userId: USER_ID,
                    screenCode: screenCode,
                    headerData: header,
                    lineData: lines
                })
            });
        } catch (err) {
            console.error('Draft save failed:', err);
        }
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 7000);
    };

    const handleOpenGuide = async (type, compId, title) => {
        try {
            const res = await fetchApi(`/dynamic-query?scrid=201&compid=${compId}`);
            if (res.success) {
                setModalConfig({
                    isOpen: true,
                    type: type,
                    title: title,
                    data: res.data,
                    displayType: 'CARD'
                });
            } else {
                alert('Rehber verisi çekilemedi: ' + res.message);
            }
        } catch (err) {
            alert('Bağlantı hatası: ' + err.message);
        }
    };

    const handleSelectFromGuide = (item) => {
        // Find the value key (CODE, KOD, or DEPO_KODU, or first key)
        const keys = Object.keys(item);
        const valueKey = keys.find(k => String(k).toUpperCase().includes('KOD')) || keys[0];
        const value = item[valueKey];

        let newSource = sourceDepo;
        let newTarget = targetDepo;

        if (modalConfig.type === 'source') {
            newSource = value;
            setSourceDepo(value);
        } else if (modalConfig.type === 'target') {
            newTarget = value;
            setTargetDepo(value);
        }

        setModalConfig(prev => ({ ...prev, isOpen: false }));
        saveDraftToDB({ sourceDepo: newSource, targetDepo: newTarget }, drafts);
    };

    const handleBarcodeSubmit = async (e) => {
        if (e) e.preventDefault();

        if (!sourceDepo || !targetDepo) {
            showToast('Lütfen kaynak ve hedef depoları seçiniz!', 'error');
            return;
        }

        if (sourceDepo === targetDepo) {
            showToast('Kaynak depo ve hedef depo aynı olamaz!', 'error');
            return;
        }

        if (!barcode.trim()) {
            showToast('Lütfen bir barkod veya seri numarası girin!', 'error');
            return;
        }

        setIsLoading(true);
        try {
            const data = await fetchApi(`/stock-balance?barcode=${barcode}&depoKodu=${sourceDepo}`);

            if (data.success && data.balance > 0) {
                // Ürün bakiye kontrolünden geçti, sepete ekle
                const newDraft = {
                    StokKodu: data.StokKodu,
                    UrunAdi: data.UrunAdi || 'Tanımsız Ürün',
                    SeriNo: data.SeriNo || '',
                    LotNo: data.LotNo || '',
                    Miktar: 1, // Varsayılan 1
                    KaynakDepo: sourceDepo,
                    HedefDepo: targetDepo,
                    LineID: Date.now() // Unique ID için
                };

                // Eğer seri aynıysa miktarı artırma kontrolü yapılabilir, ama seri olduğu için benzersiz eklemek mantıklı
                const updatedDrafts = [...drafts, newDraft];
                setDrafts(updatedDrafts);
                setBarcode(''); // Barkod okutulduktan sonra input temizlenir
                showToast(`${data.StokKodu} ürünü sepete eklendi.`);
                saveDraftToDB({ sourceDepo, targetDepo }, updatedDrafts);
            } else {
                showToast(data.message || 'Ürün bulunamadı veya kaynak depoda bakiye yetersiz!', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Bakiye sorgulama hatası!', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveDraft = (lineId) => {
        const updatedDrafts = drafts.filter(d => d.LineID !== lineId);
        setDrafts(updatedDrafts);
        saveDraftToDB({ sourceDepo, targetDepo }, updatedDrafts);
    };

    const handleSaveAndSend = async () => {
        if (drafts.length === 0) {
            showToast('Aktarılacak ürün bulunamadı!', 'error');
            return;
        }

        setIsLoading(true);
        try {
            // 1. Önce WMS_Receipts'e process ile kaydet (Taslak veya IntegrationStatus 0 olarak)
            const payload = {
                userId: user?.user || user?.id,
                username: user?.user || user?.username,
                header: {
                    // Header data for SCRID: 201
                    'scrid': screenCode,
                    'kaynakDepo': sourceDepo,
                    'hedefDepo': targetDepo,
                    'belgeTarihi': new Date().toISOString()
                },
                lines: drafts.map(d => ({
                    StokKodu: d.StokKodu,
                    Miktar: d.Miktar,
                    Birim: 'AD', // Varsayılan, gerçekte backend'den gelmeli
                    SeriNo: d.SeriNo,
                    LotNo: d.LotNo,
                    KaynakDepo: d.KaynakDepo,
                    HedefDepo: d.HedefDepo
                }))
            };

            const saveData = await fetchApi('/process', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            
            if (!saveData.success) {
                showToast(saveData.message || 'Taslak kaydedilirken hata oluştu!', 'error');
                setIsLoading(false);
                return;
            }

            const receiptId = saveData.receiptId;

            showToast('İşlem Başarılı! Depolar arası transfer belgesi tamamlandı, entegrasyon kuyruğuna eklendi.', 'success');

            // Arka planda Worker'ı anında tetikle (Fire and forget)
            if (receiptId) {
                fetchApi('/integration/send-to-netsis', { 
                    method: 'POST', 
                    body: JSON.stringify({ receiptId }) 
                }).catch(err => console.error("Anında Netsis aktarımı tetiklenemedi:", err));
            }

            // Clear screen
            setDrafts([]);
            setSourceDepo('');
            setTargetDepo('');
            setBarcode('');

            // Clear draft in DB
            await saveDraftToDB({}, []);

        } catch (err) {
            console.error(err);
            if (err.name === 'AbortError') {
                showToast('İşlem zaman aşımına uğradı (60s). Lütfen tekrar deneyin.', 'error');
            } else {
                showToast('Sistem hatası!', 'error');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mal-kabul-container">
            <div className="header-section">
                <h1 className="brand-text">Depolar Arası Transfer (201)</h1>
            </div>

            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                        <label className="form-label">Kaynak Depo</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="form-input"
                                style={{ cursor: 'pointer', background: '#f8fafc' }}
                                readOnly
                                disabled={isLoading}
                                placeholder="Kaynak Depo seçin..."
                                value={sourceDepo}
                                onClick={() => !isLoading && handleOpenGuide('source', 20101, 'Kaynak Depo Seçimi')}
                            />
                            <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
                        </div>
                    </div>

                    <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                        <label className="form-label">Hedef Depo</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="form-input"
                                style={{ cursor: 'pointer', background: '#f8fafc' }}
                                readOnly
                                disabled={isLoading}
                                placeholder="Hedef Depo seçin..."
                                value={targetDepo}
                                onClick={() => !isLoading && handleOpenGuide('target', 20102, 'Hedef Depo Seçimi')}
                            />
                            <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <form onSubmit={handleBarcodeSubmit} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Seri No / Barkod Okut</label>
                        <input 
                            type="text" 
                            className="form-input" 
                            value={barcode} 
                            onChange={(e) => setBarcode(e.target.value)} 
                            placeholder="Okutmak için tıklayın..." 
                            disabled={isLoading}
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ height: '2.5rem' }}>
                        {isLoading ? 'Sorgulanıyor...' : 'Ekle / LookUp'}
                    </button>
                </form>
            </div>

            <div className="card" style={{ padding: '1.75rem', border: '1px solid #cbd5e1' }}>
                <h3 style={{ marginBottom: '1.25rem', fontSize: '1.2rem', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🛒 Sepetteki Ürünler
                    {drafts.length > 0 && (
                        <span style={{ fontSize: '0.8rem', background: '#3b82f6', color: 'white', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>{drafts.length} Kalem</span>
                    )}
                </h3>

                {drafts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📦</div>
                        Sepette ürün bulunmamaktadır.
                    </div>
                ) : (
                    <div className="table-responsive" style={{ width: '100%', overflowX: 'auto' }}>
                        <table className="user-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                    <th style={{ padding: '0.75rem' }}>Stok Kodu / Adı</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Miktar</th>
                                    <th style={{ padding: '0.75rem' }}>Detaylar</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drafts.map(row => (
                                    <tr key={row.LineID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ fontWeight: 'bold' }}>{row.StokKodu}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{row.UrunAdi}</div>
                                        </td>
                                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                            <input 
                                                type="number" 
                                                className="form-input" 
                                                style={{ width: '80px', padding: '0.4rem', textAlign: 'center', margin: '0 auto' }} 
                                                value={row.Miktar}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    const updatedDrafts = drafts.map(d => d.LineID === row.LineID ? { ...d, Miktar: val } : d);
                                                    setDrafts(updatedDrafts);
                                                    saveDraftToDB({ sourceDepo, targetDepo }, updatedDrafts);
                                                }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                {(row.SeriNo || row.LotNo) ? (
                                                    <span style={{ background: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Seri/Lot: {row.SeriNo || row.LotNo}</span>
                                                ) : null}
                                                <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #fde68a', whiteSpace: 'nowrap' }}>Kaynak: {row.KaynakDepo}</span>
                                                <span style={{ background: '#d1fae5', color: '#065f46', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #a7f3d0', whiteSpace: 'nowrap' }}>Hedef: {row.HedefDepo}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                            <button 
                                                onClick={() => handleRemoveDraft(row.LineID)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#ef4444',
                                                    cursor: 'pointer',
                                                    fontWeight: 'bold',
                                                    fontSize: '0.9rem',
                                                    whiteSpace: 'nowrap'
                                                }}
                                                title="Taslaktan çıkar"
                                            >
                                                🗑️ Sil
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {drafts.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                        <button 
                            className="btn btn-primary" 
                            onClick={handleSaveAndSend} 
                            disabled={isLoading}
                            style={{ padding: '0.875rem 2rem', fontSize: '1.05rem', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)' }}
                        >
                            {isLoading ? 'İşleniyor...' : '🚀 Onayla ve Bitir'}
                        </button>
                    </div>
                )}
            </div>

            {/* 7 Saniye Kuralı Fixed Bottom Toast */}
            {toast && (
                <div style={{
                    position: 'fixed',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: toast.type === 'success' ? '#10b981' : '#ef4444',
                    color: 'white',
                    padding: '1rem 2rem',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    zIndex: 9999,
                    fontWeight: 'bold',
                    textAlign: 'center',
                    minWidth: '300px',
                    animation: 'slideUp 0.3s ease-out forwards'
                }}>
                    {toast.message}
                </div>
            )}

            {/* Guide Modal Component */}
            {modalConfig.isOpen && (
                <GuideModal
                    isOpen={modalConfig.isOpen}
                    onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                    title={modalConfig.title}
                    data={modalConfig.data}
                    onSelect={handleSelectFromGuide}
                    displayType={modalConfig.displayType}
                />
            )}

            {/* Resume Draft Confirmation Modal */}
            {confirmModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
                    <div className="card" style={{ maxWidth: '400px', width: '90%', padding: '2rem', textAlign: 'center' }}>
                        <h3 style={{ marginBottom: '1rem', color: 'var(--secondary-color)' }}>{confirmModal.title || 'Onay'}</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{confirmModal.message}</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                            <button
                                onClick={confirmModal.onConfirm}
                                className="btn btn-primary"
                                style={{ padding: '0.5rem 1.5rem' }}
                            >
                                Evet, Devam Et
                            </button>
                            <button
                                onClick={confirmModal.onCancel}
                                className="btn"
                                style={{ padding: '0.5rem 1.5rem', border: '1px solid #cbd5e1', background: 'white' }}
                            >
                                Hayır, Temizle
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Transfer201;
