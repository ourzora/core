import { generatedWallets, signMessage } from '../utils/generatedWallets';
import { Blockchain } from '../utils/Blockchain';
import { Wallet } from 'ethers';
import { Bytes } from 'ethers';
import { ethers } from 'ethers';
import { BigNumberish } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { CreatorMigrationStorage } from '../typechain/CreatorMigrationStorage';
import { CreatorMigrationStorageFactory } from '../typechain/CreatorMigrationStorageFactory';
import { keccak256 } from 'ethers/lib/utils';
import { toNumWei } from './utils';

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

  async function owner(){
    return CreatorMigrationStorageFactory.connect(
      storageContractAddress,
      userWallet
    ).owner();
  }

  async function grantRole(role: Bytes, address: string){
    return CreatorMigrationStorageFactory.connect(
      storageContractAddress,
      deployerWallet
    ).grantRole(role, address);
  }

  async function hasRole(role: Bytes, address: string){
    return CreatorMigrationStorageFactory.connect(
      storageContractAddress,
      deployerWallet
    ).hasRole(role, address);
  }

  async function addPreviousTokenInfo(wallet: Wallet, invertTokenId: BigNumberish, tokenAddress: string, oldTokenId: BigNumberish){
    return CreatorMigrationStorageFactory.connect(
      storageContractAddress,
      wallet
    ).addPreviousTokenInfo(invertTokenId, tokenAddress, oldTokenId);
  }

  async function getPreviousTokenInfo(tokenId: BigNumberish){
    return CreatorMigrationStorageFactory.connect(
      storageContractAddress,
      userWallet
    ).previousTokenInfo(tokenId);
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

  describe("#addTokenLink", async() => {
    beforeEach(async () => {
      await deploy();
    });

    it("reverts if the caller does not have the LINKER_ROLE", async() => {
      const tokenAddress =  "0xa2d917811698d92D7FF80ed988775F274a51b435";
      await expect(addPreviousTokenInfo(userWallet, 0, tokenAddress, 1)).rejected;
    });

    it("adds the specified token link to storage", async() => {
      const tokenAddress =  "0xa2d917811698d92D7FF80ed988775F274a51b435";
      const writeRole = "0x18cfcf91fbc7fc280a1d211ca0a14f1d9abfe30d0bde44077e7a455f3eed9cf4";
      const writeRoleBytes = ethers.utils.arrayify(writeRole);

      await expect(grantRole(writeRoleBytes, userWallet.address)).fulfilled;
      const userHasRole = await hasRole(writeRoleBytes, userWallet.address);
      expect(userHasRole).eq(true);

      await expect(addPreviousTokenInfo(userWallet, 0, tokenAddress, 1)).fulfilled;
      const tokenLink = await (getPreviousTokenInfo(0));
      expect(tokenLink.tokenContract).eq(tokenAddress);
      expect(toNumWei(tokenLink.tokenId)).eq(1);
    })
  });
});
