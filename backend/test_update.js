const wmsService = require('./services/wmsService');

async function test() {
    try {
        console.log('Starting test...');
        const params = [
            { key: 'IsLotTrackingActive', value: true },
            { key: 'IsProdDateTrackingActive', value: true },
            { key: 'IsSKTTrackingActive', value: true },
            { key: 'LOKASYONTAKIBI', value: true },
            { key: 'SERINETSISEYAZ', value: true },
            { key: 'SIPBAGMALKABUL', value: true }
        ];
        const res = await wmsService.updateParameters(params);
        console.log('Result:', res);
        process.exit(0);
    } catch (err) {
        console.error('Error during updateParameters:', err);
        process.exit(1);
    }
}

test();
