const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
const { createStream } = require('table');
const colors = require('colors');
const hjson = require('hjson');
const scriptsConfig = require('../scripts/scripts-config.js');
const deploymentsDir = path.join(__dirname, '../deployments');
const fastUtils = require(path.join(
  __dirname,
  '../scripts/fastUtils/utils.js'
));

// Setting up the Ethereum network provider
// If the network is 'localhost', a JsonRpcProvider is used, otherwise a StaticJsonRpcProvider is used.
const network = hre.network.name;

// Function to create a console table with specific column configuration
function createConsoleTable() {
  console.log('\n\nVerifying:');
  const config = {
    columnDefault: {
      width: 30,
    },
    columnCount: 5,
    columns: {
      0: { width: 10 },
      1: { width: 30 },
      2: { width: 15 },
      3: { width: 30 },
      4: { width: 44 },
    },
  };
  const stream = createStream(config);
  stream.write([
    colors.cyan('Contract'),
    colors.cyan('Address'),
    colors.cyan('Args'),
    colors.cyan('Libs'),
    colors.cyan('Response'),
  ]);
  return stream;
}

function getDeploymentFiles(contractsToVerify, rest, table) {
  let contracts = contractsToVerify;

  if (contractsToVerify.length > 0) {
    contracts = contracts.filter((contract) => {
      const contractName = contract.split('.')[0];
      const filePath = path.join(deploymentsDir, `${contractName}.json`);
      const exists = fs.existsSync(filePath);
      if (!exists) {
        table.write([
          contractName,
          '',
          '',
          '',
          colors.red(`${contractName} not found in deployments directory.`),
        ]);
      }
      return exists;
    });
    contracts.sort(
      (a, b) =>
        contractsToVerify.indexOf(a.split('.')[0]) -
        contractsToVerify.indexOf(b.split('.')[0])
    );
  }

  if (rest) {
    const allContracts = fs.readdirSync(deploymentsDir);
    const remainingContracts = allContracts.filter(
      (contract) => !contracts.includes(contract)
    );
    contracts = [...contracts, ...remainingContracts];
  }
  return contracts;
}

function readJSONFromFile(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
  } catch (e) {
    throw new Error(`Error reading data from file: ${filePath}`, e);
  }
}

function extractContractDataFromDeploymentFiles(file) {
  // Parse the file into json
  const contract = file.split('.')[0];
  const filePath = path.join(deploymentsDir, `${contract}.json`);
  let deploymentData;
  try {
    deploymentData = readJSONFromFile(filePath);
  } catch (error) {
    throw new Error(`Error reading data from file: ${filePath}`, error);
  }

  // Extract the required verification arguments from the json
  const contractAddress = deploymentData.address;
  const sourceName = deploymentData.sourceName;
  const contractArgs = deploymentData.args;
  const contractLibraries = deploymentData.libraries;

  return {
    contract,
    contractAddress,
    sourceName,
    contractArgs,
    contractLibraries,
  };
}

async function etherscanVerify(
  contract,
  contractAddress,
  sourceName,
  contractArgs,
  contractLibraries
) {
  return await hre.run('verify:verify', {
    contract: `${sourceName}:${contract}`,
    address: contractAddress,
    constructorArguments: contractArgs,
    libraries: contractLibraries,
  });
}

function prepareAndDisplayVerificationResultsTable(
  table,
  contract,
  contractAddress,
  contractArgs,
  contractLibraries,
  logMessages,
  error
) {
  if (error) {
    table.write([
      contract,
      contractAddress,
      JSON.stringify(contractArgs),
      JSON.stringify(contractLibraries),
      colors.red(error.message),
    ]);
  } else {
    table.write([
      contract,
      contractAddress,
      JSON.stringify(contractArgs),
      JSON.stringify(contractLibraries),
      colors.green(JSON.stringify(logMessages)),
    ]);
  }
}

async function main(configArray) {
  const [VERIFY_CONFIG, verifyRest] = fastUtils.prepareVerifyConfig(
    network,
    configArray
  );
  const table = createConsoleTable();
  const contracts = getDeploymentFiles(VERIFY_CONFIG, verifyRest, table);

  // Loop through the contracts and verify each contract. Each file is a json
  for (const singleContract of contracts) {
    // Suppress console.log and capture log messages in the table instead
    const originalConsoleLog = console.log;
    const logMessages = [];
    console.log = function (message) {
      logMessages.push(message);
    };

    // Extract contract data
    const {
      contract,
      contractAddress,
      sourceName,
      contractArgs,
      contractLibraries,
    } = extractContractDataFromDeploymentFiles(singleContract);

    // Run the verification task
    try {
      await etherscanVerify(
        contract,
        contractAddress,
        sourceName,
        contractArgs,
        contractLibraries
      );
      prepareAndDisplayVerificationResultsTable(
        table,
        contract,
        contractAddress,
        contractArgs,
        contractLibraries,
        logMessages
      );
    } catch (error) {
      prepareAndDisplayVerificationResultsTable(
        table,
        contract,
        contractAddress,
        contractArgs,
        contractLibraries,
        logMessages,
        error
      );
    } finally {
      //release console.log
      console.log = originalConsoleLog;
    }
  }
}
// Export the main function as a module
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
