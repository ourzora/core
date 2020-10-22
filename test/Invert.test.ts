import { generatedWallets } from '../utils/generatedWallets';
import { Blockchain } from '../utils/Blockchain';

import { Invert } from '../typechain/Invert';
import { InvertFactory } from '../typechain/InvertFactory';
import { JsonRpcProvider } from 'ethers/providers';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { Wallet } from 'ethers';
import { create } from 'domain';
import { BigNumber, bigNumberify, formatUnits } from 'ethers/utils';

chai.use(asPromised);

let provider = new JsonRpcProvider();
let blockchain = new Blockchain(provider);

describe('Invert', () => {
  let [
    deployerWallet,
    creatorWallet,
    ownerWallet,
    bidderWallet,
    otherWallet,
  ] = generatedWallets(provider);
  let invertAddress: string;

  beforeEach(async () => {
    await blockchain.resetAsync();
  });

  function toNum(val: BigNumber) {
    return parseFloat(formatUnits(val, 'wei'));
  }

  async function deploy() {
    const invert = await (
      await new InvertFactory(deployerWallet).deploy()
    ).deployed();
    invertAddress = invert.address;
  }

  async function invertAs(wallet: Wallet) {
    return InvertFactory.connect(invertAddress, wallet);
  }

  describe('#constructor', () => {
    it('should be able to deploy', async () => {
      await expect(
        (await new InvertFactory(deployerWallet).deploy()).deployed()
      ).to.eventually.be.not.null;
    });

    it('should have a name of Invert', async () => {
      await deploy();
      const invert = await invertAs(deployerWallet);

      await expect(invert.name()).to.eventually.eq('Invert');
    });

    it('should have a symbol of INVERT', async () => {
      await deploy();
      const invert = await invertAs(deployerWallet);

      await expect(invert.symbol()).to.eventually.eq('INVERT');
    });

    it('should not have a base URI', async () => {
      await deploy();
      const invert = await invertAs(deployerWallet);

      await expect(invert.baseURI()).to.eventually.eq('');
    });
  });

  describe('#mint', () => {
    beforeEach(async () => {
      await deploy();
    });

    it('should be able to mint a new token', async () => {
      const invert = await invertAs(creatorWallet);
      const beforeSupply = toNum(await invert.totalSupply());

      await invert.mint(creatorWallet.address, 'www.google.com');

      const afterSupply = toNum(await invert.totalSupply());
      const balance = toNum(await invert.balanceOf(creatorWallet.address));
      const tokenId = await invert.tokenByIndex(0);

      expect(afterSupply).to.eq(beforeSupply + 1);
      expect(balance).to.eq(1);
      await expect(invert.tokenURI(tokenId)).to.eventually.eq('www.google.com');
    });

    it("should add the token to the creator's tokens", async () => {
      const invert = await invertAs(creatorWallet);

      await invert.mint(creatorWallet.address, 'www.google.com');

      const tokenId = await invert.tokenByIndex(0);
      const creatorsTokenId = await invert.tokenOfCreatorByIndex(
        creatorWallet.address,
        0
      );

      expect(toNum(tokenId)).to.eq(toNum(creatorsTokenId));
    });
  });
});
