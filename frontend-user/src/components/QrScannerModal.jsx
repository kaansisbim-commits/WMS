import React, { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import './QrScannerModal.css';

const QrScannerModal = ({ isOpen, onClose, onScan }) => {
    const scannerRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            scannerRef.current = new Html5QrcodeScanner(
                "qr-reader",
                { fps: 10, qrbox: {width: 250, height: 250} },
                false
            );

            scannerRef.current.render(
                (decodedText, decodedResult) => {
                    if (scannerRef.current) {
                        scannerRef.current.clear();
                    }
                    onScan(decodedText);
                },
                (error) => {
                    // Ignore continuous scan errors, only show major ones if needed
                }
            );
        }

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(e => console.error(e));
            }
        };
    }, [isOpen, onScan]);

    if (!isOpen) return null;

    return (
        <div className="qr-modal-overlay">
            <div className="qr-modal-container scale-in">
                <div className="qr-modal-header">
                    <h3>Kamera ile Barkod/QR Okut</h3>
                    <button onClick={onClose} className="qr-modal-close">×</button>
                </div>
                <div className="qr-modal-body">
                    <div id="qr-reader" style={{ width: '100%' }}></div>
                </div>
                <div className="qr-modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>İptal</button>
                </div>
            </div>
        </div>
    );
};

export default QrScannerModal;
