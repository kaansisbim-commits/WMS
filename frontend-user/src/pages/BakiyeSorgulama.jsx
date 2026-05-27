import React, { useState, useRef, useEffect } from 'react';
import { useConfig } from '../context/ConfigContext';
import { fetchApi } from '../utils/api';
import QrScannerModal from '../components/QrScannerModal';
import GuideModal from '../components/GuideModal';
import './BakiyeSorgulama.css';

const BakiyeSorgulama = () => {
    const { user } = useConfig();
    const [barcode, setBarcode] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState('');
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [guideData, setGuideData] = useState([]);
    const inputRef = useRef(null);

    // Otomatik odaklanma
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const handleOpenGuide = async () => {
        try {
            const data = await fetchApi('/reports/stock-guide');
            if (data.success) {
                setGuideData(data.data);
                setIsGuideOpen(true);
            } else {
                setError('Rehber yüklenemedi: ' + data.message);
            }
        } catch (err) {
            setError('Rehber yüklenirken hata oluştu.');
        }
    };

    const fetchBalance = async (queryBarcode) => {
        if (!queryBarcode.trim()) return;

        setLoading(true);
        setError('');
        setResults(null);

        try {
            const data = await fetchApi(`/reports/stock-balance?barcode=${encodeURIComponent(queryBarcode)}`);

            if (data.success) {
                if (data.data && data.data.length > 0) {
                    setResults(data.data);
                } else {
                    setError('Okutulan barkoda ait stok bakiyesi bulunamadı.');
                }
            } else {
                setError(data.message || 'Sorgulama sırasında bir hata oluştu.');
            }
        } catch (err) {
            setError('Sunucuya bağlanırken bir hata oluştu.');
        } finally {
            setLoading(false);
            if (inputRef.current) {
                inputRef.current.focus();
            }
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        fetchBalance(barcode);
    };

    const handleScan = (scannedText) => {
        setBarcode(scannedText);
        setIsScannerOpen(false);
        fetchBalance(scannedText);
    };

    const handleGuideSelect = (item) => {
        const code = item.code || item.STOK_KODU || Object.values(item)[0];
        setBarcode(code);
        setIsGuideOpen(false);
        fetchBalance(code);
    };

    return (
        <div className="bakiye-sorgulama-container fade-in">
            <div className="report-header">
                <div className="report-title-section">
                    <div className="report-icon-wrapper">
                        <span className="report-icon">📊</span>
                    </div>
                    <div>
                        <h2>Bakiye Sorgulama Raporu</h2>
                        <p className="text-muted">Okutulan ürünün veya serinin depolar bazındaki güncel stok durumunu görüntüleyin.</p>
                    </div>
                </div>
            </div>

            <div className="search-card card">
                <form onSubmit={handleSearch} className="search-form">
                    <div className="search-input-group">
                        <label>Barkod / Seri No / Stok Kodu</label>
                        <div className="input-wrapper">
                            <span className="input-icon">🔍</span>
                            <input
                                ref={inputRef}
                                type="text"
                                value={barcode}
                                onChange={(e) => setBarcode(e.target.value)}
                                placeholder="Barkod okutunuz..."
                                className="form-input barcode-input"
                                disabled={loading}
                            />
                            <div className="input-actions">
                                <button type="button" className="icon-btn" onClick={() => setIsScannerOpen(true)} title="Kamera ile Okut">
                                    📷
                                </button>
                                <button type="button" className="icon-btn" onClick={handleOpenGuide} title="Rehberden Seç">
                                    📋
                                </button>
                            </div>
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary search-btn" disabled={loading || !barcode.trim()}>
                        {loading ? <span className="spinner"></span> : 'Sorgula'}
                    </button>
                </form>
            </div>

            {error && (
                <div className="alert alert-danger fade-in">
                    <span className="alert-icon">⚠️</span>
                    {error}
                </div>
            )}

            {results && results.length > 0 && (
                <div className="results-container fade-in">
                    <div className="product-summary card">
                        <div className="summary-item">
                            <span className="summary-label">Stok Kodu</span>
                            <span className="summary-value font-mono">{results[0].StokKodu}</span>
                        </div>
                        <div className="summary-item" style={{ flex: 2 }}>
                            <span className="summary-label">Ürün Adı</span>
                            <span className="summary-value" title={results[0].UrunAdi}>{results[0].UrunAdi || '-'}</span>
                        </div>
                        <div className="summary-item summary-total">
                            <span className="summary-label">Toplam Bakiye</span>
                            <span className="summary-value highlight">
                                {results.reduce((sum, item) => sum + (item.ToplamBakiye || 0), 0)}
                            </span>
                        </div>
                    </div>

                    <div className="table-card card">
                        <div className="table-responsive">
                            <table className="modern-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '25%' }}>Depo Kodu</th>
                                        <th style={{ width: '30%' }}>Seri No</th>
                                        <th style={{ width: '25%' }}>Lot No</th>
                                        <th style={{ width: '20%', textAlign: 'right' }}>Kalan Bakiye</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((item, index) => (
                                        <tr key={index} className="table-row fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
                                            <td>
                                                <div className="depo-badge">
                                                    <span className="depo-icon">🏢</span>
                                                    {item.DepoKodu}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="font-mono" style={{ color: 'var(--primary-dark)', fontWeight: '600' }}>
                                                    {item.SeriNo || '-'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="font-mono text-muted">
                                                    {item.LotNo || '-'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span className="bakiye-badge">{item.ToplamBakiye}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            {isScannerOpen && (
                <QrScannerModal 
                    isOpen={isScannerOpen} 
                    onClose={() => setIsScannerOpen(false)} 
                    onScan={handleScan} 
                />
            )}

            {isGuideOpen && (
                <GuideModal
                    isOpen={isGuideOpen}
                    onClose={() => setIsGuideOpen(false)}
                    title="Stok Rehberi"
                    data={guideData}
                    onSelect={handleGuideSelect}
                    displayType="CARD"
                />
            )}
        </div>
    );
};

export default BakiyeSorgulama;
