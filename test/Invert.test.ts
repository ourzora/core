import { generatedWallets } from '../utils/generatedWallets';
import { Blockchain } from '../utils/Blockchain';

import { Invert } from '../typechain/Invert';
import { InvertFactory } from '../typechain/InvertFactory';
import { JsonRpcProvider } from 'ethers/providers';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { Wallet } from 'ethers';
import { BigNumber, formatUnits } from 'ethers/utils';
import { Ierc20 } from '../typechain/Ierc20';
import { BaseErc20Factory } from '../typechain/BaseErc20Factory';

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

  function revert(message: string) {
    return `VM Exception while processing transaction: revert ${message}`;
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

  async function mint(
    invert: Invert,
    creator = creatorWallet.address,
    uri = 'example.com'
  ) {
    await invert.mint(creator, uri);
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

      await mint(invert);

      const afterSupply = toNum(await invert.totalSupply());
      const balance = toNum(await invert.balanceOf(creatorWallet.address));
      const tokenId = await invert.tokenByIndex(0);

      expect(afterSupply).to.eq(beforeSupply + 1);
      expect(balance).to.eq(1);
      await expect(invert.tokenURI(tokenId)).to.eventually.eq('example.com');
    });

    it("should add the token to the creator's tokens", async () => {
      const invert = await invertAs(creatorWallet);
      await mint(invert);

      const tokenId = await invert.tokenByIndex(0);
      const creatorsTokenId = await invert.tokenOfCreatorByIndex(
        creatorWallet.address,
        0
      );

      expect(toNum(tokenId)).to.eq(toNum(creatorsTokenId));
    });
  });

  describe('#setBid', () => {
    let invert: Invert;
    let bidCurrency: Ierc20;
    let otherCurrency: Ierc20;
    let bidTokenId: number;
    let otherTokenId: number;

    beforeEach(async () => {
      await deploy();
      const invertAsCreator = await invertAs(creatorWallet);
      await mint(invertAsCreator);
      await mint(invertAsCreator);

      const bidCurrencyAsCreator = await new BaseErc20Factory(
        deployerWallet
      ).deploy('Bid', 'BID', 18);
      await bidCurrencyAsCreator.mint(bidderWallet.address, 100);
      const otherCurrencyAsCreator = await new BaseErc20Factory(
        deployerWallet
      ).deploy('Other', 'OTHER', 18);
      await otherCurrencyAsCreator.mint(bidderWallet.address, 100);

      bidCurrency = BaseErc20Factory.connect(
        bidCurrencyAsCreator.address,
        bidderWallet
      );
      otherCurrency = BaseErc20Factory.connect(
        otherCurrencyAsCreator.address,
        bidderWallet
      );
    });

    it('should not be able to place a bid without approval', async () => {
      const invert = await invertAs(bidderWallet);
      const bidTokenId = await invert.tokenByIndex(0);

      await expect(
        invert.setBid(bidTokenId, 1, bidCurrency.address)
      ).eventually.rejectedWith(
        revert('Invert: allowance not high enough to transfer token.')
      );
    });

    it('should not be able to place a bid on a nonexistent token', async () => {
      const invert = await invertAs(bidderWallet);

      await bidCurrency.approve(invert.address, 1);

      await expect(
        invert.setBid(111111, 1, bidCurrency.address)
      ).eventually.rejectedWith(revert('Invert: bid on nonexistant token'));
    });

    it("should not be able to place a bid if the bidder doesn't have enough funds", async () => {
      const invert = await invertAs(bidderWallet);
      const bidTokenId = await invert.tokenByIndex(0);
      await bidCurrency.approve(invert.address, 1111);

      await expect(
        invert.setBid(bidTokenId, 1111, bidCurrency.address)
      ).eventually.rejectedWith(
        revert('Invert: Not enough funds to transfer token.')
      );
    });

    it('should be able to place a bid', async () => {
      const invert = await invertAs(bidderWallet);
      const bidTokenId = await invert.tokenByIndex(0);
      await bidCurrency.approve(invert.address, 1);

      const beforeInvertBalance = toNum(
        await bidCurrency.balanceOf(invert.address)
      );
      const beforeBidderBalance = toNum(
        await bidCurrency.balanceOf(bidderWallet.address)
      );
      await invert.setBid(bidTokenId, 1, bidCurrency.address);
      const afterBidderBalance = toNum(
        await bidCurrency.balanceOf(bidderWallet.address)
      );
      const afterInvertBalance = toNum(
        await bidCurrency.balanceOf(invert.address)
      );

      const bid = await invert.bidForTokenBidder(
        bidTokenId,
        bidderWallet.address
      );

      expect(bid.currency).to.eq(bidCurrency.address);
      expect(bid.bidder).to.eq(bidderWallet.address);
      expect(toNum(bid.amount)).to.eq(1);
      expect(afterInvertBalance).to.eq(beforeInvertBalance + 1);
      expect(afterBidderBalance).to.eq(beforeBidderBalance - 1);
    });

    it('should refund previous bids when replacing a bid', async () => {
      const invert = await invertAs(bidderWallet);
      const beforeInvertCurrencyBalance = toNum(
        await bidCurrency.balanceOf(invert.address)
      );
      const beforeBidderCurrencyBalance = toNum(
        await bidCurrency.balanceOf(bidderWallet.address)
      );
      const beforeInvertOtherBalance = toNum(
        await otherCurrency.balanceOf(invert.address)
      );
      const beforeBidderOtherBalance = toNum(
        await otherCurrency.balanceOf(bidderWallet.address)
      );
      const bidTokenId = await invert.tokenByIndex(0);
      await otherCurrency.approve(invert.address, 1);
      await bidCurrency.approve(invert.address, 4);

      await invert.setBid(bidTokenId, 1, otherCurrency.address);
      await invert.setBid(bidTokenId, 4, bidCurrency.address);

      const afterInvertCurrencyBalance = toNum(
        await bidCurrency.balanceOf(invert.address)
      );
      const afterBidderCurrencyBalance = toNum(
        await bidCurrency.balanceOf(bidderWallet.address)
      );
      const afterInvertOtherBalance = toNum(
        await otherCurrency.balanceOf(invert.address)
      );
      const afterBidderOtherBalance = toNum(
        await otherCurrency.balanceOf(bidderWallet.address)
      );

      const bid = await invert.bidForTokenBidder(
        bidTokenId,
        bidderWallet.address
      );

      expect(bid.currency).to.eq(bidCurrency.address);
      expect(afterInvertCurrencyBalance).to.eq(beforeInvertCurrencyBalance + 4);
      expect(afterInvertOtherBalance).to.eq(beforeInvertOtherBalance);
      expect(afterBidderCurrencyBalance).to.eq(beforeBidderCurrencyBalance - 4);
      expect(afterBidderOtherBalance).to.eq(beforeBidderOtherBalance);
    });
  });

  describe('#removeBid', () => {
    let invert: Invert;
    let bidCurrency: Ierc20;
    let otherCurrency: Ierc20;
    let bidTokenId: number;
    let otherTokenId: number;

    beforeEach(async () => {
      await deploy();
      const invertAsCreator = await invertAs(creatorWallet);
      await mint(invertAsCreator);
      await mint(invertAsCreator);

      const bidCurrencyAsCreator = await new BaseErc20Factory(
        deployerWallet
      ).deploy('Bid', 'BID', 18);
      await bidCurrencyAsCreator.mint(bidderWallet.address, 100);
      const otherCurrencyAsCreator = await new BaseErc20Factory(
        deployerWallet
      ).deploy('Other', 'OTHER', 18);
      await otherCurrencyAsCreator.mint(bidderWallet.address, 100);

      bidCurrency = BaseErc20Factory.connect(
        bidCurrencyAsCreator.address,
        bidderWallet
      );
      otherCurrency = BaseErc20Factory.connect(
        otherCurrencyAsCreator.address,
        bidderWallet
      );
    });

    it('should be able to remove/refund a bid', async () => {
      const invert = await invertAs(bidderWallet);
      const bidTokenId = await invert.tokenByIndex(0);
      await bidCurrency.approve(invert.address, 1);
      await invert.setBid(bidTokenId, 1, bidCurrency.address);

      const beforeInvertBalance = toNum(
        await bidCurrency.balanceOf(invert.address)
      );
      const beforeBidderBalance = toNum(
        await bidCurrency.balanceOf(bidderWallet.address)
      );
      await invert.removeBid(bidTokenId);
      const afterBidderBalance = toNum(
        await bidCurrency.balanceOf(bidderWallet.address)
      );
      const afterInvertBalance = toNum(
        await bidCurrency.balanceOf(invert.address)
      );

      const bid = await invert.bidForTokenBidder(
        bidTokenId,
        bidderWallet.address
      );

      expect(afterBidderBalance).to.eq(beforeBidderBalance + 1);
      expect(afterInvertBalance).to.eq(beforeInvertBalance - 1);
      expect(toNum(bid.amount)).to.eq(0);
    });

    it('should revert if the bid does not exist', async () => {
      const invert = await invertAs(bidderWallet);
      const bidTokenId = await invert.tokenByIndex(0);
      await bidCurrency.approve(invert.address, 1);

      await expect(invert.removeBid(bidTokenId)).eventually.rejectedWith(
        revert('Invert: cannot remove bid amount of 0')
      );
    });
  });
});
