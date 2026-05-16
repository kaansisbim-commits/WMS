/**
 * Netsis Service
 * Handles all external integration with NetOpenX REST API
 */
class NetsisService {
    constructor() {
        this.baseUrl = process.env.NETOPENX_URL || 'http://192.168.1.67:7071';
    }

    /**
     * Get OAuth2 Token from NetOpenX
     */
    async getToken() {
        const branchcode = process.env.NETOPENX_BRANCH || '0';
        const username = process.env.NETOPENX_USER || '';
        const password = process.env.NETOPENX_PASS || '';
        const dbname = process.env.NETOPENX_DBNAME || '';
        const dbuser = process.env.NETOPENX_DBUSER || 'TEMELSET';
        const dbpassword = process.env.NETOPENX_DBPASS || '';

        const params = new URLSearchParams();
        params.append('grant_type', 'password');
        params.append('branchcode', branchcode);
        params.append('username', username);
        params.append('password', password);
        params.append('dbname', dbname);
        params.append('dbuser', dbuser);
        params.append('dbpassword', dbpassword);
        params.append('dbtype', '0'); // MSSQL için 2 kullanılıyor

        const response = await fetch(`${this.baseUrl}/api/v2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: params.toString()
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.access_token) {
            const errorMsg = data.error_description || data.Message || 'Token alınamadı';
            throw { status: response.status, message: errorMsg, raw: data };
        }

        return data;
    }

    /**
     * Send Item Slip (FatIrs) to NetOpenX
     */
    async sendItemSlip(payload) {
        // Entegrasyon öncesi Token alıyoruz (Auth Pre-request)
        const tokenData = await this.getToken();
        const accessToken = tokenData.access_token;

        const response = await fetch(`${this.baseUrl}/api/v2/ItemSlips`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok && !data.IsSuccessful) {
            throw { status: response.status, message: data.ErrorDesc || data.message || 'Kayıt başarısız' };
        }

        return data;
    }
}

module.exports = new NetsisService();
