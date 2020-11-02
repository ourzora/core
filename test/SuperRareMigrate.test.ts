import { generatedWallets } from '../utils/generatedWallets';
import { Blockchain } from '../utils/Blockchain';

import { JsonRpcProvider } from '@ethersproject/providers';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { SuperRareMigrateFactory } from '../typechain/SuperRareMigrateFactory';
import { CreatorMigrationStorageFactory } from '../typechain/CreatorMigrationStorageFactory';
import { AddressZero } from '@ethersproject/constants';

import { SuperRareV2Factory } from '../typechain';

chai.use(asPromised);

let provider = new JsonRpcProvider();
let blockchain = new Blockchain(provider);
let superRareMigrateAddress: string;
let storageContractAddress: string;
let invertContractAddress: string;
let superRareV2ContractAddress: string;

xdescribe('SuperRareMigrate', () => {
  let [deployerWallet, userWallet] = generatedWallets(provider);

  async function deployMigrator(storageAddress: string, invertAddress: string) {
    const superRareMigrate = await (
      await new SuperRareMigrateFactory(deployerWallet).deploy(
        storageAddress,
        invertAddress
      )
    ).deployed();
    superRareMigrateAddress = superRareMigrate.address;
  }

  async function deployStorage() {
    const storageContract = await (
      await new CreatorMigrationStorageFactory(deployerWallet).deploy()
    ).deployed();
    storageContractAddress = storageContract.address;
  }

  async function deployInvertToken() {
    const invertContract = await (
      await new CreatorMigrationStorageFactory(deployerWallet).deploy()
    ).deployed();
    invertContractAddress = invertContract.address;
  }

  async function deploySuperRareV2() {
    const superRare = await new SuperRareV2Factory(deployerWallet).deploy(
      'test',
      'TEST',
      AddressZero
    );
    superRareV2ContractAddress = superRare.address;
  }

  beforeEach(async () => {
    await blockchain.resetAsync();
  });

  describe('#constructor', () => {
    before(async () => {
      await deployStorage();
      await deployInvertToken();
    });

    it('deploys successfully', async () => {
      await expect(
        deployMigrator(storageContractAddress, invertContractAddress)
      ).eventually.fulfilled;
    });
  });

  describe('#migrate', () => {
    beforeEach(async () => {
      await deployStorage();
      await deployInvertToken();
      await deployMigrator(storageContractAddress, invertContractAddress);
      await deploySuperRareV2();
    });

    it(' reverts if the specified tokenAddress is not an ERC721', async () => {});

    it('reverts if the caller does not own the NFT', async () => {});

    it('reverts if the caller has not approved the contract to transfer the NFT', async () => {});

    it('reverts if the creator has not yet approved the migration', async () => {});

    it('burns the NFT and mints a new Zora MediaToken™️', async () => {});
  });
});
