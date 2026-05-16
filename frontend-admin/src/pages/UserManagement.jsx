import React, { useState, useEffect } from 'react';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const availablePermissions = [
        { id: 'mal-kabul', label: 'Mal Kabul' },
        { id: 'sayim', label: 'Stok Sayım' },
        { id: 'sevk', label: 'Depo Sevk' },
        { id: 'admin-access', label: 'Admin Panel' }
    ];

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        const host = window.location.hostname;
        try {
            const res = await fetch(`http://${host}:8080/api/admin/users`, {
                headers: { 'Authorization': 'Bearer Admin123Token' }
            });
            const data = await res.json();
            if (data.success) {
                setUsers(data.data);
            }
        } catch (err) {
            console.error('Kullanıcılar yüklenemedi:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        
        const userData = {
            user: formData.get('user'),
            pass: formData.get('pass'),
            role: formData.get('role'),
            permissions: Array.from(formData.getAll('permissions'))
        };

        if (editingUser) userData.id = editingUser.id;

        const host = window.location.hostname;
        try {
            const res = await fetch(`http://${host}:8080/api/admin/users`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer Admin123Token'
                },
                body: JSON.stringify(userData)
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setShowModal(false);
                setEditingUser(null);
                fetchUsers();
            } else {
                alert('Hata: ' + data.message);
            }
        } catch (err) {
            alert('Bağlantı hatası: ' + err.message);
        }
    };

    const toggleStatus = async (user) => {
        const host = window.location.hostname;
        try {
            const res = await fetch(`http://${host}:8080/api/admin/users/toggle-status`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer Admin123Token'
                },
                body: JSON.stringify({ id: user.id, isActive: !user.isActive })
            });
            const data = await res.json();
            if (data.success) {
                fetchUsers();
            } else {
                alert('Hata: ' + data.message);
            }
        } catch (err) {
            alert('Bağlantı hatası: ' + err.message);
        }
    };

    return (
        <div className="user-management-page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="brand-text page-title">Kullanıcı Yönetimi</h1>
                    <p className="text-muted">Sistemi kullanacak personelleri tanımlayın ve yetkilerini belirleyin.</p>
                </div>
                <button className="btn btn-primary" style={{ height: '3.5rem', padding: '0 2rem' }} onClick={() => { setEditingUser(null); setShowModal(true); }}>
                    + Yeni Personel Ekle
                </button>
            </div>

            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <table className="user-table">
                    <thead>
                        <tr>
                            <th style={{ width: '250px' }}>Kullanıcı Bilgisi</th>
                            <th style={{ width: '150px' }}>Sistem Rolü</th>
                            <th>Erişim Yetkileri</th>
                            <th style={{ width: '150px', textAlign: 'right' }}>İşlemler</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>Yükleniyor...</td></tr>}
                        {!loading && users.map(u => (
                            <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.5, background: u.isActive ? 'transparent' : '#f8fafc' }}>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ fontWeight: '700', fontSize: '1.1rem', textDecoration: u.isActive ? 'none' : 'line-through' }}>{u.user}</div>
                                        {!u.isActive && <span style={{ background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>PASİF</span>}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {u.id}</div>
                                </td>
                                <td>
                                    <span style={{ 
                                        padding: '6px 12px', 
                                        background: u.role === 'admin' ? '#fee2e2' : '#f1f5f9', 
                                        color: u.role === 'admin' ? '#991b1b' : '#475569',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        fontWeight: '700'
                                    }}>
                                        {u.role.toUpperCase()}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {u.permissions?.map(p => (
                                            <span key={p} style={{ background: '#eff6ff', color: '#1e40af', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '500', border: '1px solid #dbeafe' }}>
                                                {availablePermissions.find(ap => ap.id === p)?.label || p}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button className="btn btn-outline" onClick={() => toggleStatus(u)}>
                                        {u.isActive ? 'Pasife Al' : 'Aktif Et'}
                                    </button>
                                    <button className="btn btn-outline" onClick={() => { setEditingUser(u); setShowModal(true); }}>
                                        Düzenle
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                    <div className="card" style={{ width: '100%', maxWidth: '600px', animation: 'zoomIn 0.2s ease-out' }}>
                        <h2 className="brand-text" style={{ marginBottom: '2rem' }}>{editingUser ? 'Personel Bilgilerini Güncelle' : 'Yeni Personel Tanımla'}</h2>
                        <form onSubmit={handleSave}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Kullanıcı Adı</label>
                                    <input name="user" className="form-input" defaultValue={editingUser?.user} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Şifre {editingUser && '(Değiştirmek istemiyorsanız boş bırakın)'}</label>
                                    <input name="pass" type="password" className="form-input" placeholder={editingUser ? '******' : 'Şifre giriniz'} required={!editingUser} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Sistem Rolü</label>
                                <select name="role" className="form-input" defaultValue={editingUser?.role || 'user'}>
                                    <option value="admin">Yönetici (Admin)</option>
                                    <option value="user">Saha Personeli (User)</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ marginTop: '2rem' }}>
                                <label className="form-label" style={{ marginBottom: '1rem' }}>Erişim Yetkileri</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    {availablePermissions.map(p => (
                                        <label key={p.id} style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                            <input 
                                                type="checkbox" 
                                                name="permissions" 
                                                value={p.id} 
                                                defaultChecked={editingUser?.permissions?.includes(p.id)}
                                                style={{ width: '18px', height: '18px' }}
                                            />
                                            {p.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '3rem' }}>
                                <button type="button" className="btn btn-outline" style={{ flex: 1, height: '3.5rem' }} onClick={() => setShowModal(false)}>İptal Et</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1, height: '3.5rem' }}>{editingUser ? 'Değişiklikleri Kaydet' : 'Personeli Oluştur'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
