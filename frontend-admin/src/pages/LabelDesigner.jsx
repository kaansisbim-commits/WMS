import React, { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import './LabelDesigner.css';

const COMPONENT_TYPES = [
    { type: 'text', label: 'Metin', icon: 'T', defaultSize: { w: 100, h: 30 } },
    { type: 'staticText', label: 'Statik Yazı', icon: 'A', defaultSize: { w: 100, h: 30 } },
    { type: 'barcode', label: 'Barkod (1D)', icon: '|||', defaultSize: { w: 150, h: 50 } },
    { type: 'qrcode', label: 'QR Kod (2D)', icon: 'QR', defaultSize: { w: 80, h: 80 } }
];

const DEFAULT_VARS = ['{SeriNo}', '{StokKodu}', '{UrunAdi}', '{UretimTarihi}', '{LotNo}'];

const LabelDesigner = () => {
    const [templates, setTemplates] = useState([]);
    const [activeTemplateId, setActiveTemplateId] = useState(null);
    const [templateName, setTemplateName] = useState('Yeni Etiket Şablonu');
    const [widthMM, setWidthMM] = useState(50);
    const [heightMM, setHeightMM] = useState(30);
    const [elements, setElements] = useState([]);
    const [targetScreens, setTargetScreens] = useState([]);
    const [selectedElementId, setSelectedElementId] = useState(null);
    const [toast, setToast] = useState({ show: false, message: '' });
    
    // Canvas dimensions (scaling mm to px. e.g. 1mm = 8px)
    const scale = 8;
    
    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        try {
            const host = window.location.hostname;
            const res = await fetch(`http://${host}:8080/api/admin/label-templates`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
            });
            const data = await res.json();
            if (data.success) {
                setTemplates(data.data);
            }
        } catch (err) {
            console.error('Şablonlar yüklenirken hata:', err);
        }
    };

    const handleDragStart = (e, comp) => {
        e.dataTransfer.setData('component', JSON.stringify(comp));
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const compData = e.dataTransfer.getData('component');
        if (compData) {
            const comp = JSON.parse(compData);
            const rect = e.target.getBoundingClientRect();
            // Calculate coordinates relative to canvas
            let dropX = e.clientX - rect.left;
            let dropY = e.clientY - rect.top;
            
            // Constrain
            if (dropX < 0) dropX = 0;
            if (dropY < 0) dropY = 0;

            // Convert to MM based on scale
            const newElement = {
                id: Date.now().toString(),
                type: comp.type,
                x: Math.round(dropX / scale),
                y: Math.round(dropY / scale),
                w: Math.round(comp.defaultSize.w / scale),
                h: Math.round(comp.defaultSize.h / scale),
                value: comp.type === 'staticText' ? 'Örnek Yazı' : '{StokKodu}',
                fontSize: 12,
                align: 'left'
            };
            setElements([...elements, newElement]);
            setSelectedElementId(newElement.id);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const updateElement = (id, updates) => {
        setElements(elements.map(el => el.id === id ? { ...el, ...updates } : el));
    };

    const removeElement = (id) => {
        setElements(elements.filter(el => el.id !== id));
        if (selectedElementId === id) setSelectedElementId(null);
    };

    const handleSave = async () => {
        try {
            const host = window.location.hostname;
            const payload = {
                templateId: activeTemplateId,
                templateName,
                widthMM,
                heightMM,
                designSchema: elements,
                targetScreens
            };

            const res = await fetch(`http://${host}:8080/api/admin/label-templates`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}` 
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.success) {
                if (data.templateId) setActiveTemplateId(data.templateId);
                showToast(data.message || 'Şablon başarıyla kaydedildi.');
                loadTemplates();
            } else {
                alert('Hata: ' + data.message);
            }
        } catch (err) {
            console.error(err);
            alert('Kaydetme sırasında bir hata oluştu.');
        }
    };

    const showToast = (message) => {
        setToast({ show: true, message });
        setTimeout(() => {
            setToast({ show: false, message: '' });
        }, 7000); // exactly 7 seconds
    };

    const testRender = async () => {
        if (!activeTemplateId) {
            alert('Lütfen önce şablonu kaydedin!');
            return;
        }
        try {
            const host = window.location.hostname;
            const payload = {
                SeriNo: 'TEST-12345',
                StokKodu: 'STK-999',
                UrunAdi: 'Örnek Ürün',
                UretimTarihi: '2026-05-26',
                LotNo: 'L2026'
            };
            const res = await fetch(`http://${host}:8080/api/wms/labels/render/${activeTemplateId}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}` 
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                const pdfWindow = window.open("");
                pdfWindow.document.write(`<iframe width='100%' height='100%' src='data:application/pdf;base64,${data.data.pdfBase64}'></iframe>`);
                console.log("ZPL Output:\n", data.data.zpl);
            } else {
                alert('Render Hatası: ' + data.message);
            }
        } catch (err) {
            console.error(err);
        }
    }

    const selectedElement = elements.find(el => el.id === selectedElementId);

    return (
        <div className="label-designer-container">
            <div className="designer-header">
                <div>
                    <h1 className="page-title">Etiket Tasarım Stüdyosu</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Sürükle-bırak ile barkod ve etiket şablonları tasarlayın</p>
                </div>
                <div className="header-actions">
                    <select 
                        className="form-input" 
                        style={{ width: '250px', marginRight: '1rem' }}
                        value={activeTemplateId || ''}
                        onChange={(e) => {
                            if (!e.target.value) {
                                setActiveTemplateId(null);
                                setTemplateName('Yeni Etiket Şablonu');
                                setElements([]);
                                return;
                            }
                            const tpl = templates.find(t => t.TemplateID.toString() === e.target.value);
                            if (tpl) {
                                setActiveTemplateId(tpl.TemplateID);
                                setTemplateName(tpl.TemplateName);
                                setWidthMM(tpl.WidthMM);
                                setHeightMM(tpl.HeightMM);
                                setElements(tpl.DesignSchemaJSON || []);
                                setTargetScreens(tpl.TargetScreens || []);
                                setSelectedElementId(null);
                            }
                        }}
                    >
                        <option value="">+ Yeni Şablon Oluştur</option>
                        {templates.map(t => (
                            <option key={t.TemplateID} value={t.TemplateID}>{t.TemplateName}</option>
                        ))}
                    </select>
                    <button className="btn btn-outline" onClick={testRender} style={{ marginRight: '1rem' }}>🖨️ Test PDF/ZPL</button>
                    <button className="btn btn-primary" onClick={handleSave}>💾 Şablonu Kaydet</button>
                </div>
            </div>

            <div className="designer-workspace">
                {/* Left Panel */}
                <div className="designer-sidebar left-sidebar card">
                    <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Bileşenler</h3>
                    <div className="components-list">
                        {COMPONENT_TYPES.map(comp => (
                            <div 
                                key={comp.type} 
                                className="draggable-component"
                                draggable
                                onDragStart={(e) => handleDragStart(e, comp)}
                            >
                                <span className="comp-icon">{comp.icon}</span>
                                <span>{comp.label}</span>
                            </div>
                        ))}
                    </div>

                    <div className="doc-section">
                        <h4>Değişkenler</h4>
                        <div className="vars-list">
                            {DEFAULT_VARS.map(v => (
                                <div key={v} className="var-item">{v}</div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Center Canvas */}
                <div className="designer-canvas-area card">
                    <div className="canvas-settings">
                        <input className="form-input" type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Şablon Adı" style={{ width: '250px', fontWeight: 'bold' }} />
                        <div className="dimensions-inputs">
                            <label>Genişlik (mm):</label>
                            <input type="number" className="form-input" value={widthMM} onChange={e => setWidthMM(Number(e.target.value))} style={{ width: '80px' }} />
                            <label>Yükseklik (mm):</label>
                            <input type="number" className="form-input" value={heightMM} onChange={e => setHeightMM(Number(e.target.value))} style={{ width: '80px' }} />
                        </div>
                    </div>

                    <div className="canvas-wrapper">
                        <div 
                            className="drop-canvas" 
                            style={{ 
                                width: `${widthMM * scale}px`, 
                                height: `${heightMM * scale}px` 
                            }}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onClick={() => setSelectedElementId(null)}
                        >
                            {elements.map(el => (
                                <Rnd
                                    key={el.id}
                                    size={{ width: el.w * scale, height: el.h * scale }}
                                    position={{ x: el.x * scale, y: el.y * scale }}
                                    onDragStop={(e, d) => {
                                        let newX = Math.round(d.x / scale);
                                        let newY = Math.round(d.y / scale);
                                        if (newX < 0) newX = 0;
                                        if (newY < 0) newY = 0;
                                        updateElement(el.id, { x: newX, y: newY });
                                    }}
                                    onResizeStop={(e, direction, ref, delta, position) => {
                                        updateElement(el.id, {
                                            w: Math.round(ref.offsetWidth / scale),
                                            h: Math.round(ref.offsetHeight / scale),
                                            x: Math.round(position.x / scale),
                                            y: Math.round(position.y / scale)
                                        });
                                    }}
                                    bounds="parent"
                                    className={`canvas-element ${selectedElementId === el.id ? 'selected' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedElementId(el.id);
                                    }}
                                >
                                    {el.type === 'text' || el.type === 'staticText' ? (
                                        <div style={{ fontSize: `${el.fontSize}px`, textAlign: el.align, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: el.align === 'center' ? 'center' : (el.align === 'right' ? 'flex-end' : 'flex-start') }}>
                                            {el.value}
                                        </div>
                                    ) : el.type === 'barcode' ? (
                                        <div className="mock-barcode">
                                            |||| | || ||| || |||
                                            <div className="mock-barcode-text">{el.value}</div>
                                        </div>
                                    ) : (
                                        <div className="mock-qrcode">
                                            QR
                                            <div className="mock-qrcode-text">{el.value}</div>
                                        </div>
                                    )}
                                </Rnd>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Panel */}
                <div className="designer-sidebar right-sidebar card" style={{ overflowY: 'auto' }}>
                    
                    <div className="template-settings" style={{ marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                        <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Şablon Ayarları</h3>
                        <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.875rem' }}>Geçerli Olduğu Ekranlar</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={targetScreens.includes('101')}
                                        onChange={(e) => {
                                            if (e.target.checked) setTargetScreens([...targetScreens, '101']);
                                            else setTargetScreens(targetScreens.filter(s => s !== '101'));
                                        }}
                                    />
                                    Mal Kabul (101)
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={targetScreens.includes('102')}
                                        onChange={(e) => {
                                            if (e.target.checked) setTargetScreens([...targetScreens, '102']);
                                            else setTargetScreens(targetScreens.filter(s => s !== '102'));
                                        }}
                                    />
                                    Siparişe Bağlı Mal Kabul (102)
                                </label>
                            </div>
                        </div>
                    </div>

                    <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Öğe Özellikleri</h3>
                    {selectedElement ? (
                        <div className="properties-form">
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label className="form-label" style={{ fontSize: '0.875rem' }}>İçerik / Değer</label>
                                <input 
                                    className="form-input" 
                                    value={selectedElement.value} 
                                    onChange={e => updateElement(selectedElement.id, { value: e.target.value })}
                                />
                            </div>
                            
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label className="form-label" style={{ fontSize: '0.875rem' }}>Genişlik (mm)</label>
                                <input 
                                    type="number"
                                    className="form-input" 
                                    value={selectedElement.w} 
                                    onChange={e => updateElement(selectedElement.id, { w: Number(e.target.value) })}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label className="form-label" style={{ fontSize: '0.875rem' }}>Yükseklik (mm)</label>
                                <input 
                                    type="number"
                                    className="form-input" 
                                    value={selectedElement.h} 
                                    onChange={e => updateElement(selectedElement.id, { h: Number(e.target.value) })}
                                />
                            </div>

                            {(selectedElement.type === 'text' || selectedElement.type === 'staticText') && (
                                <>
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label className="form-label" style={{ fontSize: '0.875rem' }}>Font Boyutu (px)</label>
                                        <input 
                                            type="number"
                                            className="form-input" 
                                            value={selectedElement.fontSize} 
                                            onChange={e => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label className="form-label" style={{ fontSize: '0.875rem' }}>Hizalama</label>
                                        <select 
                                            className="form-input"
                                            value={selectedElement.align}
                                            onChange={e => updateElement(selectedElement.id, { align: e.target.value })}
                                        >
                                            <option value="left">Sola Dayalı</option>
                                            <option value="center">Ortalı</option>
                                            <option value="right">Sağa Dayalı</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            <button className="btn btn-outline" style={{ width: '100%', marginTop: '2rem', color: 'red', borderColor: '#fee2e2' }} onClick={() => removeElement(selectedElement.id)}>
                                🗑️ Sil
                            </button>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', marginTop: '3rem' }}>
                            Düzenlemek için canvas üzerinden bir bileşen seçin.
                        </p>
                    )}
                </div>
            </div>

            {toast.show && (
                <div className="toast-message show">
                    ✅ {toast.message}
                </div>
            )}
        </div>
    );
};

export default LabelDesigner;
