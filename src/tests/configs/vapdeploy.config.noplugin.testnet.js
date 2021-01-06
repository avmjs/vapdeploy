const sign = require('vapjs-signer').sign;
const SignerProvider = require('vapjs-provider-signer');

module.exports = () => ({
  entry: [
    'environments.json',
    'contracts',
  ],
  output: {
    path: './',
    filename: 'environments.json',
  },
  module: {
    preLoaders: [
      { test: /\.(json)$/, loader: '../loaders/environment.js', build: true, include: /(environments)/ },
    ],
    loaders: [
      { test: /\.(sol)$/, loader: '../loaders/solc.js', optimize: 1 },
      { test: /\.(json)$/, loader: '../loaders/solc-json.js' },
    ],
    environment: {
      name: 'ropsten',
      provider: new SignerProvider('http://localhost:8545', {
        accounts: (cb) => cb(null, ['0x2233eD250Ea774146B0fBbC1da0Ffa6a81514cCC']),
        signTransaction: (rawTx, cb) => {
          cb(null, sign(rawTx, '0x..privateKey...'));
        },
      }),
      defaultTxObject: {
        from: 0,
        gas: 3000000,
      },
    },
    deployment: (deploy, contracts, done) => {
      deploy(contracts.SimpleStore).then((simpleStoreInstance) => {
        console.log(simpleStoreInstance); // eslint-disable-line

        done();
      });
    },
  },
});
