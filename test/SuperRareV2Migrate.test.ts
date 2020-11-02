import { generatedWallets, signMessage } from '../utils/generatedWallets';
import { Blockchain } from '../utils/Blockchain';

import { JsonRpcProvider } from '@ethersproject/providers';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { SuperRareV2MigrateFactory } from '../typechain/SuperRareV2MigrateFactory';
import { CreatorMigrationStorageFactory } from '../typechain/CreatorMigrationStorageFactory';
import { BigNumber, Bytes, Wallet } from 'ethers';
import Decimal from '../utils/Decimal';
import { InvertAuctionFactory, InvertToken, InvertTokenFactory, SuperRareV2Factory } from '../typechain';
import {
  toNumWei,
} from './utils';

chai.use(asPromised);

let provider = new JsonRpcProvider();
let blockchain = new Blockchain(provider);
let superRareMigrateAddress: string;
let storageContractAddress: string;
let invertContractAddress: string;
let invertAuctionAddress: string;
let superRareV2ContractAddress: string;

type DecimalValue = { value: BigNumber };
type PartialBidShare = {
  prevOwner: DecimalValue,
  owner: DecimalValue
};

describe("SuperRareV2Migrate", () => {
  let [
    deployerWallet,
    userWallet,
    otherWallet,
  ] = generatedWallets(provider);

  let defaultTokenId = 0;

  let defaultPBS = {
    prevOwner: Decimal.new(10),
    owner: Decimal.new(80)
  };

  function revert(message: string) {
    return `VM Exception while processing transaction: revert ${message}`;
  }

  async function deployMigrator(storageAddress: string, superrareAddress: string, invertAddress: string){
    const superRareMigrate = await(
      await new SuperRareV2MigrateFactory(deployerWallet).deploy(
        storageAddress,
        superrareAddress,
        invertAddress
      )
    ).deployed()
    superRareMigrateAddress = superRareMigrate.address;
  }

  async function deployStorage(){
    const storageContract = await (
      await new CreatorMigrationStorageFactory(deployerWallet).deploy()
    ).deployed()
    storageContractAddress = storageContract.address;
  }

  async function deployInvertAuction(){
    const invertAuction = await (
      await new InvertAuctionFactory(deployerWallet).deploy()
    ).deployed()
    invertAuctionAddress = invertAuction.address;
  }

  async function configureInvertAuction(){
    await InvertAuctionFactory.connect(invertAuctionAddress, deployerWallet).configure(invertContractAddress);
  }

  async function deployInvertToken(){
    const invertContract = await (
      await new InvertTokenFactory(deployerWallet).deploy(invertAuctionAddress)
    ).deployed()
    invertContractAddress = invertContract.address;
  }

  async function deploySuperRareV2(){
    const superRare = await new SuperRareV2Factory(deployerWallet).deploy(
      "test",
      "TEST",
    )
    superRareV2ContractAddress = superRare.address;
  }

  async function deployRequiredContracts(){
    // Deploy and Configure Invert Contracts
    await deployInvertAuction()
    await deployInvertToken();
    await configureInvertAuction();

    // Deploy SuperRare
    await deploySuperRareV2();

    // Deploy Migrator Contracts
    await deployStorage();
    await deployMigrator(
      storageContractAddress,
      superRareV2ContractAddress,
      invertContractAddress
    );
  }

  async function approveSuperRareToken(approvedAddress: string, tokenId: number){
    await SuperRareV2Factory.connect(superRareV2ContractAddress, userWallet).approve(
      approvedAddress,
      tokenId
    );
  }

  async function addSuperRareToken(){
    await SuperRareV2Factory.connect(superRareV2ContractAddress, userWallet).addNewToken(
      "superrare.com"
    );
  }

  async function initSuperRareWhitelist(whitelistedAddresses: string[]) {
    await SuperRareV2Factory.connect(superRareV2ContractAddress, deployerWallet).initWhitelist(whitelistedAddresses);
  }

  async function submitApproval(wallet: Wallet, creatorAddress: string, signature: Bytes){
    return CreatorMigrationStorageFactory.connect(
      storageContractAddress,
      wallet
    ).submitApproval(
      creatorAddress,
      signature
    );
  }

  async function migrate(wallet: Wallet, tokenId: number, creatorAddress: string, pbs: PartialBidShare){
    await SuperRareV2MigrateFactory.connect(superRareMigrateAddress, wallet).migrate(
      tokenId,
      creatorAddress,
      pbs,
      { gasLimit: 1000000 }
      );
  }

  beforeEach(async () => {
    await blockchain.resetAsync();
  });

  describe('#constructor', () => {

    it("deploys successfully", async () => {
      await expect(deployInvertAuction()).eventually.fulfilled;
      await expect(deployInvertToken()).eventually.fulfilled;
      await expect(deploySuperRareV2()).eventually.fulfilled;
      await expect(deployStorage()).eventually.fulfilled;

      await expect(deployMigrator(
        storageContractAddress,
        superRareV2ContractAddress,
        invertContractAddress
      )).eventually.fulfilled;
    });
  });

  describe('#migrate', () => {
    let whitelist = [userWallet.address];

    beforeEach(async () => {
      await deployRequiredContracts();
    });

    it("reverts if the caller does not own the NFT", async () => {
      await initSuperRareWhitelist(whitelist);
      await addSuperRareToken();

      await expect(migrate(otherWallet, defaultTokenId, userWallet.address, defaultPBS)).rejectedWith(
        revert("SuperRareV2Migrate: you must own this NFT to attempt to migrate it to Zora")
      );
    });

    it("reverts if the caller has not approved the contract to transfer the NFT", async () => {
      await initSuperRareWhitelist(whitelist);
      await addSuperRareToken();

      await expect(migrate(userWallet, defaultTokenId, userWallet.address, defaultPBS)).rejectedWith(
        revert("SuperRareV2Migrate: you must approve() this contract to give it permission to withdraw this NFT")
      );
    });

    it("reverts if the creator has not yet approved the migration", async () => {
      await initSuperRareWhitelist(whitelist);
      await addSuperRareToken();
      await approveSuperRareToken(superRareMigrateAddress, defaultTokenId);

      await expect(migrate(userWallet, defaultTokenId, userWallet.address, defaultPBS)).rejectedWith(
        revert("SuperRareV2Migrate: creator has not yet approved the migration of their creations to Zora")
      );
    });

    it("burns the NFT and mints a new Zora MediaToken™️", async () => {
      await initSuperRareWhitelist(whitelist);
      await addSuperRareToken();
      await approveSuperRareToken(superRareMigrateAddress, defaultTokenId);

      const creatorSig = await signMessage("invert", userWallet);
      await expect(submitApproval(otherWallet, userWallet.address, creatorSig)).fulfilled;

      const legacyURI = await SuperRareV2Factory.connect(superRareV2ContractAddress, userWallet).tokenURI(defaultTokenId);

      const beforeUserOwned = await SuperRareV2Factory.connect(superRareV2ContractAddress, userWallet).balanceOf(userWallet.address);
      expect(toNumWei(beforeUserOwned)).eq(1);

      await expect(migrate(userWallet, defaultTokenId, userWallet.address, defaultPBS)).fulfilled;

      // verify userWallet now has a balanceOf == 0 in SuperRareV2 contract
      const afterUserOwned = await SuperRareV2Factory.connect(superRareV2ContractAddress, userWallet).balanceOf(userWallet.address);
      expect(toNumWei(afterUserOwned)).eq(0);

      // verify the migrate contract has a balanceOf == 0
      const legacyOwned = await SuperRareV2Factory.connect(superRareV2ContractAddress, userWallet).balanceOf(superRareMigrateAddress);
      expect(toNumWei(legacyOwned)).eq(0);

      // verify the ownerOf(defaultTokenId) in Invert is the address that called migrate()
      const zoraOwner = await InvertTokenFactory.connect(invertContractAddress, userWallet).ownerOf(defaultTokenId);
      expect(zoraOwner).eq(userWallet.address);

      // verify the the tokenURI is properly ported over
      // TODO: verify this is the behavior we want..
      const zoraURI = await InvertTokenFactory.connect(invertContractAddress, userWallet).tokenURI(defaultTokenId);
      expect(zoraURI).eq(legacyURI);
    });

  });
});
