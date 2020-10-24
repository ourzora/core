import { generatedWallets } from '../utils/generatedWallets';
import { Blockchain } from '../utils/Blockchain';

import { Invert } from '../typechain/Invert';
import { InvertFactory } from '../typechain/InvertFactory';
import { JsonRpcProvider } from 'ethers/providers';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { Wallet } from 'ethers';
import { BigNumber, bigNumberify, formatUnits, parseUnits } from 'ethers/utils';
import { Ierc20 } from '../typechain/Ierc20';
import { BaseErc20Factory } from '../typechain/BaseErc20Factory';
import { AddressZero } from 'ethers/constants';
import Decimal from '../utils/Decimal';
import Base = Mocha.reporters.Base;

chai.use(asPromised);

let provider = new JsonRpcProvider();
let blockchain = new Blockchain(provider);

describe('Invert', () => {
  let [
    deployerWallet,
    creatorWallet,
    ownerWallet,
    bidderWallet,
    prevOwnerWallet,
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
    uri = 'example.com',
    shares = {
      creator: Decimal.new(5),
      prevOwner: Decimal.new(1),
      owner: Decimal.new(94),
    }
  ) {
    await invert.mint(creator, uri, shares);
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

  describe('#creatorOfToken', () => {
    let invert: Invert;
    beforeEach(async () => {
      await deploy();
      invert = await invertAs(creatorWallet);
      await mint(invert);
      await mint(invert, ownerWallet.address);
    });

    it('returns the creator of a given token', async () => {
      const token1 = await invert.tokenByIndex(0);
      const token2 = await invert.tokenByIndex(1);

      await expect(invert.creatorOfToken(token1)).to.eventually.eq(
        creatorWallet.address
      );
      await expect(invert.creatorOfToken(token2)).to.eventually.eq(
        ownerWallet.address
      );
    });
  });

  describe('#prevOwnerOfToken', () => {
    let invert: Invert;
    beforeEach(async () => {
      await deploy();
      invert = await invertAs(bidderWallet);
      await mint(invert);
      const bidCurrencyAsCreator = await new BaseErc20Factory(
        deployerWallet
      ).deploy('Bid', 'BID', 18);
      await bidCurrencyAsCreator.mint(bidderWallet.address, 1000);
      const bidCurrency = BaseErc20Factory.connect(
        bidCurrencyAsCreator.address,
        bidderWallet
      );
      const tokenId = await invert.tokenByIndex(0);
      await bidCurrency.approve(invert.address, 1000);
      await invert.setBid(tokenId, {
        amount: 100,
        currency: bidCurrency.address,
        currencyDecimals: await bidCurrency.decimals(),
        bidder: bidderWallet.address,
      });

      await (await invertAs(creatorWallet)).acceptBid(
        tokenId,
        bidderWallet.address
      );
    });

    it('returns the previous owner of a given token', async () => {
      const token1 = await invert.tokenByIndex(0);
      await expect(invert.prevOwnerOfToken(token1)).to.eventually.eq(
        creatorWallet.address
      );
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

    it('should revert if the bid shares sum to less than 100', async () => {
      const invert = await invertAs(creatorWallet);

      const invalidShares = {
        creator: Decimal.new(1),
        owner: Decimal.new(1),
        prevOwner: Decimal.new(1),
      };
      await expect(
        mint(invert, undefined, undefined, invalidShares)
      ).eventually.rejectedWith(
        revert('Invert: Invalid bid shares, must sum to 100')
      );
    });

    it('should revert if the bid shares sum to more than 100', async () => {
      const invert = await invertAs(creatorWallet);

      const invalidShares = {
        creator: Decimal.new(50),
        owner: Decimal.new(50),
        prevOwner: Decimal.new(50),
      };
      await expect(
        mint(invert, undefined, undefined, invalidShares)
      ).eventually.rejectedWith(
        revert('Invert: Invalid bid shares, must sum to 100')
      );
    });

    it('should allow bid shares to be decimal values', async () => {
      const invert = await invertAs(creatorWallet);

      const invalidShares = {
        creator: Decimal.new(3.5),
        owner: Decimal.new(3.5),
        prevOwner: Decimal.new(93),
      };
      await expect(mint(invert, undefined, undefined, invalidShares)).eventually
        .fulfilled;
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
      await bidCurrencyAsCreator.mint(bidderWallet.address, 1000);
      const otherCurrencyAsCreator = await new BaseErc20Factory(
        deployerWallet
      ).deploy('Other', 'OTHER', 18);
      await otherCurrencyAsCreator.mint(bidderWallet.address, 1000);

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
        invert.setBid(bidTokenId, {
          amount: 1,
          bidder: bidderWallet.address,
          currency: bidCurrency.address,
          currencyDecimals: await bidCurrency.decimals(),
        })
      ).eventually.rejectedWith(
        revert('Invert: allowance not high enough to transfer token.')
      );
    });

    it('should not be able to place a bid on a nonexistent token', async () => {
      const invert = await invertAs(bidderWallet);

      await bidCurrency.approve(invert.address, 100);

      await expect(
        invert.setBid(111111, {
          amount: 100,
          bidder: bidderWallet.address,
          currency: bidCurrency.address,
          currencyDecimals: await bidCurrency.decimals(),
        })
      ).eventually.rejectedWith(revert('Invert: Nonexistant token'));
    });

    it("should not be able to place a bid if the bidder doesn't have enough funds", async () => {
      const invert = await invertAs(bidderWallet);
      const bidTokenId = await invert.tokenByIndex(0);
      await bidCurrency.approve(invert.address, 1111);

      await expect(
        invert.setBid(bidTokenId, {
          amount: 1111,
          bidder: bidderWallet.address,
          currency: bidCurrency.address,
          currencyDecimals: await bidCurrency.decimals(),
        })
      ).eventually.rejectedWith(
        revert('Invert: Not enough funds to transfer token.')
      );
    });

    it('should not be able to place a bid if the size is too small', async () => {
      const invert = await invertAs(bidderWallet);
      const bidTokenId = await invert.tokenByIndex(0);
      await bidCurrency.approve(invert.address, 1);

      await expect(
        invert.setBid(bidTokenId, {
          amount: 1,
          bidder: bidderWallet.address,
          currency: bidCurrency.address,
          currencyDecimals: await bidCurrency.decimals(),
        })
      ).eventually.rejectedWith(
        revert('Invert: Bid too small for share splitting')
      );
    });

    it('should be able to place a bid', async () => {
      const invert = await invertAs(bidderWallet);
      const bidTokenId = await invert.tokenByIndex(0);
      await bidCurrency.approve(invert.address, 100);

      const beforeInvertBalance = toNum(
        await bidCurrency.balanceOf(invert.address)
      );
      const beforeBidderBalance = toNum(
        await bidCurrency.balanceOf(bidderWallet.address)
      );
      await invert.setBid(bidTokenId, {
        amount: 100,
        bidder: bidderWallet.address,
        currency: bidCurrency.address,
        currencyDecimals: await bidCurrency.decimals(),
      });
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
      expect(toNum(bid.amount)).to.eq(100);
      expect(afterInvertBalance).to.eq(beforeInvertBalance + 100);
      expect(afterBidderBalance).to.eq(beforeBidderBalance - 100);
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
      await otherCurrency.approve(invert.address, 100);
      await bidCurrency.approve(invert.address, 101);

      await invert.setBid(bidTokenId, {
        amount: 100,
        bidder: bidderWallet.address,
        currency: otherCurrency.address,
        currencyDecimals: await otherCurrency.decimals(),
      });
      await invert.setBid(bidTokenId, {
        amount: 101,
        bidder: bidderWallet.address,
        currency: bidCurrency.address,
        currencyDecimals: await bidCurrency.decimals(),
      });

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
      expect(afterInvertCurrencyBalance).to.eq(
        beforeInvertCurrencyBalance + 101
      );
      expect(afterInvertOtherBalance).to.eq(beforeInvertOtherBalance);
      expect(afterBidderCurrencyBalance).to.eq(
        beforeBidderCurrencyBalance - 101
      );
      expect(afterBidderOtherBalance).to.eq(beforeBidderOtherBalance);
    });
  });

  describe('#removeBid', () => {
    let bidCurrency: Ierc20;
    let otherCurrency: Ierc20;

    beforeEach(async () => {
      await deploy();
      const invertAsCreator = await invertAs(creatorWallet);
      await mint(invertAsCreator);
      await mint(invertAsCreator);

      const bidCurrencyAsCreator = await new BaseErc20Factory(
        deployerWallet
      ).deploy('Bid', 'BID', 18);
      await bidCurrencyAsCreator.mint(bidderWallet.address, 1000);
      const otherCurrencyAsCreator = await new BaseErc20Factory(
        deployerWallet
      ).deploy('Other', 'OTHER', 18);
      await otherCurrencyAsCreator.mint(bidderWallet.address, 1000);

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
      await bidCurrency.approve(invert.address, 100);
      await invert.setBid(bidTokenId, {
        amount: 100,
        bidder: bidderWallet.address,
        currency: bidCurrency.address,
        currencyDecimals: await bidCurrency.decimals(),
      });

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

      expect(afterBidderBalance).to.eq(beforeBidderBalance + 100);
      expect(afterInvertBalance).to.eq(beforeInvertBalance - 100);
      expect(toNum(bid.amount)).to.eq(0);
    });

    it('should revert if the bid does not exist', async () => {
      const invert = await invertAs(bidderWallet);
      const bidTokenId = await invert.tokenByIndex(0);

      await expect(invert.removeBid(bidTokenId)).eventually.rejectedWith(
        revert('Invert: cannot remove bid amount of 0')
      );
    });
  });

  describe('#acceptBid', () => {
    let bidCurrency: Ierc20;
    beforeEach(async () => {
      await deploy();
      const invertAsCreator = await invertAs(creatorWallet);
      await mint(invertAsCreator);
      const bidCurrencyAsCreator = await new BaseErc20Factory(
        deployerWallet
      ).deploy('Bid', 'BID', 18);
      bidCurrency = BaseErc20Factory.connect(
        bidCurrencyAsCreator.address,
        bidderWallet
      );
      await bidCurrencyAsCreator.mint(bidderWallet.address, 1000);
      await bidCurrencyAsCreator.mint(prevOwnerWallet.address, 1000);
      await bidCurrencyAsCreator.mint(ownerWallet.address, 1000);
      await BaseErc20Factory.connect(
        bidCurrencyAsCreator.address,
        bidderWallet
      ).approve(invertAsCreator.address, 1000);
      await BaseErc20Factory.connect(
        bidCurrencyAsCreator.address,
        ownerWallet
      ).approve(invertAsCreator.address, 1000);
      await BaseErc20Factory.connect(
        bidCurrencyAsCreator.address,
        prevOwnerWallet
      ).approve(invertAsCreator.address, 1000);
      const invertAsBidder = await invertAs(bidderWallet);
      const tokenId = await invertAsBidder.tokenByIndex(0);
      await invertAsBidder.setBid(tokenId, {
        amount: 100,
        bidder: bidderWallet.address,
        currency: bidCurrencyAsCreator.address,
        currencyDecimals: await bidCurrencyAsCreator.decimals(),
      });
      const invertAsPrevOwner = await invertAs(prevOwnerWallet);
      await invertAsPrevOwner.setBid(tokenId, {
        amount: 100,
        bidder: bidderWallet.address,
        currency: bidCurrencyAsCreator.address,
        currencyDecimals: await bidCurrencyAsCreator.decimals(),
      });
      const invertAsOwner = await invertAs(ownerWallet);
      await invertAsOwner.setBid(tokenId, {
        amount: 100,
        bidder: bidderWallet.address,
        currency: bidCurrencyAsCreator.address,
        currencyDecimals: await bidCurrencyAsCreator.decimals(),
      });

      await invertAsCreator.acceptBid(tokenId, prevOwnerWallet.address);
      await invertAsPrevOwner.acceptBid(tokenId, ownerWallet.address);
    });

    it('should not revert if called by an owner', async () => {
      const invert = await invertAs(ownerWallet);
      const tokenId = await invert.tokenByIndex(0);

      await expect(invert.acceptBid(tokenId, bidderWallet.address)).eventually
        .be.fulfilled;
    });

    it('should revert if not called by an owner', async () => {
      const invert = await invertAs(bidderWallet);
      const tokenId = await invert.tokenByIndex(0);

      await expect(
        invert.acceptBid(tokenId, bidderWallet.address)
      ).eventually.rejectedWith(revert('Invert: Only approved or owner'));
    });

    it('should pay the first owner/creator the amount of the accepted bid and transfer the nft ownership', async () => {
      const invert = await invertAs(ownerWallet);
      const tokenId = await invert.tokenByIndex(0);

      const beforeOwner = await invert.ownerOf(tokenId);
      const beforeOwnerBalance = await bidCurrency.balanceOf(
        ownerWallet.address
      );
      const beforeInvertBalance = await bidCurrency.balanceOf(invert.address);
      await invert.acceptBid(tokenId, bidderWallet.address);
      const afterOwner = await invert.ownerOf(tokenId);
      const afterOwnerBalance = await bidCurrency.balanceOf(
        ownerWallet.address
      );
      const afterInvertBalance = await bidCurrency.balanceOf(invert.address);

      expect(beforeOwner).not.to.eq(afterOwner);
      expect(afterOwner).to.eq(bidderWallet.address);
      expect(toNum(afterOwnerBalance)).to.eq(toNum(beforeOwnerBalance) + 94);
      expect(toNum(afterInvertBalance)).to.eq(toNum(beforeInvertBalance) - 100);
    });

    it('should split the fees between owner, creator, and previous owner', async () => {
      const invert = await invertAs(ownerWallet);
      const tokenId = await invert.tokenByIndex(0);

      const beforeOwnerBalance = await bidCurrency.balanceOf(
        ownerWallet.address
      );
      const beforeCreatorBalance = await bidCurrency.balanceOf(
        creatorWallet.address
      );
      const beforePrevOwnerBalance = await bidCurrency.balanceOf(
        prevOwnerWallet.address
      );
      const beforeInvertBalance = await bidCurrency.balanceOf(invert.address);
      await invert.acceptBid(tokenId, bidderWallet.address);
      const afterCreatorBalance = await bidCurrency.balanceOf(
        creatorWallet.address
      );
      const afterPrevOwnerBalance = await bidCurrency.balanceOf(
        prevOwnerWallet.address
      );
      const afterOwnerBalance = await bidCurrency.balanceOf(
        ownerWallet.address
      );
      const afterInvertBalance = await bidCurrency.balanceOf(invert.address);

      expect(toNum(afterOwnerBalance)).to.eq(toNum(beforeOwnerBalance) + 94);
      expect(toNum(afterCreatorBalance)).to.eq(toNum(beforeCreatorBalance) + 5);
      expect(toNum(afterPrevOwnerBalance)).to.eq(
        toNum(beforePrevOwnerBalance) + 1
      );
      expect(toNum(afterInvertBalance)).to.eq(toNum(beforeInvertBalance) - 100);
    });

    it('should remove the accepted bid', async () => {
      const invert = await invertAs(ownerWallet);
      const tokenId = await invert.tokenByIndex(0);
      await invert.acceptBid(tokenId, bidderWallet.address);

      const bid = await invert.bidForTokenBidder(tokenId, bidderWallet.address);
      expect(toNum(bid.amount)).to.eq(0);
      expect(bid.currency).to.eq(AddressZero);
      expect(bid.bidder).to.eq(AddressZero);
    });
  });

  describe('#minBidForCurrencyDecimals', () => {
    beforeEach(async () => {
      await deploy();
    });

    it('should return a correct min bid of 100 for fees with no decimal places', async () => {
      const invert = await invertAs(creatorWallet);
      await mint(invert, undefined, undefined, {
        owner: Decimal.new(1),
        creator: Decimal.new(98),
        prevOwner: Decimal.new(1),
      });
      const tokenId = await invert.tokenByIndex(0);
      const min = toNum(await invert.minBidForToken(tokenId));

      await expect(min).to.eq(100);
    });

    it('should return a correct min bid of 1000 for fees with 1 decimal place', async () => {
      const invert = await invertAs(creatorWallet);
      await mint(invert, undefined, undefined, {
        owner: Decimal.new(1.1),
        creator: Decimal.new(97.8),
        prevOwner: Decimal.new(1.1),
      });
      const tokenId = await invert.tokenByIndex(0);
      const min = toNum(await invert.minBidForToken(tokenId));

      await expect(min).to.eq(1000);
    });
  });
});
