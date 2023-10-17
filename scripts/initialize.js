// Importing necessary modules
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

// Setting up the Ethereum network provider
// If the network is 'localhost', a JsonRpcProvider is used, otherwise a StaticJsonRpcProvider is used.
const network = hre.network.name;
const scriptsConfigNetwork =
  hre.network.name === 'hardhat' ? 'localhost' : hre.network.name;
const provider =
  network === 'localhost'
    ? new ethers.providers.JsonRpcProvider()
    : new ethers.providers.StaticJsonRpcProvider(
        hre.config.networks[network].url
      );

// Declaration of signer variable, which will be used to sign transactions
let signer;

// Helper function to read JSON from a file
function readJSONFromFile(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
  } catch (e) {
    throw new Error(`Error reading data from file: ${filePath}`, e);
  }
}

// Function to read the contract's deployment data from the deployments directory
async function readDeploymentData(contractName) {
  try {
    return readJSONFromFile(
      path.join(__dirname, '../deployments', `${contractName}.json`)
    );
  } catch (e) {
    throw new Error(`Error reading data for: ${contractName}`, e);
  }
}

// Function to process arguments
// If an argument ends with '.address', it is assumed to be a contract name and its address is fetched from the deployment data
async function processFunctionArgs(args) {
  return await Promise.all(
    args.map(async (arg) => {
      if (typeof arg === 'string' && arg.endsWith('.address')) {
        const contractName = arg.split('.')[0];
        const deploymentData = await readDeploymentData(contractName);
        return deploymentData.address;
      } else {
        return arg;
      }
    })
  );
}

// Function to create a console table for displaying initialization results
function createConsoleTable() {
  const config = {
    columnDefault: {
      width: 44,
    },
    columns: {
      0: {
        width: 10,
      },
      1: {
        width: 30,
      },
      2: {
        width: 15,
      },
      3: {
        width: 30,
      },
      4: {
        width: 44,
      },
    },
    columnCount: 5,
  };
  const stream = createStream(config);
  stream.write([
    colors.cyan('Contract'),
    colors.cyan('Address'),
    colors.cyan('Function'),
    colors.cyan('Arguments'),
    colors.cyan('Response'),
  ]);
  return stream;
}

// Function to initialize a contract by calling a specified function with provided arguments
// If the initialization is successful, a success response is returned along with the contract details and transaction receipt
// If the initialization fails, an error response is returned along with the contract details and error message
async function initializeContract(init, signer) {
  let contractDeploymentData;
  try {
    const args = await processFunctionArgs(init.args);
    contractDeploymentData = await readDeploymentData(init.contract);
    const contract = new ethers.Contract(
      contractDeploymentData.address,
      contractDeploymentData.abi,
      signer
    );
    const tx = await contract[init.function](...args);
    let receipt = await tx.wait();

    // Map each argument to its corresponding address
    let argsWithAddresses = await Promise.all(
      init.args.map(async (arg) => {
        if (typeof arg === 'string' && arg.includes('.address')) {
          let contractName = arg.split('.')[0];
          let data = await readDeploymentData(contractName);
          return `${arg}: ${data.address}`;
        }
        return arg;
      })
    );

    return {
      contract: init.contract,
      address: contractDeploymentData.address,
      function: init.function,
      args:
        argsWithAddresses.join('\n\n') +
        colors.grey('\nSource: ') +
        colors.grey(init.argsSource),
      response: { type: 'success', message: receipt },
    };
  } catch (e) {
    // Map each argument to its corresponding address in the error case
    let argsWithAddresses = await Promise.all(
      init.args.map(async (arg) => {
        if (typeof arg === 'string' && arg.includes('.address')) {
          let contractName = arg.split('.')[0];
          let data;
          try {
            data = await readDeploymentData(contractName);
          } catch (e) {
            data = { address: 'N/A' };
          }
          return `${arg}: ${data.address}`;
        }
        return arg;
      })
    );

    return {
      contract: init.contract,
      address: contractDeploymentData ? contractDeploymentData.address : 'N/A',
      function: init.function,
      args:
        argsWithAddresses.join('\n\n') +
        colors.grey('\nSource: ') +
        colors.grey(init.argsSource),
      response: { type: 'error', message: e.message },
    };
  }
}

// Main function that initializes all contracts specified in the initializations array
// Results of each initialization are written to the console table
async function main(configArray) {
  // You can pass a specific config via the console (env variable) or if calling from another script, as an argument. If no config is passed, the default config is used.
  const INITIALIZE_CONFIG = fastUtils.prepareInitConfig(network, configArray);

  console.log('\n\nRunning initializations . . .');
  signer = await hre.ethers.getSigner();

  const table = createConsoleTable();

  const results = await Promise.all(
    INITIALIZE_CONFIG.map(async (init) => {
      try {
        return await initializeContract(init, signer);
      } catch (e) {
        return {
          contract: init.contract,
          address: 'N/A',
          function: init.function,
          args: 'N/A',
          response: { type: 'error', message: e.message },
        };
      }
    })
  );

  results.forEach((result) => {
    let responseColor =
      result.response.type === 'error' ? colors.red : colors.green;
    table.write([
      result.contract,
      result.address,
      result.function,
      result.args,
      responseColor(JSON.stringify(result.response.message)),
    ]);
  });
}

// Exporting the main function as a module
module.exports = main;

// If the script is called directly (e.g. node scripts/verify.js), run the main function
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Main error: ', error);
      process.exit(1);
    });
}
