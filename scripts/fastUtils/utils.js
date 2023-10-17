const fs = require('fs').promises;
const path = require('path');
const artifactsDirectory = './artifacts';
const deploymentsDirectory = './deployments';
const archiveDirectory = './archive';
const hjson = require('hjson');
const scriptsConfig = require(path.join(__dirname, '../scripts-config.js'));

async function ensureDirectoryExists(directory) {
  try {
    await fs.access(directory);
  } catch (e) {
    await fs.mkdir(directory);
  }
}

async function directoryExistsAndHasFiles(directory) {
  try {
    await fs.access(directory);
    return (await fs.readdir(directory)).length > 0;
  } catch (e) {
    return false;
  }
}

async function deleteDirectory(directory) {
  await fs.rm(directory, { recursive: true, force: true });
}

async function copyDirectory(source, destination) {
  await ensureDirectoryExists(destination);

  const files = await fs.readdir(source);

  for (const file of files) {
    const sourcePath = path.join(source, file);
    const destinationPath = path.join(destination, file);

    if ((await fs.lstat(sourcePath)).isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

async function save() {
  const timestamp = new Date().toISOString();
  const newArchiveDirectory = path.join(archiveDirectory, timestamp.toString());

  await ensureDirectoryExists(archiveDirectory);

  let artifactsExist = await directoryExistsAndHasFiles(artifactsDirectory);
  let deploymentsExist = await directoryExistsAndHasFiles(deploymentsDirectory);

  if (artifactsExist || deploymentsExist) {
    await fs.mkdir(newArchiveDirectory);

    if (artifactsExist) {
      await copyDirectory(
        artifactsDirectory,
        path.join(newArchiveDirectory, 'artifacts')
      );
    }
    if (deploymentsExist) {
      await copyDirectory(
        deploymentsDirectory,
        path.join(newArchiveDirectory, 'deployments')
      );
    }
  }
}

async function archive() {
  await save();

  await Promise.all([
    deleteDirectory(artifactsDirectory),
    deleteDirectory(deploymentsDirectory),
  ]);
}

function parseEnvVariable(variableName) {
  if (!process.env[variableName]) {
    return undefined;
  }
  try {
    return hjson.parse(process.env[variableName]);
  } catch (error) {
    throw new Error(`Unable to parse environment variable ${variableName}`);
  }
}

function prepareConfig(networkName, configArray, envVarName, scriptName) {
  let config = configArray
    ? configArray
    : parseEnvVariable(envVarName)
    ? parseEnvVariable(envVarName)
    : scriptsConfig[networkName]
    ? scriptsConfig[networkName][scriptName]
    : undefined;
  if (!config) {
    throw new Error(`No configuration found for network: ${networkName}`);
  }
  config = !Array.isArray(config)
    ? scriptsConfig[networkName][scriptName]
    : config;
  return config;
}

function handleRestFlag(configArray, flag) {
  const flagIndex = configArray.findIndex((config) => {
    if (typeof config === 'string') {
      return config === flag;
    } else {
      return config.name === flag || config.contract === flag;
    }
  });
  let flagFound = false;
  if (flagIndex !== -1) {
    configArray.splice(flagIndex, 1);
    flagFound = true;
  }
  return [configArray, flagFound];
}

function prepareDeployConfig(network, configArray) {
  let networkName = network === 'hardhat' ? 'localhost' : network;
  let deployConfig = prepareConfig(
    networkName,
    configArray,
    'DEPLOY_CONFIG',
    'deploy.js'
  );
  deployConfig = deployConfig.map((config) =>
    typeof config === 'string' ? { name: config } : config
  );
  let restFlag;
  [deployConfig, restFlag] = handleRestFlag(deployConfig, '+REST');
  if (restFlag) {
    const allContracts = scriptsConfig[networkName]['deploy.js'];
    deployConfig = allContracts.map((config) => {
      const overrideConfig = deployConfig.find((c) => c.name === config.name);
      if (overrideConfig) {
        config.constructorArgs =
          overrideConfig.constructorArgs || config.constructorArgs;
        config.libraries = overrideConfig.libraries || config.libraries;
        config.libsSource = overrideConfig.libraries ? 'arg' : 'config';
        config.argsSource = overrideConfig.constructorArgs ? 'arg' : 'config';
      }
      return config;
    });
  }
  deployConfig = deployConfig.map((config) => {
    if (!config.name)
      throw new Error(
        'Each element of DEPLOY_CONFIG must have a name property'
      );
    const defaultConfig = scriptsConfig[networkName]['deploy.js'].find(
      (c) => c.name === config.name
    );
    config.libraries =
      config.libraries || (defaultConfig ? defaultConfig.libraries : {}) || {};
    config.constructorArgs =
      config.constructorArgs ||
      (defaultConfig ? defaultConfig.constructorArgs : []) ||
      [];
    config.libsSource =
      config.libsSource ||
      (config.libraries === (defaultConfig ? defaultConfig.libraries : {})
        ? 'config'
        : 'arg');
    config.argsSource =
      config.argsSource ||
      (config.constructorArgs ===
      (defaultConfig ? defaultConfig.constructorArgs : [])
        ? 'config'
        : 'arg');
    return config;
  });
  return deployConfig;
}

function prepareInitConfig(network, configArray) {
  let networkName = network === 'hardhat' ? 'localhost' : network;
  let initConfig = prepareConfig(
    networkName,
    configArray,
    'INITIALIZE_CONFIG',
    'initialize.js'
  );
  initConfig = initConfig.map((config) =>
    typeof config === 'string' ? { contract: config } : config
  );
  let restFlag;
  [initConfig, restFlag] = handleRestFlag(initConfig, '+REST');
  if (restFlag) {
    const allContracts = scriptsConfig[networkName]['initialize.js'];
    initConfig = allContracts.map((config) => {
      const overrideConfig = initConfig.find(
        (c) => c.contract === config.contract
      );
      if (overrideConfig) {
        config.function = overrideConfig.function || config.function;
        config.args = overrideConfig.args || config.args;
        config.argsSource = overrideConfig.args ? 'arg' : 'config';
      }
      return config;
    });
  }
  const initConfigFinal = initConfig.map((config) => {
    if (!config.contract)
      throw new Error(
        'Each element of INITIALIZE_CONFIG must have a contract property'
      );
    const defaultConfig = scriptsConfig[networkName]['initialize.js'].find(
      (c) => c.contract === config.contract
    );
    config.function = config.function || defaultConfig.function;
    config.args = config.args || defaultConfig.args;
    config.argsSource = config.args === defaultConfig.args ? 'config' : 'arg';
    return config;
  });
  return initConfigFinal;
}

function prepareVerifyConfig(network, configArray) {
  let networkName = network === 'hardhat' ? 'localhost' : network;
  let verifyConfig = prepareConfig(
    networkName,
    configArray,
    'VERIFY_CONFIG',
    'verify.js'
  );
  let restFlag;
  [verifyConfig, restFlag] = handleRestFlag(verifyConfig, '+REST');
  return [verifyConfig, restFlag];
}

module.exports = {
  archive,
  copyDirectory,
  prepareDeployConfig,
  prepareInitConfig,
  prepareVerifyConfig,
  save,
};
