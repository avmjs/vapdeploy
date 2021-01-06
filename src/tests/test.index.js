const assert = require('chai').assert;
const BN = require('bn.js'); // eslint-disable-line
const BigNumber = require('bignumber.js'); // eslint-disable-line
const vapdeploy = require('../index.js'); // eslint-disable-line
const HttpProvider = require('vapjs-provider-http'); // eslint-disable-line
const TestRPC = require('vaporyjs-testrpc');

describe('vapdeploy', () => {
  describe('main method', () => {
    it('should instantiate properly', () => {
      assert.equal(typeof vapdeploy, 'function');
    });

    it('should handle undefined', (done) => {
      vapdeploy(undefined, (err, result) => {
        assert.isOk(err);
        assert.isNotOk(result);
        done();
      });
    });

    it('should handle empty object', (done) => {
      vapdeploy({}, (err, result) => {
        assert.isOk(err);
        assert.isNotOk(result);
        done();
      });
    });

    it('should handle empty function', (done) => {
      vapdeploy(() => {}, (err, result) => {
        assert.isOk(err);
        assert.isNotOk(result);
        done();
      });
    });

    it('should handle normal config', (done) => {
      vapdeploy({
        entry: [],
        output: {},
        module: {},
      }, (err, result) => {
        assert.isOk(err);
        assert.isNotOk(result);
        done();
      });
    });

    it('should handle normal config no provider', (done) => {
      vapdeploy({
        entry: [],
        output: {
        },
        module: {
          deployment: () => {},
        },
      }, (err, result) => {
        assert.isOk(err);
        assert.isNotOk(result);
        done();
      });
    });

    it('should handle normal config with no env', (done) => {
      vapdeploy({
        entry: [],
        output: {
        },
        module: {
          environment: {},
          deployment: () => {},
        },
      }, (err, result) => {
        assert.isOk(err);
        assert.isNotOk(result);
        done();
      });
    });

    it('should handle normal config with provider', (done) => {
      vapdeploy({
        entry: [],
        output: {
        },
        module: {
          environment: {
            provider: new HttpProvider('http://localhost:3000'),
          },
          deployment: () => {},
        },
      }, (err, result) => {
        assert.isOk(err);
        assert.isNotOk(result);
        done();
      });
    });

    it('should handle normal config with testrpc', (done) => {
      vapdeploy({
        entry: [],
        output: {},
        module: {
          environment: {
            name: 'localhost',
            provider: TestRPC.provider(),
          },
          deployment: (deploy, c, done1) => done(), // eslint-disable-line
        },
      }, (err, result) => {
        assert.isOk(result);
        assert.isNotOk(err);
        done();
      });
    });

    it('should handle normal entry with testrpc', (done) => {
      vapdeploy({
        entry: {
          SimpleStore: 1,
        },
        output: {},
        sourceMapper: (v, cb) => cb(null, v),
        module: {
          loaders: [
            { loader: 'vapdeploy-raw-solc-loader' },
          ],
          environment: {
            name: 'localhost',
            provider: TestRPC.provider(),
          },
          deployment: (deploy, contracts, done1) => {
            assert.equal(contracts.SimpleStore, 1);

            done1();
          }, // eslint-disable-line
        },
      }, () => done());
    });

    it('should handle normal entry with testrpc/raw solc', (done) => {
      vapdeploy({
        entry: {
          SimpleStore: {
            bytecode: '',
            interface: '',
          },
        },
        output: {},
        sourceMapper: (v, cb) => cb(null, v),
        module: {
          loaders: [
            { loader: 'vapdeploy-raw-solc-loader' },
          ],
          environment: {
            name: 'localhost',
            provider: TestRPC.provider(),
          },
          deployment: (deploy, contracts, done1) => {
            assert.equal(contracts.SimpleStore, 1);

            done1();
          }, // eslint-disable-line
        },
      }, () => done());
    });
  });
});
