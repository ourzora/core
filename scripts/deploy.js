const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const hre = require('hardhat');
const { createStream } = require('table');
const colors = require('colors');
const hjson = require('hjson');
const fastUtils = require(path.join(
  __dirname,
  '../scripts/fastUtils/utils.js'
));

// @dev provider is an abstraction of JSON-RPC requests used by the ethers.js library to interact with the Ethereum network.
// It is used to deploy contracts, send transactions, and read blockchain data.
const network = hre.network.name;
const provider =
  network === 'localhost'
    ? new ethers.providers.JsonRpcProvider()
    : new ethers.providers.StaticJsonRpcProvider(
        hre.config.networks[network].url
      );

let signer;

// @dev you can pass a specific config via the console (env variable) or if calling from another script, as an argument. If no config is passed, the default config is used.
const DEPLOY_CONFIG = fastUtils.prepareDeployConfig(network);

const tableConfig = {
  columnDefault: {
    width: 44,
  },
  columnCount: 3,
};

// Helper function to read JSON from a file
function readJSONFromFile(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
  } catch (e) {
    throw new Error(`Error reading data from file: ${filePath}`, e);
  }
}

// Helper function to write JSON to a file
function writeJSONToFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data));
  } catch (e) {
    console.error(`Error writing data to file: ${filePath}`, e);
  }
}

// @dev saveDeploymentData is a function that saves the contract's arguments, address, and libraries used in the deployments directory.
async function saveDeploymentData(contractName, contractInstance, args, lib) {
  const artifact = await readAndParseContractArtifact(contractName);
  const data = {
    address: contractInstance.address,
    sourceName: artifact.sourceName,
    args: args,
    libraries: lib,
    abi: contractInstance.interface.format('json'),
  };
  try {
    writeJSONToFile(
      path.join(__dirname, `../deployments/${contractName}.json`),
      data
    );
  } catch (e) {
    console.error(`Error saving data for: ${contractName}`, e);
  }
}

// @dev readDeploymentData is a function that reads the contract's deployment data from the deployments directory.
async function readDeploymentData(contractName) {
  try {
    return readJSONFromFile(
      path.join(__dirname, `../deployments/${contractName}.json`)
    );
  } catch (e) {
    throw new Error(`Error reading data for: ${contractName}`, e);
  }
}

// Helper function to read and parse contract's JSON artifact
function readAndParseContractArtifact(
  contractName,
  dir = path.join(__dirname, '../artifacts/contracts')
) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (let entry of entries) {
    if (entry.isDirectory()) {
      const result = readAndParseContractArtifact(
        contractName,
        path.join(dir, entry.name)
      );
      if (result) return result;
    } else if (
      entry.name === `${contractName}.json` &&
      path.basename(dir) === `${contractName}.sol`
    ) {
      const artifact = JSON.parse(
        fs.readFileSync(path.join(dir, entry.name), 'utf8')
      );
      return artifact;
    }
  }
}

// @dev getConstructorArgNames is a function that reads the contract's source code, compiles it, and extracts the names of the constructor arguments.
async function getConstructorArgNames(contractName) {
  try {
    const artifact = await readAndParseContractArtifact(contractName);
    const abi = artifact.abi;
    const constructor = abi.find((item) => item.type === 'constructor');
    let argNames;
    if (constructor) {
      argNames = constructor.inputs.map(
        (input, index) => input.name || `arg${index + 1}`
      );
    } else {
      argNames = [];
    }
    return argNames;
  } catch (e) {
    console.error(e);
    throw new Error(
      `Error getting constructor argument names for ${contractName}: ${e}`
    );
  }
}

async function prepareLibraries(libraries) {
  const lib = {};
  if (typeof libraries === 'object') {
    const contractsPromises = Object.entries(libraries).map(
      async ([key, value]) => {
        if (typeof value === 'string' && value.includes('.address')) {
          const contractName = value.split('.')[0];
          let data;
          try {
            data = await readDeploymentData(contractName);
          } catch (e) {
            console.error(`Error reading data for: ${contractName}`, e);
            process.exit(1);
          }
          const contractInstance = await hre.ethers.getContractAt(
            contractName,
            data.address
          );
          return { name: key, instance: contractInstance };
        } else {
          return { name: key, instance: value };
        }
      }
    );
    const contracts = await Promise.all(contractsPromises);
    for (let contract of contracts) {
      lib[contract.name] = contract.instance.address || contract.instance;
    }
  }
  return lib;
}

async function prepareConstructorArgs(constructorArgs) {
  return await Promise.all(
    constructorArgs.map(async (arg) => {
      if (typeof arg === 'string' && arg.includes('.address')) {
        const contractName = arg.split('.')[0];
        const data = await readDeploymentData(contractName);
        return data.address;
      }
      return arg;
    })
  );
}

// @dev prepareAndDisplayContractsTable is a function that prepares and displays a table of contracts to be deployed.

async function prepareAndDisplayContractsTable(deployConfig) {
  console.log('\n\nDeploying ...');
  const stream = createStream(tableConfig);
  stream.write(['Contract'.cyan, 'Args'.cyan, 'Libs'.cyan]);
  const contractsDataPromises = deployConfig.map(async (config) => {
    const constructorArg = config.constructorArgs;
    const library = config.libraries;
    const argNames = await getConstructorArgNames(config.name);
    const argsDisplay =
      Array.isArray(constructorArg) && constructorArg.length > 0
        ? argNames
            .map((name, index) => `${name}: ${constructorArg[index]}`)
            .join(', ') +
          colors.grey('\nSource: ') +
          colors.grey(config.argsSource)
        : '-';
    const libsDisplay =
      Object.keys(library).length > 0
        ? Object.entries(library)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ') +
          colors.grey('\nSource: ') +
          colors.grey(config.libsSource)
        : '-';
    return [config.name, argsDisplay, libsDisplay];
  });
  const contractsData = await Promise.all(contractsDataPromises);
  contractsData.forEach((data) => stream.write(data));
}

function prepareAndDisplayDeploymentResultsTable() {
  console.log('\n\nDeployment Results:');
  const stream = createStream(tableConfig);
  stream.write(['Contract'.cyan, 'Address'.cyan, 'Response'.cyan]);
  return stream;
}

function createAndDisplayRowTable(stream, contract, address, error) {
  stream.write([contract, address, error]);
}

async function deployContract(contractName, libraries, constructorArgs) {
  const lib = await prepareLibraries(libraries);
  const args = await prepareConstructorArgs(constructorArgs);
  const Contract = await hre.ethers.getContractFactory(contractName, {
    libraries: lib,
  });
  const contractInstance = await Contract.deploy(...args);
  await contractInstance.deployed();
  await saveDeploymentData(contractName, contractInstance, args, lib);
  return contractInstance;
}

async function main(configArray) {
  try {
    if (!fs.existsSync(path.join(__dirname, '../deployments'))) {
      fs.mkdirSync(path.join(__dirname, '../deployments'));
    }

    signer = await hre.ethers.provider.getSigner();

    const DEPLOY_CONFIG = fastUtils.prepareDeployConfig(network, configArray);

    writeJSONToFile(path.join(__dirname, `../deployments/build-info.json`), {
      buildTime: new Date().toISOString(),
      network: hre.network.name,
      signer: signer.address,
      config: DEPLOY_CONFIG,
    });

    await prepareAndDisplayContractsTable(DEPLOY_CONFIG);
    const stream = prepareAndDisplayDeploymentResultsTable();
    const deployedContracts = {};
    for (let i = 0; i < DEPLOY_CONFIG.length; i++) {
      const contract = DEPLOY_CONFIG[i].name;
      try {
        const contractInstance = await deployContract(
          contract,
          DEPLOY_CONFIG[i].libraries,
          DEPLOY_CONFIG[i].constructorArgs
        );
        createAndDisplayRowTable(
          stream,
          contract,
          contractInstance.address,
          colors.green('tx: ', contractInstance.deployTransaction.hash)
        );
        deployedContracts[contract] = contractInstance;
      } catch (e) {
        createAndDisplayRowTable(
          stream,
          contract,
          '',
          colors.red(e.message.substring(0, 1000))
        );
        process.exit(1);
      }
    }
    await fastUtils.save();
    return deployedContracts;
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

module.exports = main;

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Main error: ', error);
      process.exit(1);
    });
}
