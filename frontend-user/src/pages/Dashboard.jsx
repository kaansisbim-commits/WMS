import React from 'react';
import { useConfig } from '../context/ConfigContext';

const Dashboard = () => {
    const { params } = useConfig();

    return (
        <div className="dashboard-page">
            <h1 className="brand-text">Depo Özeti</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                Kaan WMS Sistemine Hoş Geldiniz.
            </p>

            <div className="card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                <div className="card">
                    <h3>Sistem Durumu</h3>
                    <div style={{ marginTop: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Lot Takibi:</span>
                            <span style={{ fontWeight: 'bold', color: params.lotTakibiVarMi ? 'var(--success)' : 'var(--error)' }}>
                                {params.lotTakibiVarMi ? 'AKTİF' : 'PASİF'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Stok Sayım:</span>
                            <span style={{ fontWeight: 'bold', color: params.stokSayimActive ? 'var(--success)' : 'var(--error)' }}>
                                {params.stokSayimActive ? 'AKTİF' : 'PASİF'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h3>Hızlı İşlemler</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                        <button className="btn btn-primary">Mal Kabul Başlat</button>
                        <button className="btn btn-accent">Depolar Arası Sevk</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
