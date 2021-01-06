const deepAssign = require('deep-assign');
const deepEqual = require('deep-equal');
const Vap = require('vapjs-query');
const VapUtils = require('vapjs-util');
const VapContract = require('vapjs-contract');
const stripHexPrefix = require('strip-hex-prefix');
const cloneDeep = require('clone-deep');
const utils = require('../utils/index.js');
const bnToString = utils.bnToString;
const error = utils.error;
const filterSourceMap = utils.filterSourceMap;
const deployContract = utils.deployContract;
const getInputSources = utils.getInputSources;

/**
 * Transform default tx object with accounts (mainly account 0 => accounts[0])
 *
 * @method transformTxObject
 * @param {Object} txObject the input default tx object
 * @param {Array} accounts the accounts from Vapory RPC
 * @return {Object} output the transformed tx object
 */
function transformTxObject(txObject, accounts) {
  // if no tx object, bypass
  if (typeof txObject !== 'object') { return txObject; }

  const from = typeof txObject.from === 'number' ? accounts[txObject.from] : txObject.from;

  return Object.assign({}, cloneDeep(txObject), { from });
}

/**
 * Load the environment, get accounts, gas limits, balances etc.
 *
 * @method loadEnvironment
 * @param {Object} environment the environment object specified in the config.js
 * @param {Function} callback the callback to return the environment
 * @callback {Object} output the transformed environment object
 */
function loadEnvironment(environment, callback) {
  const errorMsgBase = 'while transforming environment, ';

  var transformedEnvironment = cloneDeep(environment); // eslint-disable-line

  const query = new Vap(transformedEnvironment.provider);
  query.net_version((versionError, result) => { // eslint-disable-line
    if (versionError) { return callback(error(`${errorMsgBase}error attempting to connect to node environment '${transformedEnvironment.name}': ${versionError}`), null); }

    query.accounts((accountsError, accounts) => { // eslint-disable-line
      if (accountsError !== null) { return callback(error(`${errorMsgBase}error while getting accounts for deployment: ${accountsError}`), null); }

      callback(accountsError, Object.assign({}, cloneDeep(transformedEnvironment), {
        accounts,
        defaultTxObject: transformTxObject(environment.defaultTxObject, accounts),
      }));
    });
  });
}

/**
 * Prepair the contracts for deployment, scope contracts array, add name
 *
 * @method transformContracts
 * @param {Object} contracts the environment object specified in the config.js
 * @param {String} environmentName the callback to return the environment
 * @return {Object} output the scoped contracts object, ready for deployment method
 */
function transformContracts(contracts, environmentName) {
  const scopedContracts = Object.assign({}, cloneDeep(contracts[environmentName] || {}));

  // add name property to all contracts for deployment identification
  Object.keys(scopedContracts).forEach((contractName) => {
    scopedContracts[contractName].name = contractName;
  });

  // return new scroped contracts
  return scopedContracts;
}

/**
 * Validate the config, after the method has been called
 *
 * @method configError
 * @param {Object} config the environment object specified in the config.js
 * @return {Object|Null} output the config error, if any
 */
function configError(config) {
  if (typeof config !== 'object') { return `the config method must return a config object, got type ${typeof config}`; }
  if (typeof config.entry === 'undefined') { return `No defined entry! 'config.entry' must be defined, got type ${typeof config.entry}.`; }
  if (typeof config.module !== 'object') { return `No defined deployment module! 'config.module' must be an object, got type ${typeof config.module}`; }
  if (typeof config.module.deployment !== 'function') { return `No defined deployment function! 'config.module.deployment' must be type Function (i.e. 'module.deployment = (deploy, contracts, done){}' ), got ${typeof config.module.deployment}`; }
  if (typeof config.module.environment !== 'object') { return `No defined module environment object! 'config.module.environment' must be type Object, got ${typeof config.module.environment}`; }

  const environment = config.module.environment;
  if (typeof environment.provider !== 'object') { return `No defined provider object! 'config.module.environment' must have a defined 'provider' object, got ${typeof environment.provider}`; }
  if (typeof environment.name !== 'string') { return `No defined environment name! 'config.module.environment.name' must be type String, got ${typeof environment.name}`; }

  return null;
}

/**
 * Require the loader
 *
 * @method requireLoader
 * @param {Object} loaderConfig the loader config
 * @return {Object} loader the required loader
 */
function requireLoader(loaderConfig) {
  const errMsgBase = `while requiring loader ${JSON.stringify(loaderConfig)} config,`;
  if (typeof loaderConfig !== 'object') { throw error(`${errMsgBase}, config must be object, got ${typeof loaderConfig}`); }
  if (typeof loaderConfig.loader !== 'string') { throw error(`${errMsgBase}, config.loader must be String, got ${JSON.stringify(loaderConfig.loader)}`); }

  return require(loaderConfig.loader); // eslint-disable-line
}

/**
 * Load contracts from the sourcemap, start from base
 *
 * @method loadContracts
 * @param {Array} loaders the array of loaders
 * @param {Object} base the base contracts object from which to assign to
 * @param {Object} sourceMap the sourcemap from load time
 * @param {Object} environment the environments object
 * @param {Function} callback the method callback that returns the contracts
 * @callback {Object} contracts the loaded contracts
 */
function loadContracts(loaders, base, sourceMap, environment, callback) { // eslint-disable-line
  var outputContracts = cloneDeep(base); // eslint-disable-line
  const errMsgBase = 'while processing entry data, ';
  if (!Array.isArray(loaders)) { return callback(error(`${errMsgBase}loaders must be type Array, got ${typeof loaders}`)); }

  // process loaders
  try {
    loaders.forEach((loaderConfig) => {
      // require the loader for use
      const loader = requireLoader(loaderConfig);

      // filtered sourcemap based on regex/include
      const filteredSourceMap = filterSourceMap(loaderConfig.test,
        loaderConfig.include,
        sourceMap,
        loaderConfig.exclude);

      // get loaded contracts
      const loadedEnvironment = loader(cloneDeep(filteredSourceMap), loaderConfig, environment);

      // output the new contracts
      outputContracts = Object.assign({}, cloneDeep(outputContracts), cloneDeep(loadedEnvironment));
    });

    // transform final contracts output
    callback(null, outputContracts);
  } catch (loaderError) {
    callback(error(`${errMsgBase}loader error: ${loaderError}`));
  }
}

/**
 * Process the final load output into string output for file creation.
 *
 * @method processOutput
 * @param {Array} plugins the array of plugins, if any
 * @param {Object} outputObject the deplyed contracts
 * @param {Object} configObject the config js object
 * @param {Function} callback the method callback that returns the final string output
 * @callback {String} outputString the loaded contracts
 */
function processOutput(plugins, outputObject, configObject, baseContracts, contracts, environment, callback) { // eslint-disable-line
  // the final string to be outputed
  let outputString = JSON.stringify(outputObject, null, 2); // eslint-disable-line

  // the err msg base
  const errMsgBase = 'while processing output with plugins, ';
  if (!Array.isArray(plugins)) { return callback(error(`${errMsgBase}plugins must be type Array, got ${typeof plugins}`)); }

  // process deployers
  try {
    plugins.forEach((plugin) => {
      // process deployer method
      outputString = plugin.process({ output: outputString, config: configObject, baseContracts, contracts, environment });
    });

    // return final output string
    callback(null, outputString);
  } catch (deployerError) {
    callback(error(`${errMsgBase}plugins error: ${deployerError}`));
  }
}

/**
 * Determine if the contract has already been deployed.
 *
 * @method contractIsDeployed
 * @param {Object} baseContract the base contracts on which to deploy new ones
 * @param {Object} stagedContract the transformed environment
 * @return {Boolean} isDeployed has the contract already been deployed
 */
function contractIsDeployed(baseContract, stagedContract) {
  // if bytecode and inputs match, then skip with instance
  if (deepEqual(typeof baseContract.address, 'string')
    && deepEqual(baseContract.transactionObject, stagedContract.transactionObject)
    && deepEqual(`0x${stripHexPrefix(baseContract.bytecode)}`, `0x${stripHexPrefix(stagedContract.bytecode)}`)
    && deepEqual(baseContract.inputs, stagedContract.inputs)) {
    return true;
  }

  return false;
}

function isDefined(value) {
  return typeof value !== 'undefined';
}

/**
 * Is the value a transaction object.
 *
 * @method isTransactionObject
 * @param {Optional} value the potential tx object
 * @return {Boolean} isTransactionObject is the object a tx object
 */
function isTransactionObject(value) {
  if (typeof value !== 'object') { return false; }
  const keys = Object.keys(value);

  if (keys.length > 5) { return false; }
  if (keys.length === 0) { return true; }

  if (keys.length > 0 && isDefined(value.from) || isDefined(value.to) || isDefined(value.data) || isDefined(value.gas) || isDefined(value.gasPrice)) {
    return true;
  }

  return false;
}

/**
 * Basic deployer, if not deployed, deploy, else, skip and return instance
 *
 * @method buildDeployMethod
 * @param {Array} baseContracts the base contracts on which to compare to see if already deployed
 * @param {Object} transformedEnvironment the transformed environment
 * @param {Object} report the reporter method to report newly deployed contracts
 * @callback {Function} deploy the deply method used in module.deployment
 */
function buildDeployMethod(baseContracts, transformedEnvironment, report) {
  return (...args) => {
    let transactionObject = {};
    const defaultTxObject = transformedEnvironment.defaultTxObject || {};
    const contractData = args[0];


    if (typeof contractData !== 'object') {
      const noContractError = 'A contract you are trying to deploy does not exist in your contracts object. Please check your entry, loaders and contracts object.';

      return Promise.reject(error(noContractError));
    }

    const baseContract = baseContracts[contractData.name] || {};
    const contractNewArguments = args.slice(1);
    const contractInputs = bnToString(Array.prototype.slice.call(contractNewArguments));
    const contractBytecode = `0x${stripHexPrefix(contractData.bytecode)}`;
    const contractABI = JSON.parse(contractData.interface);
    const vap = new Vap(transformedEnvironment.provider);
    const contract = new VapContract(vap);
    const contractFactory = contract(contractABI, contractBytecode, defaultTxObject);

    // trim callback from inputs, not args
    // custom tx object not handled yet.....
    if (typeof contractInputs[contractInputs.length - 1] === 'function') {
      contractInputs.pop();
    }

    // if there is a tx object provided for just this contractInputs
    // then get tx object, assign over default and use as the latest tx object
    if (isTransactionObject(contractInputs[contractInputs.length - 1])) {
      const transformedTransactionObject = transformTxObject(contractInputs[contractInputs.length - 1], transformedEnvironment.accounts);
      contractInputs[contractInputs.length - 1] = transformedTransactionObject;
      transactionObject = Object.assign({}, cloneDeep(defaultTxObject), cloneDeep(transformedTransactionObject));
    } else {
      transactionObject = Object.assign({}, cloneDeep(defaultTxObject));
    }

    // check contract has transaction object, either default or specified
    if (!VapUtils.isHexString(transactionObject.from, 20)) {
      const invalidFromAccount = `Attempting to deploy contract '${contractData.name}' with an invalid 'from' account specified. The 'from' account must be a valid 20 byte hex prefixed Vapory address, got value '${transactionObject.from}'. Please specify a defaultTxObject in the module.environment.defaultTxObject (i.e. 'defaultTxObject: { from: 0 }') object or in the in the deploy method.`;

      return Promise.reject(error(invalidFromAccount));
    }

    // check if contract is already deployed, if so, return instance
    return new Promise((resolve, reject) => {
      const resolveAndReport = (contractInstance) => {
        // report the contract
        report(contractData.name,
          contractData,
          contractInstance.address,
          contractInputs,
          transactionObject,
          (contractInstance.receipt || baseContract.receipt));

        // resolve deployment
        resolve(contractInstance);
      };

      // if the contract is deployed, resolve with base base contract, else deploy
      if (contractIsDeployed(baseContract, {
        transactionObject,
        bytecode: contractBytecode,
        inputs: contractInputs,
      })) {
        resolveAndReport(contractFactory.at(baseContract.address));
      } else {
        deployContract(vap, contractFactory, contractInputs, (deployError, instance) => {
          if (deployError) {
            console.log(error(`while deploying contract '${contractData.name}': `, JSON.stringify(deployError.value, null, 2))); // eslint-disable-line
            reject(deployError);
          } else {
            resolveAndReport(instance);
          }
        });
      }
    });
  };
}

/**
 * Get source map for a single config object entry path.
 *
 * @method singleEntrySourceMap
 * @param {String} entryItem the entry item string, generally a file or dir path
 * @param {Array} entryData the entry data
 * @param {Object} sourceMap the source map
 * @callback {Function} callback the callback
 */
function singleEntrySourceMap(entryItem, entryData, sourceMap, callback) { // eslint-disable-line
  if (typeof entryItem !== 'string') { return callback(null, sourceMap); }

  // get input sources for this entry
  getInputSources(entryItem, (inputSourceError, inputSourceMap) => { // eslint-disable-line
    if (inputSourceError) { return callback(inputSourceError, null); }

    // get source data
    const sourceData = deepAssign({}, sourceMap, inputSourceMap);

    // get next entry item
    const nextEntryItem = entryData[entryData.indexOf(entryItem) + 1];

    // recursively go through tree
    singleEntrySourceMap(nextEntryItem, entryData, sourceData, callback);
  });
}

/**
 * Build complete file source map of all entry items from the config.entry.
 *
 * @method entrySourceMap
 * @param {Array|String} entry the entry object
 * @param {Function} callback the callback that will return the source map
 * @callback {Object} sourceMap the source map object with all files/dirs in entry
 */
function entrySourceMap(entry, callback) {
  const entryData = typeof entry === 'string' ? [entry] : entry;

  // get source map
  singleEntrySourceMap(entryData[0], entryData, {}, callback);
}

// critical concept methods for vapdeploy
module.exports = {
  transformTxObject,
  processOutput,
  buildDeployMethod,
  loadContracts,
  requireLoader,
  configError,
  transformContracts,
  loadEnvironment,
  singleEntrySourceMap,
  entrySourceMap,
};
