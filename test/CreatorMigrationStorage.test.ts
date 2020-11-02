import { generatedWallets, signMessage } from '../utils/generatedWallets';
import { Blockchain } from '../utils/Blockchain';
import { Wallet } from 'ethers';
import { Bytes } from 'ethers';

import { JsonRpcProvider } from '@ethersproject/providers';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { CreatorMigrationStorage } from '../typechain/CreatorMigrationStorage';
import { CreatorMigrationStorageFactory } from '../typechain/CreatorMigrationStorageFactory';

chai.use(asPromised);

let provider = new JsonRpcProvider();
let blockchain = new Blockchain(provider);
let storageContractAddress: string;

describe("CreatorMigrationStorage", () => {
  let [
    deployerWallet,
    userWallet,
    creatorWallet
  ] = generatedWallets(provider);

  async function deploy(){
    const storageContract = await (
      await new CreatorMigrationStorageFactory(deployerWallet).deploy()
    ).deployed()
    storageContractAddress = storageContract.address;
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

  async function isApproved(creatorAddress: string){
    return CreatorMigrationStorageFactory.connect(
      storageContractAddress,
      userWallet
    ).isApproved(creatorAddress);
  }

  function revert(message: string) {
    return `VM Exception while processing transaction: revert ${message}`;
  }

  beforeEach(async () => {
    await blockchain.resetAsync();
  });

  describe("#constructor", () => {
   it('deploys', async () => {
     await expect(deploy()).eventually.fulfilled;
   });
  });

  describe('#approve', () => {
    beforeEach(async () => {
     await deploy();
    });

    it("reverts if the message is signed by a different address", async () => {
      const userSig = await signMessage("invert", userWallet);
      await expect(submitApproval(userWallet, creatorWallet.address, userSig)).rejectedWith(
        revert("invalid signature")
      );
    })

    it("reverts if the creator signs the wrong message", async () => {
      const creatorSig = await signMessage("foundation", creatorWallet);
      await expect(submitApproval(userWallet, creatorWallet.address, creatorSig)).rejectedWith(
        revert("invalid signature")
      );
    });

    it("accepts a valid signature and stores the creator's approval", async () => {
      const creatorSig = await signMessage("invert", creatorWallet);
      await expect(submitApproval(userWallet, creatorWallet.address, creatorSig)).fulfilled;

      const creatorApproved = await isApproved(creatorWallet.address);
      expect(creatorApproved).eq(true);
    });
  });

  describe("#isApproved", () => {
    beforeEach(async () => {
      await deploy();
    });

    it("returns true if the creator is approved", async () => {
      const creatorSig = await signMessage("invert", creatorWallet);
      await expect(submitApproval(userWallet, creatorWallet.address, creatorSig)).fulfilled;

      const creatorApproved = await isApproved(creatorWallet.address);
      expect(creatorApproved).eq(true);
    });

    it("returns false if the creator is not approved", async () => {
      const creatorApproved = await isApproved(creatorWallet.address);
      expect(creatorApproved).eq(false);
    });
  });
});
