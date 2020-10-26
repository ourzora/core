import fs from 'fs-extra';
import { JsonRpcProvider } from 'ethers/providers';
import { Wallet } from 'ethers';
import { InvertFactory } from '../typechain/InvertFactory';

async function start() {
  const args = require('minimist')(process.argv.slice(2));

  if (!args.chainId) {
    throw new Error('--chainId chain ID is required');
  }
  const path = `${process.cwd()}/.env${
    args.chainId === 1 ? '.prod' : args.chainId === 4 ? '.dev' : '.local'
  }`;
  await require('dotenv').config({ path });
  const provider = new JsonRpcProvider(process.env.RPC_ENDPOINT);
  const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
  const sharedAddressPath = `${process.cwd()}/addresses/${args.chainId}.json`;
  // @ts-ignore
  const addressBook = JSON.parse(await fs.readFileSync(sharedAddressPath));
  if (addressBook.invert) {
    throw new Error(
      `invert already exists in address book at ${sharedAddressPath}. Please move it first so it is not overwritten`
    );
  }

  console.log('Deploying Invert...');
  const deployTx = await new InvertFactory(wallet).deploy();
  console.log('Deploy TX: ', deployTx.deployTransaction.hash);
  await deployTx.deployed();
  console.log('Invert deployed at ', deployTx.address);
  addressBook.invert = deployTx.address;
  await fs.writeFile(sharedAddressPath, JSON.stringify(addressBook, null, 2));
}

start().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
