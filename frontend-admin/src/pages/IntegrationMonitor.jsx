import React, { useState, useEffect } from 'react';

const IntegrationMonitor = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retryStatus, setRetryStatus] = useState(null);

    // Pagination & Filter States
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [statusFilter, setStatusFilter] = useState('all');

    // Modal & Copy States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedErrorText, setSelectedErrorText] = useState('');
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!selectedErrorText) return;
        navigator.clipboard.writeText(selectedErrorText)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(err => {
                alert('Kopyalama başarısız: ' + err.message);
            });
    };

    const fetchLogs = (p = page, f = statusFilter) => {
        setLoading(true);
        const host = window.location.hostname;
        const statusParam = f === 'all' ? '' : f;
        const query = `?page=${p}&pageSize=15&status=${statusParam}`;

        fetch(`http://${host}:8080/api/wms/integration/logs${query}`, {
            headers: { 'Authorization': 'Bearer Admin123Token' }
        })
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    setLogs(res.logs || []);
                    setTotalPages(res.totalPages || 1);
                    setTotalCount(res.totalCount || 0);
                    setPage(res.currentPage || 1);
                } else {
                    setError(res.message);
                }
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchLogs(page, statusFilter);
    }, [page, statusFilter]);

    const handleRetry = async (receiptId) => {
        setRetryStatus({ id: receiptId, loading: true });
        const host = window.location.hostname;
        try {
            const res = await fetch(`http://${host}:8080/api/wms/integration/send-to-netsis`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer Admin123Token'
                },
                body: JSON.stringify({ receiptId })
            });
            const data = await res.json();

            if (data.success) {
                const detail = data.details && data.details.find(d => d.receiptId === receiptId);
                if (detail && detail.status === 'Success') {
                    alert(`Fiş ${receiptId} başarıyla NetOpenX'e aktarıldı!`);
                } else if (detail && detail.status === 'Error') {
                    alert(`Tekrar deneme başarısız: ${detail.error}`);
                } else if (data.processedCount === 0) {
                    alert('Fiş bulunamadı veya durumu aktarım için uygun değil.');
                }
                fetchLogs(page, statusFilter);
            } else {
                alert('Hata: ' + data.message);
            }
        } catch (err) {
            alert('Bağlantı hatası: ' + err.message);
        } finally {
            setRetryStatus(null);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 0:
                return <span style={{ padding: '6px 12px', borderRadius: '20px', background: '#fef08a', color: '#854d0e', fontWeight: 'bold', fontSize: '0.85rem' }}>Bekliyor</span>;
            case 1:
                return <span style={{ padding: '6px 12px', borderRadius: '20px', background: '#dcfce7', color: '#166534', fontWeight: 'bold', fontSize: '0.85rem' }}>Başarılı</span>;
            case 2:
                return <span style={{ padding: '6px 12px', borderRadius: '20px', background: '#fee2e2', color: '#991b1b', fontWeight: 'bold', fontSize: '0.85rem' }}>Hatalı</span>;
            case 4:
                return <span style={{ padding: '6px 12px', borderRadius: '20px', background: '#e0e7ff', color: '#4338ca', fontWeight: 'bold', fontSize: '0.85rem' }}>Onay Bekliyor</span>;
            default:
                return <span style={{ padding: '6px 12px', borderRadius: '20px', background: '#e2e8f0', color: '#475569', fontWeight: 'bold', fontSize: '0.85rem' }}>Bilinmiyor</span>;
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setPage(newPage);
        }
    };

    return (
        <div className="parameters-page">
            {/* Custom Interactive Styles */}
            <style>{`
                .clickable-error-cell {
                    transition: background-color 0.2s ease, transform 0.1s ease !important;
                }
                .clickable-error-cell:hover {
                    background-color: #fee2e2 !important;
                }
                .clickable-error-cell:hover .clickable-error-text {
                    color: #b91c1c !important;
                    text-decoration: underline;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="brand-text page-title">Aktarım İzleme</h1>
                    <p className="text-muted">Netsis Erp Sistemine Aktarım Yönetimi (Toplam {totalCount} Kayıt)</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#64748b' }}>Filtre:</span>
                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                            style={{ border: 'none', background: 'none', outline: 'none', padding: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#0f172a', cursor: 'pointer' }}
                        >
                            <option value="all">Tüm Durumlar</option>
                            <option value="0">Sadece Bekleyenler</option>
                            <option value="1">Sadece Başarılılar</option>
                            <option value="2">Sadece Hatalılar</option>
                        </select>
                    </div>
                    <button className="btn btn-outline" onClick={() => fetchLogs(page, statusFilter)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>🔄</span> Yenile
                    </button>
                </div>
            </div>

            <div className="card" style={{ width: '100%', padding: '1.5rem' }}>
                {error && (
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: '8px', backgroundColor: '#fee2e2', color: '#991b1b', fontWeight: '600' }}>
                        ⚠️ Hatası: {error}
                    </div>
                )}

                {loading && !error ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Veriler yükleniyor...</div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', minWidth: 'max-content', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.95rem' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Fiş ID</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Tarih</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Kullanıcı</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Cari Kod</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Belge No</th>
                                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>Durum</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Açıklama</th>
                                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.ReceiptID} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: log.IntegrationStatus === 2 ? '#fff5f5' : 'transparent' }}>
                                            <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>#{log.ReceiptID}</td>
                                            <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>
                                                {new Date(log.CreatedAt).toLocaleString('tr-TR')}
                                            </td>
                                            <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>{log.CreatedBy}</td>
                                            <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>{log.CariKod}</td>
                                            <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>{log.BelgeNo || '-'}</td>
                                            <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
                                                {getStatusBadge(log.IntegrationStatus)}
                                            </td>
                                            <td 
                                                onClick={() => {
                                                    if (log.IntegrationErrorDesc) {
                                                        setSelectedErrorText(log.IntegrationErrorDesc);
                                                        setIsModalOpen(true);
                                                        setCopied(false);
                                                    }
                                                }}
                                                className={log.IntegrationErrorDesc ? "clickable-error-cell" : ""}
                                                style={{ 
                                                    padding: '12px', 
                                                    borderBottom: '1px solid #e2e8f0', 
                                                    maxWidth: '300px',
                                                    cursor: log.IntegrationErrorDesc ? 'pointer' : 'default',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {log.IntegrationErrorDesc ? (
                                                    <div className="clickable-error-text" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#ef4444', fontWeight: '500' }}>
                                                        {log.IntegrationErrorDesc}
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
                                                {(log.IntegrationStatus === 2 || log.IntegrationStatus === 0) && (
                                                    <button
                                                        onClick={() => handleRetry(log.ReceiptID)}
                                                        disabled={retryStatus?.id === log.ReceiptID}
                                                        className="btn btn-outline"
                                                        style={{ padding: '6px 12px', fontSize: '0.85rem', borderColor: '#3b82f6', color: '#3b82f6' }}
                                                        title="Tekrar Dene"
                                                    >
                                                        {retryStatus?.id === log.ReceiptID ? '⏳' : '🔄 Tekrar'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {logs.length === 0 && (
                                        <tr>
                                            <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                                Filtreye uygun aktarım kaydı bulunmuyor.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination UI */}
                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                Toplam <b>{totalCount}</b> kayıt arasından <b>{logs.length}</b> kayıt gösteriliyor.
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    className="btn btn-outline"
                                    disabled={page === 1}
                                    onClick={() => handlePageChange(page - 1)}
                                    style={{ padding: '0.5rem 1rem' }}
                                >
                                    ◀ Geri
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 1rem', fontWeight: 'bold' }}>
                                    Sayfa {page} / {totalPages}
                                </div>
                                <button
                                    className="btn btn-outline"
                                    disabled={page === totalPages}
                                    onClick={() => handlePageChange(page + 1)}
                                    style={{ padding: '0.5rem 1rem' }}
                                >
                                    İleri ▶
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Beautiful Hata Detayı Modal */}
            {isModalOpen && (
                <div 
                    onClick={() => setIsModalOpen(false)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1000,
                        animation: 'fadeIn 0.25s ease-out',
                        padding: '1rem'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            width: '100%',
                            maxWidth: '650px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                        }}
                    >
                        {/* Header */}
                        <div style={{ 
                            padding: '1.25rem 1.5rem', 
                            borderBottom: '1px solid #f1f5f9', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            background: '#fafafa'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', fontFamily: "'Outfit', sans-serif" }}>
                                    Hata Detayı
                                </h3>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                style={{
                                    border: 'none',
                                    background: 'none',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer',
                                    color: '#64748b',
                                    transition: 'color 0.2s',
                                    padding: '0.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    lineHeight: 1
                                }}
                                onMouseEnter={(e) => e.target.style.color = '#ef4444'}
                                onMouseLeave={(e) => e.target.style.color = '#64748b'}
                            >
                                &times;
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{ padding: '1.5rem', flex: 1 }}>
                            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '0.75rem', fontWeight: '500' }}>
                                Sistem tarafından döndürülen detaylı hata mesajı:
                            </p>
                            <div style={{
                                background: '#0f172a',
                                color: '#38bdf8',
                                fontFamily: "'Courier New', Courier, monospace",
                                padding: '1.25rem',
                                borderRadius: '10px',
                                fontSize: '0.9rem',
                                lineHeight: '1.6',
                                overflowY: 'auto',
                                maxHeight: '320px',
                                minHeight: '120px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                border: '1px solid #334155',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                            }}>
                                {selectedErrorText}
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ 
                            padding: '1rem 1.5rem', 
                            borderTop: '1px solid #f1f5f9', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            background: '#fafafa'
                        }}>
                            {/* Copy Button */}
                            <button
                                onClick={handleCopy}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    backgroundColor: copied ? '#dcfce7' : '#ffffff',
                                    color: copied ? '#166534' : '#475569',
                                    fontWeight: '600',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.25s ease',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                                onMouseEnter={(e) => {
                                    if (!copied) {
                                        e.currentTarget.style.backgroundColor = '#f8fafc';
                                        e.currentTarget.style.borderColor = '#cbd5e1';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!copied) {
                                        e.currentTarget.style.backgroundColor = '#ffffff';
                                        e.currentTarget.style.borderColor = '#e2e8f0';
                                    }
                                }}
                            >
                                {copied ? (
                                    <>
                                        <span>✓</span> Kopyalandı!
                                    </>
                                ) : (
                                    <>
                                        <span>📋</span> Panoya Kopyala
                                    </>
                                )}
                            </button>

                            {/* Close Button */}
                            <button
                                onClick={() => setIsModalOpen(false)}
                                style={{
                                    padding: '0.5rem 1.25rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: '#0f172a',
                                    color: '#ffffff',
                                    fontWeight: '600',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                                onMouseEnter={(e) => e.target.style.filter = 'brightness(1.2)'}
                                onMouseLeave={(e) => e.target.style.filter = 'none'}
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IntegrationMonitor;
