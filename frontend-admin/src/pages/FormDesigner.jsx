import React, { useState, useEffect } from 'react';

const FormDesigner = () => {
    const [fields, setFields] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [scrid] = useState(101); // Numeric SCRID for Mal Kabul

    const [editingField, setEditingField] = useState(null);

    useEffect(() => {
        fetchDesign();
    }, []);

    const fetchDesign = () => {
        const host = window.location.hostname;
        setLoading(true);
        fetch(`http://${host}:8080/api/wms/design?scrid=${scrid}`, {
            headers: { 'Authorization': 'Bearer Admin123Token' }
        })
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    const parsedData = res.data.map(f => ({
                        ...f,
                        GuideMappingJSON: f.GuideMappingJSON ? JSON.parse(f.GuideMappingJSON) : []
                    }));
                    setFields(parsedData);
                }
                else setError(res.message);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    };

    const handleMove = (index, direction) => {
        const newFields = [...fields];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newFields.length) return;
        [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
        newFields.forEach((f, i) => f.SortOrder = i + 1);
        setFields(newFields);
    };

    const addField = () => {
        const label = prompt('Görünecek Etiket girin (Örn: Miktar):');
        if (!label) return;

        // Auto-generate COMPID: SCRID + sequence (e.g. 10101, 10102...)
        const nextSeq = fields.length + 1;
        const compId = parseInt(`${scrid}${nextSeq.toString().padStart(2, '0')}`);

        const newField = {
            SCRID: scrid,
            COMPID: compId,
            LabelText: label,
            ComponentType: 'TEXT',
            DefaultValue: '',
            GuideDisplayType: 'CARD',
            DataSourceSQL: '',
            MaxLength: 50,
            SortOrder: fields.length + 1,
            IsVisible: true,
            IsRequired: true,
            GuideMappingJSON: [],
            SectionGroup: 'HEADER'
        };
        setFields([...fields, newField]);
    };

    const openSettings = (field) => {
        setEditingField({...field, GuideMappingJSON: field.GuideMappingJSON || []});
    };

    const saveSettings = () => {
        const newFields = fields.map(f => f.COMPID === editingField.COMPID ? editingField : f);
        setFields(newFields);
        setEditingField(null);
    };

    const handleDeleteComponent = (field) => {
        if (window.confirm("Bu bileşeni silmek istediğinize emin misiniz? Bu işlem, bileşene ait tüm rehber ve eşleştirme (mapping) ayarlarını da silecektir.")) {
            const host = window.location.hostname;
            fetch(`http://${host}:8080/api/wms/design/remove`, {
                method: 'DELETE',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer Admin123Token'
                },
                body: JSON.stringify({ ScreenCode: scrid, ComponentID: field.COMPID })
            })
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    const newFields = fields.filter(f => f.COMPID !== field.COMPID);
                    setFields(newFields);
                } else {
                    alert('Hata: ' + res.message);
                }
            })
            .catch(err => alert('Silme hatası: ' + err.message));
        }
    };

    const handleSave = () => {
        const host = window.location.hostname;
        if (fields.length === 0) {
            alert('Kaydedilecek alan bulunamadı.');
            return;
        }

        fetch(`http://${host}:8080/api/wms/design`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer Admin123Token'
            },
            body: JSON.stringify({ scrid, fields })
        })
        .then(res => res.json())
        .then(res => {
            if (res.success) alert('Tasarım veritabanına kaydedildi!');
            else alert('Hata: ' + res.message);
        });
    };

    if (loading) return <div>Yükleniyor...</div>;

    return (
        <div style={{ position: 'relative' }}>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                    <h1 className="brand-text">Ekran Tasarımı (SCRID: {scrid})</h1>
                    <p className="text-muted">Alanları yönetin ve veritabanına kaydedin.</p>
                </div>
                <button className="btn btn-primary" onClick={addField}>+ Yeni Bileşen Ekle</button>
            </div>

            <div className="card">
                <div className="designer-grid">
                    <div className="designer-item" style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                        <div>Sıra</div>
                        <div>COMPID</div>
                        <div>Görünen Etiket</div>
                        <div>Tip</div>
                        <div>İşlemler</div>
                    </div>
                    {fields.map((field, index) => (
                        <div key={field.COMPID} className="designer-item">
                            <div style={{ fontWeight: 'bold' }}>{field.SortOrder}</div>
                            <div style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>#{field.COMPID}</div>
                            <div>{field.LabelText}</div>
                            <div style={{ fontSize: '0.8rem' }}>{field.ComponentType}</div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-outline" onClick={() => openSettings(field)}>⚙️</button>
                                <button className="btn btn-outline" onClick={() => handleDeleteComponent(field)} style={{ color: '#ef4444', borderColor: '#ef4444' }}>🗑️</button>
                                <button className="btn btn-outline" onClick={() => handleMove(index, 'up')} disabled={index === 0}>↑</button>
                                <button className="btn btn-outline" onClick={() => handleMove(index, 'down')} disabled={index === fields.length - 1}>↓</button>
                            </div>
                        </div>
                    ))}
                </div>
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '2rem', height: '3.5rem' }} onClick={handleSave}>Veritabanını Güncelle</button>
            </div>

            {editingField && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="card" style={{ width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3>Ayarlar: #{editingField.COMPID}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                            <div>
                                <label className="form-label">Görünen Etiket</label>
                                <input className="form-input" value={editingField.LabelText} onChange={e => setEditingField({...editingField, LabelText: e.target.value})} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label className="form-label">Bileşen Tipi</label>
                                    <select className="form-input" value={editingField.ComponentType} onChange={e => setEditingField({...editingField, ComponentType: e.target.value})}>
                                        <option value="TEXT">TEXT</option>
                                        <option value="GUIDE">GUIDE</option>
                                        <option value="READONLY">READONLY</option>
                                        <option value="DATE">DATE</option>
                                        <option value="DECIMAL">DECIMAL</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Bölüm (Section)</label>
                                    <select className="form-input" value={editingField.SectionGroup || 'HEADER'} onChange={e => setEditingField({...editingField, SectionGroup: e.target.value})}>
                                        <option value="HEADER">BAŞLIK (HEADER)</option>
                                        <option value="LINE">SATIR (LINE)</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.5rem' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={!!editingField.IsRequired} 
                                            onChange={e => setEditingField({...editingField, IsRequired: e.target.checked})} 
                                            style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                                        />
                                        <strong>Zorunlu Alan</strong>
                                    </label>
                                </div>
                                {editingField.ComponentType === 'TEXT' && (
                                    <div>
                                        <label className="form-label">Maksimum Uzunluk</label>
                                        <input type="number" className="form-input" value={editingField.MaxLength} onChange={e => setEditingField({...editingField, MaxLength: e.target.value})} />
                                    </div>
                                )}
                            </div>
                            {(editingField.ComponentType === 'GUIDE' || editingField.ComponentType === 'READONLY') && (
                                <>
                                    <div>
                                        <label className="form-label">Veri Kaynağı (SQL)</label>
                                        <textarea className="form-input" style={{ height: '80px', fontFamily: 'monospace' }} value={editingField.DataSourceSQL} onChange={e => setEditingField({...editingField, DataSourceSQL: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="form-label">Görünüm</label>
                                        <select className="form-input" value={editingField.GuideDisplayType} onChange={e => setEditingField({...editingField, GuideDisplayType: e.target.value})}>
                                            <option value="CARD">CARD</option>
                                            <option value="GRID">GRID</option>
                                        </select>
                                    </div>
                                    <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                                        <label className="form-label">Rehber Veri Eşleştirme (Guide Mapping)</label>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            Seçilen satırdaki kolonları, diğer form bileşenlerine otomatik aktarın.
                                        </p>
                                        {editingField.GuideMappingJSON.map((mapping, mIndex) => (
                                            <div key={mIndex} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                <input className="form-input" placeholder="Kaynak Kolon (Örn: CariIsim)" value={mapping.sourceColumn} onChange={e => {
                                                    const newMapping = [...editingField.GuideMappingJSON];
                                                    newMapping[mIndex].sourceColumn = e.target.value;
                                                    setEditingField({...editingField, GuideMappingJSON: newMapping});
                                                }} />
                                                <span style={{ alignSelf: 'center' }}>→</span>
                                                <input className="form-input" placeholder="Hedef COMPID (Örn: 10103)" value={mapping.targetComponentID} onChange={e => {
                                                    const newMapping = [...editingField.GuideMappingJSON];
                                                    newMapping[mIndex].targetComponentID = e.target.value;
                                                    setEditingField({...editingField, GuideMappingJSON: newMapping});
                                                }} />
                                                <button className="btn btn-outline" style={{ padding: '0 0.5rem' }} onClick={() => {
                                                    const newMapping = editingField.GuideMappingJSON.filter((_, i) => i !== mIndex);
                                                    setEditingField({...editingField, GuideMappingJSON: newMapping});
                                                }}>Sil</button>
                                            </div>
                                        ))}
                                        <button className="btn btn-outline" style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem' }} onClick={() => {
                                            setEditingField({...editingField, GuideMappingJSON: [...editingField.GuideMappingJSON, { sourceColumn: '', targetComponentID: '' }]});
                                        }}>+ Eşleştirme Kuralı Ekle</button>
                                    </div>
                                </>
                            )}
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveSettings}>Uygula</button>
                                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditingField(null)}>İptal</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FormDesigner;
