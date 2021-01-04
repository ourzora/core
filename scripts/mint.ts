import fs from 'fs-extra';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Wallet } from '@ethersproject/wallet';
import { MediaFactory } from '../typechain/MediaFactory';
import Decimal from '../utils/Decimal';

async function start() {
  const args = require('minimist')(process.argv.slice(2), {
    string: ['tokenURI', 'metadataURI', 'contentHash', 'metadataHash'],
  });

  if (!args.chainId) {
    throw new Error('--chainId chain ID is required');
  }
  if (!args.tokenURI) {
    throw new Error('--tokenURI token URI is required');
  }
  if (!args.metadataURI) {
    throw new Error('--metadataURI metadata URI is required');
  }
  if (!args.contentHash) {
    throw new Error('--contentHash content hash is required');
  }
  if (!args.metadataHash) {
    throw new Error('--metadataHash content hash is required');
  }
  if (!args.creatorShare && args.creatorShare !== 0) {
    throw new Error('--creatorShare creator share is required');
  }
  const path = `${process.cwd()}/.env${
    args.chainId === 1 ? '.prod' : args.chainId === 4 ? '.dev' : '.local'
  }`;
  await require('dotenv').config({ path });
  const provider = new JsonRpcProvider(process.env.RPC_ENDPOINT);
  // const wallet = new Wallet(`0x${process.env.PRIVATE_KEY}`, provider);
  const wallet = new Wallet(`0x${process.env.PRIVATE_KEY}`, provider);
  const sharedAddressPath = `${process.cwd()}/addresses/${args.chainId}.json`;
  // @ts-ignore
  const addressBook = JSON.parse(await fs.readFileSync(sharedAddressPath));
  if (!addressBook.media) {
    throw new Error(`Media contract has not yet been deployed`);
  }

  const media = MediaFactory.connect(addressBook.media, wallet);

  console.log(
    'Minting... ',
    args.tokenURI,
    args.contentHash,
    args.metadataURI,
    args.metadataHash
  );

  await media.mint(
    {
      tokenURI: args.tokenURI,
      metadataURI: args.metadataURI,
      contentHash: Uint8Array.from(Buffer.from(args.contentHash, 'hex')),
      metadataHash: Uint8Array.from(Buffer.from(args.metadataHash, 'hex')),
    },
    {
      prevOwner: Decimal.new(0),
      creator: Decimal.new(args.creatorShare),
      owner: Decimal.new(100 - args.creatorShare),
    }
  );

  console.log(`New piece is minted ☼☽`);
}

start().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
