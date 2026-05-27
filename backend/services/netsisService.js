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
     * Send Item Slip (FatIrs) to NetOpenX with Auto-Retry & Timeout Protection
     */
    async sendItemSlip(payload) {
        // Entegrasyon öncesi Token alıyoruz (Auth Pre-request)
        const tokenData = await this.getToken();
        const accessToken = tokenData.access_token;

        const MAX_RETRIES = 0;
        let attempt = 0;
        const TIMEOUT_MS = 60000; // IIS Cold Start veya geçici tıkanmalar için 60 saniyelik limit

        while (true) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

            try {
                console.log(`[NetOpenX SRE] Fiş gönderme denemesi #${attempt + 1}/${MAX_RETRIES + 1} başlatılıyor...`);

                const response = await fetch(`${this.baseUrl}/api/v2/ItemSlips`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                // Başarılı istek durumunda timeout temizleniyor
                clearTimeout(timeoutId);

                const data = await response.json().catch(() => ({}));

                if (!response.ok || data.IsSuccessful === false || data.IsSuccessful === 'false') {
                    throw { 
                        status: response.status, 
                        message: data.ErrorDesc || data.Error || data.ErrorMessage || data.message || data.Detail || data.detail || 'Kayıt başarısız',
                        isTransient: response.status >= 500 // 5xx durum kodları geçici hata sayılır
                    };
                }

                console.log(`[NetOpenX SRE] Fiş başarıyla aktarıldı (Deneme #${attempt + 1}).`);
                return data;

            } catch (err) {
                clearTimeout(timeoutId);

                const isTimeout = err.name === 'AbortError' || err.code === '20';
                const isNetworkError = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('fetch failed');
                const isTransientError = err.isTransient === true || isTimeout || isNetworkError;

                console.error(`[NetOpenX SRE] Deneme #${attempt + 1} başarısız oldu. Hata detayı:`, err.message || err);

                // Eğer deneme hakkımız varsa ve hata geçici (ağ/timeout/5xx) ise yeniden dene
                if (attempt < MAX_RETRIES && isTransientError) {
                    attempt++;
                    console.warn(`[NetOpenX SRE] Geçici ağ veya sunucu hatası tespit edildi. 2 saniye sonra tekrar denenecek (${attempt}/${MAX_RETRIES})...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    // Kalıcı bir hata (Örn: 400 Bad Request veya Validation Error) veya maksimum deneme sayısı aşıldıysa hatayı fırlat
                    console.error(`[NetOpenX SRE] Kayıt denemeleri sonlandırıldı. Hata veritabanına işleniyor...`);
                    throw {
                        status: err.status || 500,
                        message: err.message || (isTimeout ? 'NetOpenX Bağlantı Zaman Aşımı (60 saniye)' : 'NetOpenX Bağlantı Hatası')
                    };
                }
            }
        }
    }
}

module.exports = new NetsisService();
