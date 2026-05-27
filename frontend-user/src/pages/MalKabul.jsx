import React, { useState, useEffect, useRef } from 'react';
import { useConfig } from '../context/ConfigContext';
import GuideModal from '../components/GuideModal';
import { fetchApi } from '../utils/api';

const MalKabul = ({ screenCode }) => {
    const { params, formSchema, user } = useConfig();
    const [formData, setFormData] = useState({});
    const [lineItems, setLineItems] = useState([]);
    const [draftId, setDraftId] = useState(null);
    const [status, setStatus] = useState({ message: '', type: '' });
    const [modalConfig, setModalConfig] = useState({ isOpen: false, type: '', title: '', data: [], displayType: 'CARD' });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
    const [formErrors, setFormErrors] = useState({});
    const inputRefs = useRef({});
    const pollingRef = useRef(null);
    const [isLocked, setIsLocked] = useState(false);
    const [hasJoinedSharedSession, setHasJoinedSharedSession] = useState(false);

    // Print Settings
    const [availableLabels, setAvailableLabels] = useState([]);
    const [printers, setPrinters] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState(localStorage.getItem('selectedTemplateId') || '');
    const [selectedPrinterId, setSelectedPrinterId] = useState(localStorage.getItem('selectedPrinterId') || '');

    const USER_ID = user?.id; // Login olan kullanıcının ID'si
    const SCREEN_CODE = screenCode || '101';

    const screenKey = SCREEN_CODE === '102' ? 'poMalKabul' : 'malKabul';
    const mkScreen = (formSchema?.screens || []).find(s => s.key === screenKey);
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
                        title: 'Yarım Kalan İşlem',
                        message: "Yarım kalan bir işleminiz var, devam etmek ister misiniz?",
                        confirmText: 'Evet, Devam Et',
                        cancelText: 'Hayır, Sil',
                        onConfirm: () => {
                            setHasJoinedSharedSession(true);
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

        // Yazıcı ve Şablonları yükle
        const loadPrintSettings = async () => {
            try {
                const labelRes = await fetchApi(`/labels/available?scrid=${SCREEN_CODE}`);
                if (labelRes.success) setAvailableLabels(labelRes.data || []);
                
                const printerRes = await fetchApi(`/printers?activeOnly=true`);
                if (printerRes.success) setPrinters(printerRes.data || []);
            } catch (err) {
                console.error("Yazıcı/Şablon yükleme hatası:", err);
            }
        };
        loadPrintSettings();
    }, []);

    // 1. Polling (Senkronizasyon) Mekanizması
    useEffect(() => {
        const cariKod = formData['10101'] || formData.cariKod || formData._cariKod;
        const irsaliyeNo = formData['10102'] || formData.irsaliyeNo || formData['1002'];

        if (!cariKod || !irsaliyeNo) return;

        const startPolling = () => {
            pollingRef.current = setInterval(async () => {
                try {
                    const res = await fetchApi(`/drafts/collective?cari=${cariKod}&irsaliye=${irsaliyeNo}`);
                    
                    if (res.status === 423 || res.isCompleted) {
                        clearInterval(pollingRef.current);
                        setIsLocked(true);
                        alert("⚠️ Bu belge başka bir kullanıcı tarafından tamamlanmıştır. İşlem yapılamaz.");
                        return;
                    }

                    if (res.success && res.drafts) {
                        const otherUsersDrafts = res.drafts.filter(d => d._ownerUserId !== USER_ID);
                        
                        if (!hasJoinedSharedSession && otherUsersDrafts.length > 0 && lineItems.length === 0) {
                            clearInterval(pollingRef.current);
                            setConfirmModal({
                                isOpen: true,
                                title: 'Ortak Çalışma',
                                message: "Bu belgenin üzerinde çalışan birisi var. Mevcut çalışmaya katılmak istiyor musunuz?",
                                confirmText: 'Evet, Katıl',
                                cancelText: 'İptal Et',
                                onConfirm: () => {
                                    setHasJoinedSharedSession(true);
                                    if (res.sharedHeader) {
                                        setFormData(prev => ({ ...prev, ...res.sharedHeader }));
                                    }
                                    setLineItems(res.drafts);
                                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                },
                                onCancel: () => {
                                    setFormData({});
                                    setLineItems([]);
                                }
                            });
                            return;
                        }

                        if (hasJoinedSharedSession || lineItems.length > 0 || otherUsersDrafts.length === 0) {
                            if (res.sharedHeader && lineItems.length === 0) {
                                setFormData(prev => ({ ...prev, ...res.sharedHeader }));
                            }
                            setLineItems(res.drafts);
                        }
                    }
                } catch (error) {
                    if (error.status === 423) {
                        clearInterval(pollingRef.current);
                        setIsLocked(true);
                        alert("⚠️ Bu belge başka bir kullanıcı tarafından tamamlanmıştır. İşlem yapılamaz.");
                    }
                }
            }, 2000);
        };

        startPolling();

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, [formData['10101'], formData.cariKod, formData._cariKod, formData['10102'], formData.irsaliyeNo, formData['1002'], hasJoinedSharedSession, lineItems.length]);

    // 7 Saniyelik Otomatik Kapanma (Auto-Dismiss) ve Temizlik Kancası
    useEffect(() => {
        let timer;
        if (status.message && status.type === 'success') {
            timer = setTimeout(() => {
                setStatus({ message: '', type: '' });
            }, 7000);
        }
        return () => {
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, [status]);

    const saveDraftToDB = async (currentHeader, currentLines) => {
        const myLines = currentLines.filter(l => l._ownerUserId === USER_ID);
        try {
            await fetchApi('/drafts/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: USER_ID,
                    screenCode: SCREEN_CODE,
                    headerData: currentHeader,
                    lineData: myLines
                })
            });
        } catch (error) {
            console.error("Taslak kaydedilemedi:", error);
        }
    };

    const printLabel = async (lineData) => {
        if (!selectedTemplateId || !selectedPrinterId) return;

        const printer = printers.find(p => String(p.PrinterID) === String(selectedPrinterId));
        if (!printer) return;

        try {
            setStatus({ message: 'Etiket yazdırılıyor...', type: 'info' });
            
            // Render template
            const res = await fetchApi(`/labels/render/${selectedTemplateId}`, {
                method: 'POST',
                body: JSON.stringify(lineData)
            });

            if (res.success && res.data) {
                setStatus({ message: 'Etiket başarıyla oluşturuldu.', type: 'success' });
                
                if (printer.ConnectionMethod === 'LOCAL') {
                    // Trigger browser print for PDF
                    const pdfBase64 = res.data.pdfBase64;
                    if (pdfBase64) {
                        const byteCharacters = atob(pdfBase64);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], {type: 'application/pdf'});
                        const blobUrl = URL.createObjectURL(blob);
                        
                        const iframe = document.createElement('iframe');
                        iframe.style.display = 'none';
                        iframe.src = blobUrl;
                        document.body.appendChild(iframe);
                        
                        iframe.onload = () => {
                            iframe.contentWindow.print();
                            setTimeout(() => {
                                document.body.removeChild(iframe);
                                URL.revokeObjectURL(blobUrl);
                            }, 60000); // Cleanup after 1 min
                        };
                    }
                } else if (printer.ConnectionMethod === 'NETWORK') {
                    alert('Ağ yazıcısına yazdırma komutu (ZPL) gönderildi.');
                }
            } else {
                setStatus({ message: 'Etiket oluşturulamadı: ' + res.message, type: 'error' });
            }
        } catch (err) {
            console.error('Yazdırma hatası:', err);
            setStatus({ message: 'Etiket yazdırma hatası!', type: 'error' });
        }
    };

    const handleAddLine = () => {
        if (isLocked) {
            alert("Bu belge kilitlidir, işlem yapamazsınız.");
            return;
        }

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

        // İrsaliye Numarası 15 karakter uzunluğu zorunlu kontrolü
        fields.forEach(field => {
            const isIrsaliye = String(field.LabelText).toLowerCase().includes('irsaliye') || field.COMPID === 1002 || field.COMPID === 10102;
            if (isIrsaliye) {
                const val = String(formData[field.COMPID] || '').trim();
                if (val.length !== 15) {
                    newErrors[field.COMPID] = true;
                    if (!firstErrorId) firstErrorId = field.COMPID;
                    if (val.length === 0) {
                        missingNames.push(`${field.LabelText} (15 Karakter)`);
                    } else {
                        missingNames.push(`${field.LabelText} (15 Karakter olmalı, şu an ${val.length})`);
                    }
                }
            }
        });

        if (Object.keys(newErrors).length > 0) {
            setFormErrors(newErrors);
            setStatus({ message: `Lütfen zorunlu alanları doldurunuz veya düzeltiniz: ${missingNames.join(', ')}`, type: 'error' });
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
                
                // Dost isimleri de ekle (Etiket Şablonu eşleşmesi için)
                if (f.LabelText === 'Seri No') {
                    lineDataToSave['SeriNo'] = formData[f.COMPID];
                } else if (f.LabelText === 'Stok Kodu' || f.LabelText.includes('Ürün Seçimi')) {
                    lineDataToSave['StokKodu'] = formData[f.COMPID];
                    lineDataToSave['UrunKodu'] = formData[f.COMPID];
                } else if (f.LabelText === 'Stok Adı' || f.LabelText.includes('Ürün Adı')) {
                    lineDataToSave['StokAdi'] = formData[f.COMPID];
                    lineDataToSave['UrunAdi'] = formData[f.COMPID];
                } else if (f.LabelText === 'Miktar') {
                    lineDataToSave['Miktar'] = formData[f.COMPID];
                } else if (f.LabelText === 'Birim') {
                    lineDataToSave['Birim'] = formData[f.COMPID];
                }
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

        lineDataToSave._ownerUserId = USER_ID;

        const newLineItems = [...lineItems, lineDataToSave];
        setLineItems(newLineItems);

        // Header datasını ayır
        const currentHeader = {};
        headerFields.forEach(f => {
            currentHeader[f.COMPID] = formData[f.COMPID] || '';
        });

        // Backend'e taslak olarak asenkron kaydet
        saveDraftToDB(currentHeader, newLineItems);

        // Satır eklenir eklenmez etiket yazdır
        printLabel(lineDataToSave);

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
            const res = await fetchApi(`/dynamic-query?scrid=${SCREEN_CODE}&compid=${field.COMPID}`);
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

    const handleIrsaliyeBlur = (field, e) => {
        const value = e.target.value;
        const relatedTarget = e.relatedTarget;
        
        // Yenile butonuna basıldıysa odağı kilitleme (kullanıcının iptal etmesine izin ver)
        if (relatedTarget && (
            relatedTarget.innerText?.includes('Yenile') || 
            relatedTarget.textContent?.includes('Yenile') ||
            (relatedTarget.getAttribute && relatedTarget.getAttribute('type') === 'button')
        )) {
            return;
        }

        const val = String(value || '').trim();
        if (val.length !== 15) {
            setFormErrors(prev => ({ ...prev, [field.COMPID]: true }));
            setStatus({ 
                message: val.length === 0 
                    ? `${field.LabelText} alanı zorunludur ve 15 karakter olmalıdır!` 
                    : `${field.LabelText} tam olarak 15 karakter olmalıdır! (Girilen: ${val.length})`, 
                type: 'error' 
            });
            
            setTimeout(() => {
                if (inputRefs.current[field.COMPID]) {
                    inputRefs.current[field.COMPID].focus();
                }
            }, 10);
        } else {
            setStatus({ message: '', type: '' });
            setFormErrors(prev => {
                const next = { ...prev };
                delete next[field.COMPID];
                return next;
            });
        }
    };

    const handleIrsaliyeKeyDown = (field, e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            const val = String(e.target.value || '').trim();
            if (val.length !== 15) {
                e.preventDefault();
                setFormErrors(prev => ({ ...prev, [field.COMPID]: true }));
                setStatus({ 
                    message: val.length === 0 
                        ? `${field.LabelText} alanı zorunludur ve 15 karakter olmalıdır!` 
                        : `${field.LabelText} tam olarak 15 karakter olmalıdır! (Girilen: ${val.length})`, 
                    type: 'error' 
                });
                if (inputRefs.current[field.COMPID]) {
                    inputRefs.current[field.COMPID].focus();
                }
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Check if there are line items
        if (lineItems.length === 0) {
            alert("Lütfen en az bir kalem ekleyiniz.");
            return;
        }

        // İrsaliye Numarası final kontrolü (15 karakter)
        let irsaliyeError = false;
        headerFields.forEach(field => {
            const isIrsaliye = String(field.LabelText).toLowerCase().includes('irsaliye') || field.COMPID === 1002 || field.COMPID === 10102;
            if (isIrsaliye) {
                const val = String(formData[field.COMPID] || '').trim();
                if (val.length !== 15) {
                    irsaliyeError = true;
                    setFormErrors(prev => ({ ...prev, [field.COMPID]: true }));
                    setStatus({ 
                        message: val.length === 0 
                            ? `${field.LabelText} alanı zorunludur ve 15 karakter olmalıdır!` 
                            : `${field.LabelText} tam olarak 15 karakter olmalıdır! (Girilen: ${val.length})`, 
                        type: 'error' 
                    });
                    setTimeout(() => setStatus({ message: '', type: '' }), 5000);
                    if (inputRefs.current[field.COMPID]) {
                        inputRefs.current[field.COMPID].focus();
                    }
                }
            }
        });

        if (irsaliyeError) return;

        const currentHeader = {};
        headerFields.forEach(f => {
            currentHeader[f.COMPID] = formData[f.COMPID] || '';
        });

        const payload = {
            header: currentHeader,
            lines: lineItems,
            userId: user?.id,
            username: user?.name || user?.username || 'Admin',
            templateId: selectedTemplateId || null,
            printerId: selectedPrinterId || null
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
                        disabled={disabled || isLocked}
                        placeholder={field.LabelText + ' seçin...'}
                        value={formData[field.COMPID] || ''}
                        onClick={() => !disabled && handleOpenGuide(field)}
                    />
                    <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
                </div>
            );
        }

        const isIrsaliyeField = String(field.LabelText).toLowerCase().includes('irsaliye') || field.COMPID === 1002 || field.COMPID === 10102;

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
                onBlur={isIrsaliyeField ? (e) => handleIrsaliyeBlur(field, e) : undefined}
                onKeyDown={isIrsaliyeField ? (e) => handleIrsaliyeKeyDown(field, e) : undefined}
                readOnly={field.ComponentType === 'READONLY' || isLocked}
                disabled={disabled || isLocked}
                style={{ ...combinedStyle, ...(isLocked ? { background: '#e2e8f0', color: '#64748b', cursor: 'not-allowed', opacity: 0.8 } : {}) }}
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

            {/* Status Alert (Sadece hata ve bilgi mesajları için) */}
            {status.message && status.type !== 'success' && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '8px', backgroundColor: status.type === 'error' ? '#fee2e2' : '#e0f2fe', color: status.type === 'error' ? '#991b1b' : '#075985', fontWeight: '600', textAlign: 'center' }}>
                    {status.message}
                </div>
            )}

            {/* Başarı Mesajı - Alt Bildirim (Fixed Bottom) & 7 Saniye Kuralı */}
            {status.message && status.type === 'success' && (
                <div
                    className="fixed bottom-10 left-half -translate-x-half z-50 success-toast"
                    style={{
                        position: 'fixed',
                        bottom: '2.5rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 10000,
                        padding: '1rem 1.5rem',
                        borderRadius: '12px',
                        backgroundColor: '#dcfce7',
                        color: '#14532d',
                        fontWeight: '600',
                        textAlign: 'center',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(34, 197, 94, 0.2)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        minWidth: '320px',
                        maxWidth: '90%',
                        justifyContent: 'center',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <span style={{ fontSize: '1.25rem' }}>✅</span>
                    <span>{status.message}</span>
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
                        
                        {/* Print Settings (Etiket & Yazıcı) */}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Etiket Dizaynı</label>
                            <select 
                                className="form-input" 
                                value={selectedTemplateId} 
                                onChange={(e) => {
                                    setSelectedTemplateId(e.target.value);
                                    localStorage.setItem('selectedTemplateId', e.target.value);
                                }}
                            >
                                <option value="">Şablon Seçiniz</option>
                                {availableLabels.map(l => (
                                    <option key={l.TemplateID} value={l.TemplateID}>{l.TemplateName}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Hedef Yazıcı</label>
                            <select 
                                className="form-input" 
                                value={selectedPrinterId} 
                                onChange={(e) => {
                                    setSelectedPrinterId(e.target.value);
                                    localStorage.setItem('selectedPrinterId', e.target.value);
                                }}
                            >
                                <option value="">Yazıcı Seçiniz</option>
                                {printers.map(p => (
                                    <option key={p.PrinterID} value={p.PrinterID}>{p.PrinterName}</option>
                                ))}
                            </select>
                        </div>
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
                                                {item._ownerUserId === USER_ID && !isLocked && (
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
                                                )}
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
                            <button disabled={isLocked} onClick={handleSubmit} className="btn btn-primary" style={{ padding: '0.75rem', fontSize: '1.1rem', width: '100%', opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : 'pointer' }}>
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
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#0f172a' }}>{confirmModal.title || 'Onay Gerekiyor'}</h3>
                        <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.95rem' }}>{confirmModal.message}</p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => {
                                    if (confirmModal.onCancel) {
                                        confirmModal.onCancel();
                                    } else {
                                        // Default delete fallback logic if needed
                                    }
                                    setConfirmModal({ ...confirmModal, isOpen: false });
                                }}
                                className="btn btn-secondary"
                                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 'bold' }}
                            >
                                {confirmModal.cancelText || 'İptal'}
                            </button>
                            <button
                                onClick={() => {
                                    if (confirmModal.onConfirm) confirmModal.onConfirm();
                                    setConfirmModal({ ...confirmModal, isOpen: false });
                                }}
                                className="btn btn-primary"
                                style={{ flex: 1, backgroundColor: '#ef4444', color: 'white', fontWeight: 'bold', border: 'none' }}
                            >
                                {confirmModal.confirmText || 'Onayla'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MalKabul;
