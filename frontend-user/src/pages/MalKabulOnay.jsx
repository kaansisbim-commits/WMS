import React, { useState, useEffect } from 'react';
import { useConfig } from '../context/ConfigContext';
import { fetchApi } from '../utils/api';

const MalKabulOnay = () => {
    const { user } = useConfig();
    const [pendingReceipts, setPendingReceipts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [receiptLines, setReceiptLines] = useState([]);
    const [linesLoading, setLinesLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [approving, setApproving] = useState(false);

    const fetchPendingReceipts = async () => {
        setLoading(true);
        try {
            const data = await fetchApi('/integration/logs?status=4');
            if (data.success) {
                setPendingReceipts(data.logs || []);
            }
        } catch (error) {
            console.error("Error fetching pending receipts:", error);
            alert("Bekleyen belgeler alınırken hata oluştu.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPendingReceipts();
    }, []);

    const handleViewDetails = async (receipt) => {
        setSelectedReceipt(receipt);
        setIsModalOpen(true);
        setLinesLoading(true);
        try {
            const data = await fetchApi(`/integration/receipts/${receipt.ReceiptID}/lines`);
            if (data.success) {
                setReceiptLines(data.lines || []);
            } else {
                alert(data.message || 'Kalemler alınamadı.');
            }
        } catch (error) {
            console.error("Error fetching receipt lines:", error);
            alert("Kalem detayları alınırken hata oluştu.");
        } finally {
            setLinesLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!selectedReceipt) return;
        if (!window.confirm(`${selectedReceipt.BelgeNo} numaralı belgeyi onaylamak istediğinize emin misiniz?`)) return;

        setApproving(true);
        try {
            const data = await fetchApi(`/integration/receipts/${selectedReceipt.ReceiptID}/approve`, {
                method: 'PUT'
            });
            if (data.success) {
                alert('Belge başarıyla onaylandı ve entegrasyon kuyruğuna eklendi. Aktarım arka planda başlatılıyor...');
                
                // Arka planda kuyruğu tetikle (Fire and forget)
                fetchApi('/integration/send-to-netsis', { method: 'POST', body: JSON.stringify({}) })
                    .catch(err => console.error("Kuyruk tetiklenemedi:", err));

                setIsModalOpen(false);
                fetchPendingReceipts();
            } else {
                alert(data.message || 'Onay işlemi başarısız oldu.');
            }
        } catch (error) {
            console.error("Error approving receipt:", error);
            alert("Onay işlemi sırasında hata oluştu.");
        } finally {
            setApproving(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('tr-TR');
    };

    return (
        <div style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ color: 'var(--primary-color)', fontSize: '1.8rem', margin: 0 }}>Mal Kabul Onay Bekleyenler</h1>
                <button onClick={fetchPendingReceipts} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                    🔄 Yenile
                </button>
            </div>

            <div className="card" style={{ padding: '0' }}>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>Yükleniyor...</div>
                ) : pendingReceipts.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>🎉</span>
                        Onay bekleyen belge bulunmuyor.
                    </div>
                ) : (
                    <div className="table-responsive" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead style={{ backgroundColor: 'var(--bg-color)', borderBottom: '2px solid #e2e8f0' }}>
                                <tr>
                                    <th style={{ padding: '1rem' }}>Belge No</th>
                                    <th style={{ padding: '1rem' }}>Tarih</th>
                                    <th style={{ padding: '1rem' }}>Cari Kod</th>
                                    <th style={{ padding: '1rem' }}>Ekleyen</th>
                                    <th style={{ padding: '1rem', textAlign: 'center' }}>İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingReceipts.map((receipt) => (
                                    <tr key={receipt.ReceiptID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '1rem', fontWeight: '500' }}>{receipt.BelgeNo}</td>
                                        <td style={{ padding: '1rem' }}>{formatDate(receipt.BelgeTarihi)}</td>
                                        <td style={{ padding: '1rem' }}>{receipt.CariKod}</td>
                                        <td style={{ padding: '1rem' }}>{receipt.CreatedBy}</td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <button 
                                                onClick={() => handleViewDetails(receipt)}
                                                className="btn btn-primary"
                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}
                                            >
                                                👁️ Detay İzle
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal for Details */}
            {isModalOpen && selectedReceipt && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '1rem'
                }}>
                    <div className="card" style={{
                        width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                        padding: '0', overflow: 'hidden', animation: 'slideIn 0.3s ease-out'
                    }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--primary-color)' }}>Belge Detayları</h2>
                                <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    Belge No: <strong>{selectedReceipt.BelgeNo}</strong> | Cari: {selectedReceipt.CariKod}
                                </p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                ✕
                            </button>
                        </div>
                        
                        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                            {linesLoading ? (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>Kalemler yükleniyor...</div>
                            ) : receiptLines.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Bu belgede kalem bulunmuyor.</div>
                            ) : (
                                <div style={{ display: 'grid', gap: '1rem' }}>
                                    {receiptLines.map((line, idx) => {
                                        const dynFields = line.DynamicFieldsJSON ? JSON.parse(line.DynamicFieldsJSON) : {};
                                        // Attempt to extract SKT and Uretim Tarihi from dynamic fields
                                        const skt = dynFields['10198'] || dynFields['10298'] || dynFields['SKT'] || dynFields['skt'] || line.Skt || '-';
                                        const uretim = dynFields['10197'] || dynFields['10297'] || dynFields['UretimTarihi'] || '-';
                                        const sipNo = dynFields['10202'] || dynFields.STra_SIPNUM || '-';
                                        
                                        return (
                                            <div key={line.LineID || idx} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', backgroundColor: '#fff' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                    <strong style={{ fontSize: '1.1rem', color: '#1e293b' }}>{line.StokKodu}</strong>
                                                    <span style={{ backgroundColor: '#e0e7ff', color: '#4338ca', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                                        {line.Miktar} {line.Birim}
                                                    </span>
                                                </div>
                                                
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', fontSize: '0.9rem', color: '#475569' }}>
                                                    {line.SeriNo && <div><span style={{color:'#94a3b8'}}>Seri:</span> {line.SeriNo}</div>}
                                                    {line.LotNo && <div><span style={{color:'#94a3b8'}}>Lot:</span> {line.LotNo}</div>}
                                                    {skt !== '-' && <div><span style={{color:'#94a3b8'}}>SKT:</span> {formatDate(skt)}</div>}
                                                    {uretim !== '-' && <div><span style={{color:'#94a3b8'}}>Üretim:</span> {formatDate(uretim)}</div>}
                                                    {sipNo !== '-' && <div><span style={{color:'#94a3b8'}}>Sipariş:</span> {sipNo}</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '1rem', backgroundColor: '#f8fafc' }}>
                            <button 
                                onClick={() => setIsModalOpen(false)} 
                                className="btn btn-secondary"
                                disabled={approving}
                            >
                                Kapat
                            </button>
                            <button 
                                onClick={handleApprove} 
                                className="btn btn-primary"
                                style={{ backgroundColor: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                disabled={approving || linesLoading}
                            >
                                {approving ? 'Onaylanıyor...' : '✅ Belgeyi Onayla'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MalKabulOnay;
