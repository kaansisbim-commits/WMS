const wmsService = require('./services/wmsService');

const mockPayload = {
    header: {
        '10101': 'CARI_TEST',
        '10102': 'IRS123',
        '10103': '2026-05-25',
        '10196': '1'
    },
    lines: [
        {
            '10104': '01.01.N035',
            '10105': '1',
            '10106': 'NY',
            '10108': '2026000315', // next serial
            '10196': '1',
            '_GIRISSERI': 'H',
            '10112': 'NYAA TUTUCU KMP'
        }
    ]
};

async function run() {
    try {
        console.log("Calling saveReceipt...");
        const id = await wmsService.saveReceipt(mockPayload, null, "admin");
        console.log("saveReceipt success, ID:", id);
        process.exit(0);
    } catch (e) {
        console.error("saveReceipt error:", e);
        process.exit(1);
    }
}
run();
