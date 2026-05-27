import React, { useState, useEffect, useRef } from 'react';
import { useConfig } from '../context/ConfigContext';
import GuideModal from '../components/GuideModal';
import { fetchApi } from '../utils/api';

const POMalKabul = () => {
    const { params, formSchema, user } = useConfig();
    
    // Dynamic screen definition for screen 102
    const mkScreen = (formSchema?.screens || []).find(s => s.key === 'poMalKabul');
    const fields = (mkScreen?.fields || [])
        .filter(f => f.IsVisible)
        .sort((a, b) => a.SortOrder - b.SortOrder);
    const headerFields = fields.filter(f => f.SectionGroup !== 'LINE');
    const lineFields = fields.filter(f => f.SectionGroup === 'LINE');

    // Form and Header States
    const [formData, setFormData] = useState({
        '10204': new Date().toISOString().split('T')[0] // Default waybill date
    });
    
    // Multi-PO and Cari Lock States
    const [selectedOrders, setSelectedOrders] = useState([]); // [{ orderNo, cariKod, cariIsim }]
    const [lockedCariCode, setLockedCariCode] = useState(null);
    const [isLocked, setIsLocked] = useState(false);
    const [hasJoinedSharedSession, setHasJoinedSharedSession] = useState(false);
    const pollingRef = useRef(null);
    
    // Data States
    const [poLines, setPoLines] = useState([]);
    const [lineItems, setLineItems] = useState([]); // WMS session accepted items
    const [draftId, setDraftId] = useState(null);
    const [status, setStatus] = useState({ message: '', type: '' });
    
    // UI/Modal States
    const [guideModal, setGuideModal] = useState({ isOpen: false, data: [], field: null, isLineGuide: false });
    const [ekleModal, setEkleModal] = useState({ isOpen: false, line: null, qty: '', serialNo: '', dynamicValues: {} });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null, confirmText: 'Evet', cancelText: 'Hayır' });

    // Print Settings
    const [availableLabels, setAvailableLabels] = useState([]);
    const [printers, setPrinters] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState(localStorage.getItem('selectedTemplateId') || '');
    const [selectedPrinterId, setSelectedPrinterId] = useState(localStorage.getItem('selectedPrinterId') || '');

    // Dynamic field validation and focus locking refs
    const [formErrors, setFormErrors] = useState({});
    const inputRefs = useRef({});

    const USER_ID = user?.id;
    const SCREEN_CODE = '102'; // PoMalKabul Screen ID

    // Mount hook to check active drafts
    useEffect(() => {
        const checkDraft = async () => {
            try {
                const res = await fetchApi(`/drafts/get-active?userId=${USER_ID}&screenCode=${SCREEN_CODE}`);
                if (res.success && res.draft) {
                    setConfirmModal({
                        isOpen: true,
                        title: 'Yarım Kalan İşlem',
                        message: "Yarım kalan bir Siparişli Mal Kabul işleminiz var, devam etmek ister misiniz?",
                        confirmText: 'Evet, Devam Et',
                        cancelText: 'Hayır, Sil',
                        onConfirm: async () => {
                            setHasJoinedSharedSession(true);
                            const savedHeader = JSON.parse(res.draft.HeaderData || '{}');
                            const savedLines = JSON.parse(res.draft.LineData || '[]');
                            setDraftId(res.draft.DraftID);
                            setFormData(savedHeader);
                            setLineItems(savedLines);

                            // Reconstruct selected orders and locked cari code
                            const orderNum = savedHeader['10202'] || savedHeader.orderNo;
                            if (orderNum) {
                                const orderNums = orderNum.split(',').map(x => x.trim()).filter(Boolean);
                                const cariK = savedHeader.cariKod || savedHeader._cariKod || '';
                                const cariI = savedHeader['10201'] || savedHeader.cariIsim || '';
                                
                                setSelectedOrders(orderNums.map(num => ({
                                    orderNo: num,
                                    cariKod: cariK,
                                    cariIsim: cariI
                                })));
                                if (cariK) {
                                    setLockedCariCode(cariK);
                                }
                                await fetchPOLines(orderNum);
                            }
                            setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        }
                    });
                }
            } catch (error) {
                console.error("Draft check failed:", error);
            }
        };
        if (USER_ID) checkDraft();

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
    }, [USER_ID]);

    // 1. Polling (Senkronizasyon) Mekanizması
    useEffect(() => {
        const cariKod = formData.cariKod || formData._cariKod || formData['10201'];
        const irsaliyeNo = formData['10203'] || formData.irsaliyeNo;

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
                                    setFormData({ '10204': new Date().toISOString().split('T')[0] });
                                    setLineItems([]);
                                    setLockedCariCode(null);
                                    setSelectedOrders([]);
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
    }, [formData.cariKod, formData._cariKod, formData['10201'], formData['10203'], formData.irsaliyeNo, hasJoinedSharedSession, lineItems.length]);

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

    // Auto-generate serial number immediately when the Ekle modal is opened and serial tracking is active
    useEffect(() => {
        const generateSerialIfActive = async () => {
            if (ekleModal.isOpen && ekleModal.line) {
                // WMS tarafında izlenebilirliği takip edebilmek için seri no hep açık
                const isSerialActive = true;
                
                if (isSerialActive) {
                    setEkleModal(prev => ({ ...prev, serialNo: 'Üretiliyor...' }));
                    try {
                        const res = await fetchApi('/serials/next');
                        if (res.success && res.serial) {
                            setEkleModal(prev => ({ ...prev, serialNo: res.serial }));
                        } else {
                            setEkleModal(prev => ({ ...prev, serialNo: '' }));
                        }
                    } catch (err) {
                        setEkleModal(prev => ({ ...prev, serialNo: '' }));
                        console.error("Seri numarası üretim hatası:", err);
                    }
                }
            }
        };
        generateSerialIfActive();
    }, [ekleModal.isOpen, ekleModal.line, params.SERINETSISEYAZ]);

    // Fetch Netsis PO Lines
    const fetchPOLines = async (orderId) => {
        try {
            setStatus({ message: 'Sipariş satırları yükleniyor...', type: 'info' });
            const res = await fetchApi(`/integration/orders/${orderId}/lines`);
            if (res.success) {
                const lines = res.lines || [];
                setPoLines(lines);
                setStatus({ message: '', type: '' });

                // Extract actual CariKod from the first PO line (_STHAR_ACIKLAMA) and save to formData & DB Draft
                if (lines.length > 0 && lines[0]._STHAR_ACIKLAMA) {
                    const firstCariKod = lines[0]._STHAR_ACIKLAMA;
                    setLockedCariCode(firstCariKod);
                    setFormData(prev => {
                        const updated = {
                            ...prev,
                            cariKod: firstCariKod,
                            _cariKod: firstCariKod
                        };
                        saveDraftToDB(updated, lineItems);
                        return updated;
                    });
                }
            } else {
                setStatus({ message: 'Sipariş satırları yüklenemedi: ' + res.message, type: 'error' });
            }
        } catch (err) {
            setStatus({ message: 'Bağlantı hatası: ' + err.message, type: 'error' });
        }
    };

    // Open PO Guide Modal
    const handleOpenOrderGuide = async () => {
        try {
            setStatus({ message: 'Sipariş listesi alınıyor...', type: 'info' });
            // Using the dynamic query endpoint for Screen 102 Component 10202 (Sipariş Seçimi) with Cari filter if locked
            const url = `/dynamic-query?scrid=102&compid=10202${lockedCariCode ? `&cariKod=${encodeURIComponent(lockedCariCode)}` : ''}`;
            const res = await fetchApi(url);
            if (res.success) {
                setStatus({ message: '', type: '' });
                setGuideModal({
                    isOpen: true,
                    data: res.data,
                    field: { COMPID: '10202', LabelText: 'Sipariş Seçimi', GuideDisplayType: 'CARD' },
                    isLineGuide: false
                });
            } else {
                setStatus({ message: 'Sipariş listesi alınamadı: ' + res.message, type: 'error' });
            }
        } catch (err) {
            setStatus({ message: 'Bağlantı hatası: ' + err.message, type: 'error' });
        }
    };

    // Open Line Field Guide
    const handleOpenLineGuide = async (field) => {
        try {
            setStatus({ message: `${field.LabelText} listesi alınıyor...`, type: 'info' });
            const res = await fetchApi(`/dynamic-query?scrid=${SCREEN_CODE}&compid=${field.COMPID}`);
            if (res.success) {
                setStatus({ message: '', type: '' });
                setGuideModal({
                    isOpen: true,
                    data: res.data,
                    field: field,
                    isLineGuide: true
                });
            } else {
                setStatus({ message: 'Liste alınamadı: ' + res.message, type: 'error' });
            }
        } catch (err) {
            setStatus({ message: 'Bağlantı hatası: ' + err.message, type: 'error' });
        }
    };

    // Select PO from Guide
    const handleSelectPO = async (item) => {
        const orderNo = item.FATIRS_NO || Object.values(item)[0];
        const cariIsim = item.CARI_ISIM || Object.values(item)[1] || '';
        const cariKod = item.CARI_KODU || item.CARI_KOD || '';

        // Check if already selected
        if (selectedOrders.some(o => o.orderNo === orderNo)) {
            alert('Bu sipariş zaten seçilmiş.');
            setGuideModal(prev => ({ ...prev, isOpen: false }));
            return;
        }

        const newOrderObj = { orderNo, cariKod, cariIsim };
        const updatedOrders = [...selectedOrders, newOrderObj];
        setSelectedOrders(updatedOrders);

        // Cari lock logic
        const targetCariKod = lockedCariCode || cariKod;
        const targetCariIsim = selectedOrders.length === 0 ? cariIsim : (formData['10201'] || cariIsim);

        if (selectedOrders.length === 0 && cariKod) {
            setLockedCariCode(cariKod);
        }

        const orderNoStr = updatedOrders.map(o => o.orderNo).join(',');

        const newHeader = {
            ...formData,
            orderNo: orderNoStr,
            cariKod: targetCariKod,
            cariIsim: targetCariIsim,
            '10202': orderNoStr, 
            '10201': targetCariIsim, 
            _cariKod: targetCariKod
        };

        setFormData(newHeader);
        setGuideModal(prev => ({ ...prev, isOpen: false }));

        // Save new draft to DB immediately
        await saveDraftToDB(newHeader, lineItems);

        // Fetch lines for all selected orders merged
        await fetchPOLines(orderNoStr);
    };

    // Remove PO from Selection
    const handleRemovePO = async (orderNoToRemove) => {
        const updatedOrders = selectedOrders.filter(o => o.orderNo !== orderNoToRemove);
        setSelectedOrders(updatedOrders);

        if (updatedOrders.length === 0) {
            // Reset everything if all POs are removed
            setLockedCariCode(null);
            setPoLines([]);
            setLineItems([]);

            const newHeader = {
                ...formData,
                orderNo: '',
                cariKod: '',
                cariIsim: '',
                '10202': '',
                '10201': '',
                _cariKod: ''
            };
            setFormData(newHeader);
            await saveDraftToDB(newHeader, []);
        } else {
            // Recalculate orderNo string
            const orderNoStr = updatedOrders.map(o => o.orderNo).join(',');
            
            // Filter lineItems that belong to remaining orders
            const updatedLineItems = lineItems.filter(item => {
                let parsedDynamic = {};
                try {
                    parsedDynamic = item.DynamicFieldsJSON ? JSON.parse(item.DynamicFieldsJSON) : {};
                } catch(e){}
                const itemOrderNo = item.orderNo || parsedDynamic._STra_SIPNUM || parsedDynamic.STra_SIPNUM;
                return updatedOrders.some(o => o.orderNo === itemOrderNo);
            });
            setLineItems(updatedLineItems);

            const newHeader = {
                ...formData,
                orderNo: orderNoStr,
                '10202': orderNoStr
            };
            setFormData(newHeader);
            await saveDraftToDB(newHeader, updatedLineItems);

            // Fetch remaining lines
            await fetchPOLines(orderNoStr);
        }
    };

    // Save current state as active draft
    const saveDraftToDB = async (header, lines) => {
        const myLines = lines.filter(l => l._ownerUserId === USER_ID);
        try {
            await fetchApi('/drafts/save', {
                method: 'POST',
                body: JSON.stringify({
                    userId: USER_ID,
                    screenCode: SCREEN_CODE,
                    headerData: header,
                    lineData: myLines
                })
            });
        } catch (err) {
            console.error('Draft save failed:', err);
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

    // Open Ekle modal for a PO Line
    const handleOpenEkleModal = async (line) => {
        const accepted = lineItems
            .filter(li => li.StokKodu === line.STOK_KODU && (li.SiparisNo === line.SIPARIS_NO || li.orderNo === line.SIPARIS_NO))
            .reduce((sum, li) => sum + parseFloat(li.Miktar || 0), 0);
        
        const remaining = line.KALAN_MIKTAR - accepted;
        if (remaining <= 0) {
            alert('Bu satır için kabul edilecek miktar kalmadı.');
            return;
        }

        const initialDynamic = {};
        lineFields.forEach(f => {
            initialDynamic[f.COMPID] = f.DefaultValue || '';
        });

        setEkleModal({
            isOpen: true,
            line,
            qty: String(remaining),
            serialNo: '',
            dynamicValues: initialDynamic
        });
    };

    // Confirm add item from modal
    const handleConfirmEkle = async () => {
        const { line, qty, serialNo, dynamicValues } = ekleModal;
        if (!qty || parseFloat(qty) <= 0) {
            alert('Lütfen geçerli bir miktar girin.');
            return;
        }

        const parsedQty = parseFloat(qty);
        const accepted = lineItems
            .filter(li => li.StokKodu === line.STOK_KODU && (li.SiparisNo === line.SIPARIS_NO || li.orderNo === line.SIPARIS_NO))
            .reduce((sum, li) => sum + parseFloat(li.Miktar || 0), 0);
        const remaining = line.KALAN_MIKTAR - accepted;

        if (parsedQty > remaining) {
            alert('Bu sipariş satırı için fazla miktar girdiniz');
            return;
        }

        // WMS tarafında izlenebilirliği takip edebilmek için seri no hep açık
        const isSerialActive = true;

        if (isSerialActive && (!serialNo || serialNo === 'Üretiliyor...')) {
            alert('Seri No alanı boş veya henüz üretilmemiş, lütfen bekleyin.');
            return;
        }

        // Validate required line dynamic fields
        for (const f of lineFields) {
            if (f.IsRequired && !dynamicValues[f.COMPID]) {
                alert(`${f.LabelText} alanı boş bırakılamaz.`);
                return;
            }
        }

        // Build DynamicFields JSON map
        const dynamicFields = {
            _GIRISSERI: line._GIRISSERI || 'H',
            _STHAR_NF: line._STHAR_NF,
            _STHAR_BF: line._STHAR_BF,
            _STRA_SIPKONT: line._STRA_SIPKONT,
            _STHAR_ACIKLAMA: line._STHAR_ACIKLAMA,
            _STra_SIPNUM: line.SIPARIS_NO // Save individual order number for the line!
        };

        if (isSerialActive) {
            dynamicFields['10108'] = serialNo; // Seri No Component ID
        }

        Object.keys(dynamicValues).forEach(key => {
            dynamicFields[key] = dynamicValues[key];
        });

        const newItem = {
            StokKodu: line.STOK_KODU,
            UrunKodu: line.STOK_KODU,
            StokAdi: line.STOK_ADI,
            UrunAdi: line.STOK_ADI,
            Miktar: parsedQty,
            Birim: line.OLCU_BR1 || 'ADET',
            SeriNo: isSerialActive ? serialNo : '',
            orderNo: line.SIPARIS_NO, // Keep track of which order this accepted line belongs to
            SiparisNo: line.SIPARIS_NO, // Bulletproof composite key match
            _ownerUserId: USER_ID,
            DynamicFieldsJSON: JSON.stringify(dynamicFields)
        };

        const updatedLines = [...lineItems, newItem];
        setLineItems(updatedLines);

        // Update database draft
        await saveDraftToDB(formData, updatedLines);

        // Satır eklenir eklenmez etiket yazdır
        printLabel(newItem);

        setEkleModal({ isOpen: false, line: null, qty: '', serialNo: '', dynamicValues: {} });
        setStatus({ message: 'Kalem başarıyla taslağa eklendi.', type: 'success' });
    };

    // Remove item from draft
    const handleRemoveItem = async (index) => {
        const updatedLines = lineItems.filter((_, idx) => idx !== index);
        setLineItems(updatedLines);
        await saveDraftToDB(formData, updatedLines);
        setStatus({ message: 'Kalem taslaktan silindi.', type: 'info' });
        setTimeout(() => setStatus({ message: '', type: '' }), 2000);
    };

    // Handle standard input change
    const handleChange = (id, value) => {
        setFormData(prev => {
            const updated = { ...prev, [id]: value };
            saveDraftToDB(updated, lineItems);
            return updated;
        });
        if (formErrors[id]) {
            setFormErrors(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        }
    };

    // Waybill validation blur handler
    const handleIrsaliyeBlur = (field, e) => {
        const value = e.target.value;
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

    // Waybill validation keypress handler
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

    // Dynamic field renderer for header fields
    const renderHeaderField = (field) => {
        const isCariField = field.COMPID === 10201 || String(field.LabelText).toLowerCase().includes('cari');
        const isLocked = isCariField && lockedCariCode !== null;

        const hasError = formErrors[field.COMPID];
        const baseStyle = {
            cursor: field.ComponentType === 'GUIDE' ? 'pointer' : 'text',
            background: (field.ComponentType === 'READONLY' || isLocked) ? '#f1f5f9' : '#f8fafc',
        };
        const errorStyle = hasError ? { border: '1px solid #ef4444', boxShadow: '0 0 0 2px rgba(239, 68, 68, 0.2)' } : {};
        const combinedStyle = { ...baseStyle, ...errorStyle };

        // 10202 (Sipariş Seçimi) Tag-based Multi-Select Render
        if (field.COMPID === 10202) {
            return (
                <div 
                    key={field.COMPID} 
                    className="multi-select-container"
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        minHeight: '42px',
                        border: '1px solid #cbd5e1',
                        borderRadius: 'var(--border-radius, 8px)',
                        background: '#f8fafc',
                        cursor: 'pointer',
                        transition: 'border-color 0.2s',
                        position: 'relative'
                    }}
                    onClick={handleOpenOrderGuide}
                >
                    {selectedOrders.length === 0 ? (
                        <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                            {field.LabelText} seçmek için tıklayın...
                        </span>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', paddingRight: '2rem' }}>
                            {selectedOrders.map(order => (
                                <span 
                                    key={order.orderNo}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        background: 'var(--primary-light, #e0f2fe)',
                                        color: 'var(--primary-color, #0369a1)',
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: '600',
                                        border: '1px solid #bae6fd',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation(); // Avoid triggering open guide
                                        handleRemovePO(order.orderNo);
                                    }}
                                >
                                    {order.orderNo}
                                    <span 
                                        style={{ 
                                            cursor: 'pointer', 
                                            fontWeight: 'bold', 
                                            color: '#ef4444',
                                            marginLeft: '0.1rem',
                                            fontSize: '0.8rem'
                                        }}
                                        title="Kaldır"
                                    >
                                        ✖
                                    </span>
                                </span>
                            ))}
                        </div>
                    )}
                    <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>🔍</span>
                </div>
            );
        }

        if (field.ComponentType === 'GUIDE') {
            return (
                <div style={{ position: 'relative' }} key={field.COMPID}>
                    <input
                        ref={el => inputRefs.current[field.COMPID] = el}
                        className="form-input"
                        style={combinedStyle}
                        readOnly
                        placeholder={field.LabelText + ' seçmek için tıklayın...'}
                        value={formData[field.COMPID] || ''}
                        onClick={handleOpenOrderGuide}
                    />
                    <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>🔍</span>
                </div>
            );
        }

        const isIrsaliyeField = String(field.LabelText).toLowerCase().includes('irsaliye') || field.COMPID === 10203;

        return (
            <input
                key={field.COMPID}
                ref={el => inputRefs.current[field.COMPID] = el}
                className="form-input"
                type={field.ComponentType === 'DATE' ? 'date' : 'text'}
                maxLength={field.MaxLength || 50}
                value={formData[field.COMPID] || field.DefaultValue || ''}
                onChange={(e) => handleChange(field.COMPID, e.target.value)}
                onBlur={isIrsaliyeField ? (e) => handleIrsaliyeBlur(field, e) : undefined}
                onKeyDown={isIrsaliyeField ? (e) => handleIrsaliyeKeyDown(field, e) : undefined}
                readOnly={field.ComponentType === 'READONLY' || isLocked || isLocked}
                disabled={isLocked || isLocked}
                style={{
                    ...combinedStyle,
                    ...(isLocked ? { background: '#e2e8f0', color: '#64748b', cursor: 'not-allowed', opacity: 0.8 } : {})
                }}
            />
        );
    };

    // Finalize and Submit to Netsis
    const handleSubmitToNetsis = async () => {
        const orderNo = formData['10202'] || formData.orderNo;
        const irsaliyeNo = formData['10203'] || formData.irsaliyeNo;
        const irsaliyeTarih = formData['10204'] || formData.irsaliyeTarih;

        if (!orderNo) {
            alert('Lütfen önce en az bir sipariş seçin.');
            return;
        }
        if (!irsaliyeNo) {
            alert('Lütfen İrsaliye Numarasını girin.');
            return;
        }
        if (irsaliyeNo.length !== 15) {
            alert('İrsaliye numarası tam olarak 15 karakter olmalıdır.');
            return;
        }
        if (lineItems.length === 0) {
            alert('Kabul edilmiş en az bir satır bulunmalıdır.');
            return;
        }

        // Build Payload matching backend's saveReceipt expected structure
        // Map 102 header values into 101 expected keys for saveReceipt compatibility
        const payload = {
            header: {
                '10101': formData._cariKod || formData.cariKod || formData['10201'], // Cari Seçim
                '10102': irsaliyeNo,                                                 // İrsaliye No
                '10103': irsaliyeTarih,                                              // İrsaliye Tarihi
                '10201': formData._cariKod || formData.cariKod || formData['10201'],
                '10202': orderNo,
                '10203': irsaliyeNo,
                '10204': irsaliyeTarih
            },
            lines: lineItems.map(item => {
                let parsedDynamic = {};
                try {
                    parsedDynamic = item.DynamicFieldsJSON ? JSON.parse(item.DynamicFieldsJSON) : {};
                } catch(e) {}

                return {
                    '10104': item.StokKodu,
                    '10105': item.Miktar,
                    '10106': item.Birim || 'ADET',
                    '10108': item.SeriNo || '',
                    '10112': item.StokAdi,
                    ...parsedDynamic
                };
            }),
            userId: USER_ID,
            username: user?.name || user?.username || 'Operator',
            templateId: selectedTemplateId || null,
            printerId: selectedPrinterId || null
        };

        try {
            setStatus({ message: 'İşlem Netsis entegrasyon kuyruğuna gönderiliyor...', type: 'info' });
            const res = await fetchApi(`/process?draftId=${draftId || ''}`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (res && res.success) {
                setStatus({ message: 'Başarılı! Fiş WMS\'e kaydedildi, Netsis kuyruğuna alındı.', type: 'success' });
                
                // Fire Netsis integration worker instantly
                if (res.receiptId) {
                    fetchApi('/integration/send-to-netsis', { method: 'POST', body: JSON.stringify({ receiptId: res.receiptId }) })
                        .catch(err => console.error("Immediate Netsis transfer failed:", err));
                }

                // Reset page state
                setFormData({
                    '10204': new Date().toISOString().split('T')[0]
                });
                setSelectedOrders([]);
                setLockedCariCode(null);
                setPoLines([]);
                setLineItems([]);
                setDraftId(null);
            } else {
                setStatus({ message: 'Hata: ' + (res?.message || 'Bilinmeyen bir hata oluştu.'), type: 'error' });
            }
        } catch (err) {
            setStatus({ message: 'Hata: ' + err.message, type: 'error' });
        }
    };

    // Calculate background color dynamically based on WMS accepted quantities (Soft colors)
    const getRowBgColor = (accepted, line) => {
        const totalOrderQty = parseFloat(line.MIKTAR || 0);
        const prevReceivedQty = parseFloat(line.TESLIM_MIKTAR || 0);
        const currentRemainingQty = parseFloat(line.KALAN_MIKTAR || 0);

        if (accepted === 0) {
            return '#fef2f2'; // bg-red-50 (Soft Red) - No process started
        }
        
        // If current accepted fully covers the remaining Netsis PO quantity (or equals total order quantity)
        if (accepted >= currentRemainingQty || (accepted + prevReceivedQty) >= totalOrderQty) {
            return '#f0fdf4'; // bg-green-50 (Soft Green) - Full acceptance
        }
        
        return '#fff7ed'; // bg-orange-50 (Soft Orange) - Partial acceptance
    };

    const getRowTextColor = (accepted, line) => {
        const totalOrderQty = parseFloat(line.MIKTAR || 0);
        const prevReceivedQty = parseFloat(line.TESLIM_MIKTAR || 0);
        const currentRemainingQty = parseFloat(line.KALAN_MIKTAR || 0);

        if (accepted === 0) {
            return '#ef4444'; // Red text
        }
        if (accepted >= currentRemainingQty || (accepted + prevReceivedQty) >= totalOrderQty) {
            return '#10b981'; // Green text
        }
        return '#f59e0b'; // Orange text
    };

    const hasActiveOrder = formData['10202'] || formData.orderNo;

    return (
        <div className="po-mal-kabul-page" style={{ paddingBottom: '3rem' }}>
            {/* Status Alert Ribbon (Sadece hata ve bilgi mesajları için) */}
            {status.message && status.type !== 'success' && (
                <div style={{
                    padding: '1rem',
                    borderRadius: 'var(--border-radius)',
                    background: status.type === 'error' ? '#fee2e2' : '#e0f2fe',
                    color: status.type === 'error' ? '#991b1b' : '#075985',
                    fontWeight: 600,
                    marginBottom: '1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <span>{status.message}</span>
                    <button onClick={() => setStatus({ message: '', type: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: 'inherit' }}>✕</button>
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
                        borderRadius: 'var(--border-radius, 12px)',
                        backgroundColor: '#d1fae5',
                        color: '#065f46',
                        fontWeight: '600',
                        textAlign: 'center',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(5, 150, 105, 0.2)',
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 className="brand-text" style={{ color: 'var(--secondary-color)', fontSize: '2rem' }}>Siparişe Bağlı Mal Kabul</h1>
                    <p className="text-muted" style={{ fontSize: '0.95rem' }}>Netsis sipariş satırlarını kontrollü ve güvenli şekilde WMS taslağına aktarma ekranı.</p>
                </div>
            </div>

            {/* Header Form Card */}
            <div className="card" style={{ padding: '1.75rem' }}>
                <h3 style={{ marginBottom: '1.25rem', fontSize: '1.2rem', color: 'var(--secondary-color)' }}>Sipariş & Evrak Bilgileri</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                    {headerFields.map(field => (
                        <div key={field.COMPID} className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">
                                {field.LabelText}
                                {field.IsRequired && <span style={{ color: '#ef4444', marginLeft: '0.25rem', fontWeight: 'bold' }}>*</span>}
                            </label>
                            {renderHeaderField(field)}
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

            {/* PO Lines Grid Card */}
            {hasActiveOrder && (
                <div className="card" style={{ padding: '1.75rem', overflowX: 'auto' }}>
                    <h3 style={{ marginBottom: '1.25rem', fontSize: '1.2rem', color: 'var(--secondary-color)' }}>
                        Sipariş Kalemleri (Netsis)
                    </h3>
                    
                    <table className="user-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                <th className="col-islem" style={{ borderBottom: '2px solid #e2e8f0' }}>İşlem</th>
                                <th className="col-urun-adi" style={{ borderBottom: '2px solid #e2e8f0' }}>Ürün Adı</th>
                                <th className="col-siparis-miktari" style={{ borderBottom: '2px solid #e2e8f0' }}>Sipariş Miktarı</th>
                                <th className="col-once-gelen" style={{ borderBottom: '2px solid #e2e8f0' }}>Önceden Gelen</th>
                                <th className="col-kabul-edilen" style={{ borderBottom: '2px solid #e2e8f0' }}>Kabul Edilen (WMS)</th>
                                <th className="col-kalan" style={{ borderBottom: '2px solid #e2e8f0' }}>Kalan</th>
                                <th className="col-durum" style={{ borderBottom: '2px solid #e2e8f0' }}>Durum</th>
                                <th className="col-siparis-no" style={{ borderBottom: '2px solid #e2e8f0' }}>Sipariş No</th>
                                <th className="col-stok-kodu" style={{ borderBottom: '2px solid #e2e8f0' }}>Stok Kodu</th>
                            </tr>
                        </thead>
                        <tbody>
                            {poLines.length === 0 ? (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        Bu siparişe ait açık satır bulunamadı.
                                    </td>
                                </tr>
                            ) : (() => {
                                // Sort PO Lines by Sipariş No for visual grouping
                                const sortedPoLines = [...poLines].sort((a, b) => 
                                    String(a.SIPARIS_NO || '').localeCompare(String(b.SIPARIS_NO || ''))
                                );
                                
                                let lastSiparisNo = null;

                                return sortedPoLines.map((line, idx) => {
                                    const accepted = lineItems
                                        .filter(li => li.StokKodu === line.STOK_KODU && (li.SiparisNo === line.SIPARIS_NO || li.orderNo === line.SIPARIS_NO))
                                        .reduce((sum, li) => sum + parseFloat(li.Miktar || 0), 0);
                                    
                                    const remaining = line.KALAN_MIKTAR - accepted;
                                    const rowBg = getRowBgColor(accepted, line);
                                    const rowText = getRowTextColor(accepted, line);

                                    // Dynamic badge styles based on acceptance
                                    let statusText = 'İşlem Başlamadı';
                                    let badgeBg = '#fef2f2';
                                    let badgeText = '#ef4444';
                                    let badgeBorder = '#fecaca';
                                    
                                    if (accepted > 0) {
                                        if (accepted >= line.KALAN_MIKTAR || (accepted + (line.TESLIM_MIKTAR || 0)) >= line.MIKTAR) {
                                            statusText = 'Tam Kabul';
                                            badgeBg = '#f0fdf4';
                                            badgeText = '#10b981';
                                            badgeBorder = '#bbf7d0';
                                        } else {
                                            statusText = 'Kısmi Kabul';
                                            badgeBg = '#fff7ed';
                                            badgeText = '#f59e0b';
                                            badgeBorder = '#fed7aa';
                                        }
                                    }

                                    const isNewGroup = line.SIPARIS_NO !== lastSiparisNo;
                                    lastSiparisNo = line.SIPARIS_NO;

                                    return (
                                        <React.Fragment key={idx}>
                                            {isNewGroup && (
                                                <tr style={{ background: '#f1f5f9' }}>
                                                    <td 
                                                        colSpan={9} 
                                                        style={{ 
                                                            padding: '0.6rem 1rem', 
                                                            fontWeight: 'bold', 
                                                            color: 'var(--secondary-color)', 
                                                            fontSize: '0.9rem',
                                                            borderBottom: '1px solid #cbd5e1',
                                                            position: 'sticky',
                                                            left: 0,
                                                            zIndex: 8,
                                                            background: '#f1f5f9'
                                                        }}
                                                    >
                                                        📦 Sipariş: <span style={{ fontFamily: 'monospace', background: '#e2e8f0', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{line.SIPARIS_NO}</span>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr style={{
                                                backgroundColor: rowBg,
                                                transition: 'all 0.2s ease',
                                                color: '#1e293b'
                                            }}>
                                                <td className="col-islem" style={{ 
                                                    background: rowBg,
                                                    borderBottom: '1px solid #e2e8f0'
                                                }}>
                                                    <button
                                                        onClick={() => handleOpenEkleModal(line)}
                                                        className="btn btn-primary btn-action-kabul"
                                                        disabled={remaining <= 0 || isLocked}
                                                        style={{
                                                            opacity: (remaining <= 0 || isLocked) ? 0.4 : 1,
                                                            cursor: (remaining <= 0 || isLocked) ? 'not-allowed' : 'pointer'
                                                        }}
                                                    >
                                                        ➕<span className="btn-action-text"> Kabul Ekle</span>
                                                    </button>
                                                </td>
                                                <td className="col-urun-adi" style={{ borderBottom: '1px solid #e2e8f0' }}>{line.STOK_ADI}</td>
                                                <td className="col-siparis-miktari" style={{ fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' }}>{line.MIKTAR}</td>
                                                <td className="col-once-gelen" style={{ color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{line.TESLIM_MIKTAR || 0}</td>
                                                <td className="col-kabul-edilen" style={{ fontWeight: 'bold', color: rowText, borderBottom: '1px solid #e2e8f0' }}>{accepted}</td>
                                                <td className="col-kalan" style={{ fontWeight: 'bold', color: remaining > 0 ? 'var(--primary-color)' : '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>
                                                    {remaining}
                                                </td>
                                                <td className="col-durum" style={{ 
                                                    borderBottom: '1px solid #e2e8f0'
                                                }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '0.25rem 0.75rem',
                                                        borderRadius: '20px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '700',
                                                        backgroundColor: badgeBg,
                                                        color: badgeText,
                                                        border: `1px solid ${badgeBorder}`,
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                    }}>
                                                        {statusText}
                                                    </span>
                                                </td>
                                                <td className="col-siparis-no" style={{ fontWeight: 'bold', fontFamily: 'monospace', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{line.SIPARIS_NO}</td>
                                                <td className="col-stok-kodu" style={{ fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>{line.STOK_KODU}</td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            )}

            {/* WMS Scanned Items Card */}
            {lineItems.length > 0 && (
                <div className="card" style={{ padding: '1.75rem', border: '1px solid #cbd5e1' }}>
                    <h3 style={{ marginBottom: '1.25rem', fontSize: '1.2rem', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        📥 Okutulan Ürünler / Taslak Kalemleri
                        <span style={{ fontSize: '0.8rem', background: '#3b82f6', color: 'white', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>{lineItems.length} Kalem</span>
                    </h3>

                    <table className="user-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                <th style={{ padding: '0.75rem' }}>Stok Kodu / Adı</th>
                                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Kabul Miktarı</th>
                                <th style={{ padding: '0.75rem' }}>Takip Numaraları</th>
                                <th style={{ padding: '0.75rem', textAlign: 'center' }}>İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((item, index) => {
                                let parsedFields = {};
                                try {
                                    parsedFields = item.DynamicFieldsJSON ? JSON.parse(item.DynamicFieldsJSON) : {};
                                } catch(e){}

                                const details = [];
                                if (item.SeriNo) details.push(`Seri: ${item.SeriNo}`);
                                if (parsedFields['10199']) details.push(`Lot: ${parsedFields['10199']}`);
                                if (parsedFields['10198']) details.push(`SKT: ${parsedFields['10198']}`);
                                if (parsedFields['10197']) details.push(`Ürt: ${parsedFields['10197']}`);

                                return (
                                    <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ fontWeight: 'bold' }}>{item.StokKodu}</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.StokAdi}</div>
                                        </td>
                                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--success)' }}>
                                            {item.Miktar} {item.Birim}
                                        </td>
                                        <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                                            {details.length > 0 ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                    {details.map((d, i) => (
                                                        <span key={i} style={{ background: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>{d}</span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>Standart Stok</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                            {item._ownerUserId === USER_ID && !isLocked && (
                                                <button
                                                    onClick={() => handleRemoveItem(index)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--error)',
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold',
                                                        fontSize: '0.9rem'
                                                    }}
                                                    title="Taslaktan çıkar"
                                                >
                                                    🗑️ Sil
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                        <button
                            onClick={handleSubmitToNetsis}
                            disabled={isLocked}
                            className="btn btn-primary"
                            style={{ padding: '0.875rem 2rem', fontSize: '1.05rem', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)', opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : 'pointer' }}
                        >
                            🚀 Netsis'e Gönder ve Kabulü Kapat
                        </button>
                    </div>
                </div>
            )}

            {/* GuideModal Integration */}
            <GuideModal
                isOpen={guideModal.isOpen}
                onClose={() => setGuideModal(prev => ({ ...prev, isOpen: false }))}
                title={guideModal.field?.LabelText}
                data={guideModal.data}
                onSelect={(item) => {
                    if (guideModal.isLineGuide) {
                        const val = Object.values(item)[0];
                        setEkleModal(prev => ({
                            ...prev,
                            dynamicValues: { ...prev.dynamicValues, [guideModal.field.COMPID]: val }
                        }));
                        setGuideModal(prev => ({ ...prev, isOpen: false }));
                    } else {
                        handleSelectPO(item);
                    }
                }}
                displayType={guideModal.field?.GuideDisplayType}
            />

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
                                {confirmModal.confirmText || 'Evet'}
                            </button>
                            <button
                                onClick={async () => {
                                    if (confirmModal.onCancel) {
                                        confirmModal.onCancel();
                                    } else {
                                        // Default behavior (deactivate draft)
                                        if (USER_ID) {
                                            try {
                                                await fetchApi('/drafts/save', {
                                                    method: 'POST',
                                                    body: JSON.stringify({ userId: USER_ID, screenCode: SCREEN_CODE, headerData: {}, lineData: [] })
                                                });
                                            } catch (e){}
                                        }
                                    }
                                    setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
                                }}
                                className="btn"
                                style={{ padding: '0.5rem 1.5rem', border: '1px solid #cbd5e1', background: 'white' }}
                            >
                                {confirmModal.cancelText || 'Hayır'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Ekle Modal (Popup for entering goods receipt line details) */}
            {ekleModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2500, padding: '1rem' }}>
                    <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '1.75rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ fontSize: '1.25rem', color: 'var(--secondary-color)' }}>
                                {ekleModal.line?.STOK_ADI} ({ekleModal.line?.STOK_KODU})
                            </h3>
                            <button onClick={() => setEkleModal({ isOpen: false, line: null, qty: '', serialNo: '', dynamicValues: {} })} style={{ border: 'none', background: 'none', fontSize: '1.25rem', cursor: 'pointer' }}>✕</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div className="form-group">
                                <label className="form-label">Kabul Miktarı ({ekleModal.line?.OLCU_BR1})</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    step="0.01"
                                    value={ekleModal.qty}
                                    onChange={(e) => setEkleModal(prev => ({ ...prev, qty: e.target.value }))}
                                />
                            </div>

                            {/* Seri No (Auto Generated - Strictly Read-Only) */}
                            {true && (
                                <div className="form-group">
                                    <label className="form-label">Seri Numarası (Seri takipli ürün)</label>
                                    <input
                                        className="form-input"
                                        style={{ background: '#f1f5f9', fontWeight: 'bold', color: '#64748b', cursor: 'not-allowed' }}
                                        value={ekleModal.serialNo || ''}
                                        readOnly
                                        disabled={true}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                                        ⚠️ Seri numarası sistem tarafından otomatik üretilmiştir ve değiştirilemez.
                                    </span>
                                </div>
                            )}

                            {/* Dynamic Line Fields */}
                            {lineFields.map(field => (
                                <div className="form-group" key={field.COMPID}>
                                    <label className="form-label">
                                        {field.LabelText} {field.IsRequired && <span style={{color: 'red'}}>*</span>}
                                    </label>
                                    {field.ComponentType === 'GUIDE' ? (
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <input
                                                className="form-input"
                                                value={ekleModal.dynamicValues?.[field.COMPID] || ''}
                                                onChange={(e) => setEkleModal(prev => ({
                                                    ...prev,
                                                    dynamicValues: { ...prev.dynamicValues, [field.COMPID]: e.target.value }
                                                }))}
                                                placeholder={`${field.LabelText} girin veya seçin...`}
                                            />
                                            <button 
                                                className="btn" 
                                                onClick={() => handleOpenLineGuide(field)}
                                                style={{ background: '#f1f5f9', padding: '0 1rem', border: '1px solid #cbd5e1' }}
                                            >
                                                🔍
                                            </button>
                                        </div>
                                    ) : field.ComponentType === 'DATE' ? (
                                        <input
                                            className="form-input"
                                            type="date"
                                            value={ekleModal.dynamicValues?.[field.COMPID] || ''}
                                            onChange={(e) => setEkleModal(prev => ({
                                                ...prev,
                                                dynamicValues: { ...prev.dynamicValues, [field.COMPID]: e.target.value }
                                            }))}
                                        />
                                    ) : (
                                        <input
                                            className="form-input"
                                            type="text"
                                            value={ekleModal.dynamicValues?.[field.COMPID] || ''}
                                            onChange={(e) => setEkleModal(prev => ({
                                                ...prev,
                                                dynamicValues: { ...prev.dynamicValues, [field.COMPID]: e.target.value }
                                            }))}
                                            maxLength={field.MaxLength}
                                            placeholder={`${field.LabelText} girin...`}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.75rem' }}>
                            <button
                                onClick={() => setEkleModal({ isOpen: false, line: null, qty: '', serialNo: '', dynamicValues: {} })}
                                className="btn"
                                style={{ background: '#f1f5f9', color: 'var(--secondary-color)', padding: '0.6rem 1.25rem' }}
                            >
                                Vazgeç
                            </button>
                            <button
                                onClick={handleConfirmEkle}
                                className="btn btn-primary"
                                style={{ padding: '0.6rem 1.75rem' }}
                            >
                                Kabulü Taslağa Ekle
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default POMalKabul;
