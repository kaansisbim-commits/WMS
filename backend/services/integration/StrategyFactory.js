const DefaultStrategy = require('./DefaultStrategy');
const TransferStrategy = require('./TransferStrategy');

class StrategyFactory {
    static getStrategy(scrid) {
        switch (Number(scrid)) {
            case 201:
                return new TransferStrategy();
            // In the future, 101, 102, etc. can have their own specific strategies
            default:
                return new DefaultStrategy();
        }
    }
}

module.exports = StrategyFactory;
