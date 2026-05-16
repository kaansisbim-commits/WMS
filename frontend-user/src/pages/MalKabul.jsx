import React, { useState, useEffect, useRef } from 'react';
import { useConfig } from '../context/ConfigContext';
import GuideModal from '../components/GuideModal';
import { fetchApi } from '../utils/api';

const MalKabul = () => {
    const { params, formSchema, user } = useConfig();
    const [formData, setFormData] = useState({});
    const [lineItems, setLineItems] = useState([]);
    const [draftId, setDraftId] = useState(null);
    const [status, setStatus] = useState({ message: '', type: '' });
    const [modalConfig, setModalConfig] = useState({ isOpen: false, type: '', title: '', data: [], displayType: 'CARD' });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
    const [formErrors, setFormErrors] = useState({});
    const inputRefs = useRef({});

    const USER_ID = user?.id; // Login olan kullanıcının ID'si
    const SCREEN_CODE = '101';

    const mkScreen = (formSchema?.screens || []).find(s => s.key === 'malKabul');
    const fields = (mkScreen?.fields || [])
        .filter(f => f.IsVisible)
        .sort((a, b) => a.SortOrder - b.SortOrder);

    const headerFields = fields.filter(f => f.SectionGroup !== 'LINE');
    const lineFields = fields.filter(f => f.SectionGroup === 'LINE');

    useEffect(() => {
        // Mount olduğunda taslak kontrolü
        const checkDraft = async () => {
            try {
                const res = await fetchApi(`/drafts/get-active?userId=${USER_ID}&screenCode=${SCREEN_CODE}`);
                if (res.success && res.draft) {
                    setConfirmModal({
                        isOpen: true,
                        message: "Yarım kalan bir işleminiz var, devam etmek ister misiniz?",
                        onConfirm: () => {
                            setDraftId(res.draft.DraftID);
                            setFormData(JSON.parse(res.draft.HeaderData || '{}'));
                            setLineItems(JSON.parse(res.draft.LineData || '[]'));
                        }
                    });
                }
            } catch (error) {
                console.error("Taslak kontrol hatası:", error);
            }
        };
        checkDraft();
    }, []);

    const saveDraftToDB = async (currentHeader, currentLines) => {
        try {
            await fetchApi('/drafts/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: USER_ID,
                    screenCode: SCREEN_CODE,
                    headerData: currentHeader,
                    lineData: currentLines
                })
            });
        } catch (error) {
            console.error("Taslak kaydedilemedi:", error);
        }
    };

    const handleAddLine = () => {
        // --- DINAMİK FORM VALIDASYONU (HEADER + LINE) ---
        const requiredFields = fields.filter(f => f.IsRequired);
        const newErrors = {};
        let firstErrorId = null;
        let missingNames = [];

        for (const field of requiredFields) {
            const val = formData[field.COMPID];
            if (val === undefined || val === null || String(val).trim() === '') {
                newErrors[field.COMPID] = true;
                missingNames.push(field.LabelText);
                if (!firstErrorId) firstErrorId = field.COMPID;
            }
        }

        if (Object.keys(newErrors).length > 0) {
            setFormErrors(newErrors);
            setStatus({ message: `Lütfen zorunlu alanları doldurunuz: ${missingNames.join(', ')}`, type: 'error' });
            setTimeout(() => setStatus({ message: '', type: '' }), 5000);

            // İlk boş alana odaklan
            if (firstErrorId && inputRefs.current[firstErrorId]) {
                inputRefs.current[firstErrorId].focus();
            }
            return; // İşlemi iptal et ve sepete eklemeyi engelle
        }

        setFormErrors({}); // Hataları temizle

        // Sadece Line alanlarının verilerini topla
        const lineDataToSave = {};
        lineFields.forEach(f => {
            if (formData[f.COMPID] !== undefined && formData[f.COMPID] !== '') {
                lineDataToSave[f.COMPID] = formData[f.COMPID];
            }
        });

        // Gizli kolonları da (_ ile başlayanlar) satır verisine ekle
        Object.keys(formData).forEach(key => {
            if (key.startsWith('_')) {
                lineDataToSave[key] = formData[key];
            }
        });

        // Eğer Line kısmında zorunlu alan yoksa ve kullanıcı hiçbir şey girmeden +Ekle'ye bastıysa koruma:
        if (Object.keys(lineDataToSave).length === 0) {
            setStatus({ message: "Lütfen eklenecek ürün/satır bilgisi giriniz.", type: 'error' });
            setTimeout(() => setStatus({ message: '', type: '' }), 3000);
            return;
        }

        const newLineItems = [...lineItems, lineDataToSave];
        setLineItems(newLineItems);

        // Header datasını ayır
        const currentHeader = {};
        headerFields.forEach(f => {
            currentHeader[f.COMPID] = formData[f.COMPID] || '';
        });

        // Backend'e taslak olarak asenkron kaydet
        saveDraftToDB(currentHeader, newLineItems);

        // Satır (Line) alanlarını formdan temizle
        setFormData(prev => {
            const nextData = { ...prev };
            lineFields.forEach(f => {
                delete nextData[f.COMPID];
            });
            return nextData;
        });
    };

    const handleRemoveLine = (indexToRemove) => {
        setConfirmModal({
            isOpen: true,
            message: "Bu ürünü listeden çıkarmak istediğinize emin misiniz?",
            onConfirm: () => {
                const newLineItems = lineItems.filter((_, idx) => idx !== indexToRemove);
                setLineItems(newLineItems);

                if (newLineItems.length === 0) {
                    setDraftId(null);
                    setFormData({}); // Ekrandaki başlık alanlarını da temizle
                    saveDraftToDB({}, []); // Arka planda taslağı kapat
                } else {
                    // Header datasını topla
                    const currentHeader = {};
                    headerFields.forEach(f => {
                        currentHeader[f.COMPID] = formData[f.COMPID] || '';
                    });

                    // Backend'e taslak olarak kaydet (güncel silinmiş liste)
                    saveDraftToDB(currentHeader, newLineItems);
                }
            }
        });
    };

    const handleOpenGuide = async (field) => {
        if (field.ComponentType !== 'GUIDE') return;

        try {
            const res = await fetchApi(`/dynamic-query?scrid=101&compid=${field.COMPID}`);
            if (res.success) {
                setModalConfig({
                    isOpen: true,
                    type: field.COMPID,
                    field: field,
                    title: field.LabelText,
                    data: res.data,
                    displayType: field.GuideDisplayType || 'CARD'
                });
            } else {
                alert('Rehber verisi çekilemedi: ' + res.message);
            }
        } catch (err) {
            alert('Bağlantı hatası: ' + err.message);
        }
    };

    const handleSelectFromGuide = async (item) => {
        // Netsis için kritik kodları önceliklendir (CARI_KOD, STOK_KODU, KOD, CODE)
        const value = item.CARI_KOD || item.STOK_KODU || item.KOD || item.CODE || item.code || Object.values(item)[0];

        let serialObj = {};

        // Eğer seçilen alan bir ürün ise veya formda 'Seri No' alanı varsa, asenkron seri no üret
        const seriField = lineFields.find(f => f.LabelText === 'Seri No');
        if (seriField && !formData[seriField.COMPID]) {
            try {
                const res = await fetchApi('/serials/next');
                if (res.success) {
                    serialObj[seriField.COMPID] = res.serial;
                }
            } catch (error) {
                console.error("Seri numarası çekilemedi:", error);
            }
        }

        setFormData(prev => {
            const newData = { ...prev, [modalConfig.type]: value, ...serialObj };

            // Otomatik Gizli Kolon Eşleme (_ ile başlayanlar)
            Object.keys(item).forEach(key => {
                if (key.startsWith('_')) {
                    newData[key] = item[key];
                }
            });

            if (modalConfig.field && Array.isArray(modalConfig.field.GuideMappingJSON)) {
                modalConfig.field.GuideMappingJSON.forEach(mapping => {
                    if (mapping.sourceColumn && mapping.targetComponentID) {
                        newData[mapping.targetComponentID] = item[mapping.sourceColumn] || '';
                    }
                });
            }

            return newData;
        });

        setModalConfig(prev => ({ ...prev, isOpen: false }));

        if (formErrors[modalConfig.type]) {
            setFormErrors(prev => {
                const next = { ...prev };
                delete next[modalConfig.type];
                return next;
            });
        }
    };

    const handleChange = (id, value) => {
        setFormData(prev => ({ ...prev, [id]: value }));
        if (formErrors[id]) {
            setFormErrors(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Check if there are line items
        if (lineItems.length === 0) {
            alert("Lütfen en az bir kalem ekleyiniz.");
            return;
        }

        const currentHeader = {};
        headerFields.forEach(f => {
            currentHeader[f.COMPID] = formData[f.COMPID] || '';
        });

        const payload = {
            header: currentHeader,
            lines: lineItems,
            userId: user?.id,
            username: user?.name || user?.username || 'Admin'
        };

        console.log('Final Data to WMS/NetOpenX:', payload);

        // Gerçek Backend Kaydı
        const res = await fetchApi(`/process?draftId=${draftId || ''}`, { method: 'POST', body: JSON.stringify(payload) });

        if (res && res.success) {
            setStatus({ message: 'İşlem Başarılı! Fiş WMS\'e kaydedildi, Netsis kuyruğuna alındı.', type: 'success' });

            // Arka planda Worker'ı anında tetikle (Fire and forget)
            if (res.receiptId) {
                fetchApi('/integration/send-to-netsis', { method: 'POST', body: JSON.stringify({ receiptId: res.receiptId }) })
                    .catch(err => console.error("Anında Netsis aktarımı tetiklenemedi:", err));
            }

            setTimeout(() => setStatus({ message: '', type: '' }), 3000);

            // Clear everything after success
            setFormData({});
            setLineItems([]);
            setDraftId(null);
        } else {
            setStatus({ message: 'Hata: ' + (res?.message || 'Bilinmeyen bir hata oluştu.'), type: 'error' });
            setTimeout(() => setStatus({ message: '', type: '' }), 5000);
        }
    };

    const renderField = (field, disabled = false) => {
        const hasError = formErrors[field.COMPID];
        const baseStyle = {
            cursor: disabled ? 'not-allowed' : (field.ComponentType === 'GUIDE' ? 'pointer' : 'text'),
            background: disabled || field.ComponentType === 'READONLY' ? '#f1f5f9' : '#f8fafc',
        };
        const errorStyle = hasError ? { border: '1px solid #ef4444', boxShadow: '0 0 0 2px rgba(239, 68, 68, 0.2)' } : {};
        const combinedStyle = { ...baseStyle, ...errorStyle };

        if (field.ComponentType === 'GUIDE') {
            return (
                <div style={{ position: 'relative' }} key={field.COMPID}>
                    <input
                        ref={el => inputRefs.current[field.COMPID] = el}
                        className="form-input"
                        style={combinedStyle}
                        readOnly
                        disabled={disabled}
                        placeholder={field.LabelText + ' seçin...'}
                        value={formData[field.COMPID] || ''}
                        onClick={() => !disabled && handleOpenGuide(field)}
                    />
                    <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
                </div>
            );
        }
        return (
            <input
                key={field.COMPID}
                ref={el => inputRefs.current[field.COMPID] = el}
                className="form-input"
                type={field.ComponentType === 'DATE' ? 'date' : field.ComponentType === 'DECIMAL' ? 'number' : 'text'}
                step={field.ComponentType === 'DECIMAL' ? '0.01' : undefined}
                maxLength={field.MaxLength}
                value={formData[field.COMPID] || field.DefaultValue || ''}
                onChange={(e) => handleChange(field.COMPID, e.target.value)}
                readOnly={field.ComponentType === 'READONLY'}
                disabled={disabled}
                style={combinedStyle}
            />
        );
    };

    return (
        <div className="mal-kabul-page" style={{ paddingBottom: '2rem' }}>
            <h1 className="brand-text" style={{ color: 'black' }}>Mal Kabul Girişi</h1>
            <p className="text-muted">Master-Detail taslak destekli dinamik veri girişi.</p>

            <button
                type="button"
                onClick={() => {
                    setConfirmModal({
                        isOpen: true,
                        message: "Girilen tüm bilgiler temizlenecektir, onaylıyor musunuz?",
                        onConfirm: () => {
                            setFormData({});
                            setLineItems([]);
                            setDraftId(null);
                            // Backend'deki taslağı da kapat/sıfırla
                            saveDraftToDB({}, []);
                        }
                    });
                }}
                style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#e2e8f0',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    marginTop: '0.5rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}
            >
                <span>🔄</span> Yenile
            </button>

            {status.message && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '8px', backgroundColor: status.type === 'success' ? '#dcfce7' : '#fee2e2', color: status.type === 'success' ? '#166534' : '#991b1b', fontWeight: '600', textAlign: 'center' }}>
                    {status.message}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1.5rem' }}>

                {/* HEADER BÖLÜMÜ */}
                <div className="card" style={{ width: '100%' }}>
                    <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Belge Tanımı</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                        {headerFields.map(field => (
                            <div key={field.COMPID} className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">
                                    {field.LabelText}
                                    {field.IsRequired && <span style={{ color: '#ef4444', marginLeft: '0.25rem', fontWeight: 'bold' }}>*</span>}
                                </label>
                                {renderField(field, lineItems.length > 0)}
                            </div>
                        ))}
                    </div>
                </div>

                {/* LINE BÖLÜMÜ */}
                <div className="card" style={{ width: '100%' }}>
                    <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Kalem Bilgileri</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
                        {lineFields.map(field => (
                            <div key={field.COMPID} className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">
                                    {field.LabelText}
                                    {field.IsRequired && <span style={{ color: '#ef4444', marginLeft: '0.25rem', fontWeight: 'bold' }}>*</span>}
                                </label>
                                {renderField(field, false)}
                            </div>
                        ))}
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleAddLine}
                            style={{ height: '42px', backgroundColor: '#3b82f6', color: 'white', fontWeight: 'bold' }}
                        >
                            + Ekle
                        </button>
                    </div>
                </div>

                {/* EKLENEN KALEMLER LISTESI */}
                {lineItems.length > 0 && (
                    <div className="card" style={{ width: '100%', padding: '1rem' }}>
                        <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>Okutulan Ürünler ({lineItems.length})</h3>
                        <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
                            <table style={{ width: '100%', minWidth: 'max-content', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                                        {lineFields
                                            .filter(f => !f.LabelText.includes('Ürün Seçimi') && !f.LabelText.includes('Barkod'))
                                            .map(f => {
                                                let headerText = f.LabelText;
                                                if (headerText === 'Miktar') headerText = 'Okutulan Miktar';

                                                let align = 'center';
                                                if (headerText === 'Stok Adı') align = 'left';

                                                return (
                                                    <th key={f.COMPID} style={{
                                                        padding: '8px 12px',
                                                        textAlign: align,
                                                        whiteSpace: 'nowrap',
                                                        fontWeight: 'bold',
                                                        borderBottom: '2px solid #e2e8f0'
                                                    }}>
                                                        {headerText}
                                                    </th>
                                                );
                                            })}
                                        {/* Silme kolonu başlığı - sağa sabit (sticky) */}
                                        <th style={{
                                            width: '50px',
                                            position: 'sticky',
                                            right: 0,
                                            backgroundColor: '#f1f5f9',
                                            borderBottom: '2px solid #e2e8f0',
                                            zIndex: 10
                                        }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems.map((item, index) => (
                                        <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                            {lineFields
                                                .filter(f => !f.LabelText.includes('Ürün Seçimi') && !f.LabelText.includes('Barkod'))
                                                .map(f => {
                                                    let cellValue = item[f.COMPID] || '-';
                                                    let align = 'center';

                                                    return (
                                                        <td
                                                            key={f.COMPID}
                                                            title={cellValue}
                                                            style={{
                                                                padding: '8px 12px',
                                                                textAlign: align,
                                                                whiteSpace: 'nowrap',
                                                                borderBottom: '1px solid #e2e8f0'
                                                            }}
                                                        >
                                                            {cellValue}
                                                        </td>
                                                    );
                                                })}
                                            {/* Sil butonu hücresi - sağa sabit (sticky) */}
                                            <td style={{
                                                padding: '8px 12px',
                                                textAlign: 'center',
                                                verticalAlign: 'middle',
                                                position: 'sticky',
                                                right: 0,
                                                backgroundColor: '#fff', // arka plandan bağımsız kalması için
                                                borderBottom: '1px solid #e2e8f0',
                                                boxShadow: '-2px 0 5px rgba(0,0,0,0.05)', // Hafif gölge ile üstte kaldığını belli et
                                                zIndex: 5
                                            }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveLine(index)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        fontSize: '1.2rem',
                                                        color: '#ef4444',
                                                        padding: '4px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                    title="Kaldır"
                                                >
                                                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                        <line x1="10" y1="11" x2="10" y2="17"></line>
                                                        <line x1="14" y1="11" x2="14" y2="17"></line>
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot style={{ backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
                                    <tr>
                                        {lineFields
                                            .filter(f => !f.LabelText.includes('Ürün Seçimi') && !f.LabelText.includes('Barkod'))
                                            .map((f, i, arr) => {
                                                const isMiktarField = f.LabelText === 'Miktar';
                                                const isFirstField = i === 0;

                                                let footerText = '';
                                                if (isFirstField) footerText = `Toplam: ${lineItems.length} Satır`;
                                                if (isMiktarField) {
                                                    const totalQty = lineItems.reduce((sum, item) => sum + (parseFloat(item[f.COMPID]) || 0), 0);
                                                    footerText = totalQty.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
                                                }

                                                return (
                                                    <td key={f.COMPID} style={{ padding: '12px', textAlign: 'center', borderTop: '2px solid #e2e8f0' }}>
                                                        {footerText}
                                                    </td>
                                                );
                                            })
                                        }
                                        <td style={{ position: 'sticky', right: 0, backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={handleSubmit} className="btn btn-primary" style={{ padding: '0.75rem', fontSize: '1.1rem', width: '100%' }}>
                                Netsis'e Gönder
                            </button>
                        </div>
                    </div>
                )}

            </div>

            <GuideModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                title={modalConfig.title}
                data={modalConfig.data}
                onSelect={handleSelectFromGuide}
                displayType={modalConfig.displayType}
            />

            {/* Custom Confirm Modal */}
            {confirmModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '350px', padding: '1.5rem', textAlign: 'center', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <div style={{ color: '#ef4444', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                            <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        </div>
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#0f172a' }}>Onay Gerekiyor</h3>
                        <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.95rem' }}>{confirmModal.message}</p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                                className="btn btn-secondary"
                                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 'bold' }}
                            >
                                İptal
                            </button>
                            <button
                                onClick={() => {
                                    if (confirmModal.onConfirm) confirmModal.onConfirm();
                                    setConfirmModal({ ...confirmModal, isOpen: false });
                                }}
                                className="btn btn-primary"
                                style={{ flex: 1, backgroundColor: '#ef4444', color: 'white', fontWeight: 'bold', border: 'none' }}
                            >
                                Onayla
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MalKabul;
