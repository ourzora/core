import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import dotenv from 'dotenv';
dotenv.config();
import 'hardhat-ignore-warnings';
// import "hardhat-typechain";
import "solidity-coverage";
import "@nomiclabs/hardhat-etherscan";
import * as fastUtils from './scripts/fastUtils/utils.js';

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("save", "Saves artifact and deployment files to the ./archive folder")
  .setAction(async () => {
    await fastUtils.archive();
  });

task("archive", "Saves artifact and deployment files to the ./archive folder, then deletes the files from the artifact and deployments directories")
  .setAction(async () => {
    await fastUtils.archive();
  });


// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config = {
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.RPC_API_KEY}`,
      accounts: {
        mnemonic: `${process.env.MNEMONIC}`
      }
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.RPC_API_KEY}`,
      accounts: {
        mnemonic: `${process.env.MNEMONIC}`
      }
    }    
  },
  solidity: {
    version: "0.6.8",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests:"./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  mocha: {
    timeout: 40000
  },
  warnings: 'off',
}

export default config;
