const TestRPC = require('vaporyjs-testrpc'); // eslint-disable-line
// const HttpProvider = require('vapjs-provider-http');

module.exports = (options) => ({ // eslint-disable-line
  entry: [
    './environments.json',
    './src/tests/contracts',
  ],
  output: {
    path: './',
    filename: 'environments.json',
    safe: true,
  },
  module: {
    environment: {
      name: 'testrpc',
      provider: TestRPC.provider(),
      defaultTxObject: {
        from: 1,
        gas: 3000001,
      },
    },
    preLoaders: [
      { test: /\.(json)$/, loader: 'vapdeploy-environment-loader', build: true },
    ],
    loaders: [
      { test: /\.(sol)$/, exclude: /(test\.)/, loader: 'vapdeploy-solc-loader', optimize: 1 },
    ],
    deployment: (deploy, contracts, done) => {
      deploy(contracts.SimpleStore, { from: 0 }).then(() => {
        done();
      });
    },
  },
  plugins: [
    // new options.plugins.JSONMinifier(),
  ],
});
