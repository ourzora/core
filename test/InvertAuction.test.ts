import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { JsonRpcProvider } from 'ethers/providers';
import { Blockchain } from '../utils/Blockchain';
import { generatedWallets } from '../utils/generatedWallets';
import { InvertAuctionFactory } from '../typechain/InvertAuctionFactory';
import { Wallet } from 'ethers';
import Decimal from '../utils/Decimal';
import { BigNumber, BigNumberish, formatUnits } from 'ethers/utils';
import { AddressZero, MaxUint256 } from 'ethers/constants';
import { BaseErc20Factory } from '../typechain/BaseErc20Factory';
import { InvertAuction } from '../typechain/InvertAuction';

chai.use(asPromised);

let provider = new JsonRpcProvider();
let blockchain = new Blockchain(provider);

type DecimalValue = { value: BigNumber };
type BidShares = {
  owner: DecimalValue;
  prevOwner: DecimalValue;
  creator: DecimalValue;
};
type Ask = {
  currency: string;
  currencyDecimals: BigNumberish;
  amount: BigNumberish;
};
type Bid = {
  currency: string;
  currencyDecimals: BigNumberish;
  amount: BigNumberish;
  bidder: string;
};

describe('InvertAuction', () => {
  let [
    deployerWallet,
    bidderWallet,
    mockTokenWallet,
    otherWallet,
  ] = generatedWallets(provider);
  let auctionAddress: string;

  function revert(message: string) {
    return `VM Exception while processing transaction: revert ${message}`;
  }
  function toNum(val: BigNumber) {
    return parseFloat(formatUnits(val, 'wei'));
  }

  async function auctionAs(wallet: Wallet) {
    return InvertAuctionFactory.connect(auctionAddress, wallet);
  }
  async function deploy() {
    const auction = await (
      await new InvertAuctionFactory(deployerWallet).deploy()
    ).deployed();
    auctionAddress = auction.address;
  }
  async function configure() {
    return InvertAuctionFactory.connect(
      auctionAddress,
      deployerWallet
    ).configure(mockTokenWallet.address);
  }
  async function addBidShares(
    auction: InvertAuction,
    tokenId = 1,
    bidShares?: BidShares
  ) {
    const defaultBidShares = {
      prevOwner: Decimal.new(10),
      owner: Decimal.new(80),
      creator: Decimal.new(10),
    };
    bidShares = bidShares || defaultBidShares;

    return auction.addBidShares(tokenId, bidShares);
  }
  async function setAsk(auction: InvertAuction, tokenId = 1, ask?: Ask) {
    const defaultAsk = {
      amount: 100,
      currency: AddressZero,
      currencyDecimals: 18,
    };
    ask = ask || defaultAsk;
    return auction.setAsk(tokenId, ask);
  }
  async function deployCurrency() {
    const currency = await new BaseErc20Factory(deployerWallet).deploy(
      'test',
      'TEST',
      18
    );
    return currency.address;
  }
  async function mintCurrency(currency: string, to: string) {
    await BaseErc20Factory.connect(currency, deployerWallet).mint(to, 1000);
  }
  async function approveCurrency(
    currency: string,
    spender: string,
    owner: Wallet
  ) {
    await BaseErc20Factory.connect(currency, owner).approve(
      spender,
      MaxUint256
    );
  }
  async function getBalance(currency: string, owner: string) {
    return BaseErc20Factory.connect(currency, deployerWallet).balanceOf(owner);
  }
  async function setBid(auction: InvertAuction, bid: Bid, tokenId = 1) {
    await auction.setBid(tokenId, bid);
  }

  beforeEach(async () => {
    await blockchain.resetAsync();
  });

  describe('#constructor', () => {
    it('should be able to deploy', async () => {
      await expect(deploy()).eventually.fulfilled;
    });
  });

  describe('#configure', () => {
    beforeEach(async () => {
      await deploy();
    });
    it('should revert if not called by the owner', async () => {
      await expect(
        InvertAuctionFactory.connect(auctionAddress, otherWallet).configure(
          mockTokenWallet.address
        )
      ).eventually.rejectedWith(revert('InvertAuction: Only owner'));
    });
    it('should be callable by the owner', async () => {
      await expect(configure()).eventually.fulfilled;
    });
    it('should reject if called twice', async () => {
      await configure();

      await expect(configure()).eventually.rejectedWith(
        revert('InvertAuction: Already configured')
      );
    });
  });

  describe('#addBidShares', () => {
    beforeEach(async () => {
      await deploy();
      await configure();
    });

    it('should reject if not called by the token address', async () => {
      const auction = await auctionAs(otherWallet);

      await expect(addBidShares(auction)).rejectedWith(
        revert('InvertAuction: Only token contract')
      );
    });

    it('should set the bid shares if called by the token address', async () => {
      const auction = await auctionAs(mockTokenWallet);

      await expect(addBidShares(auction)).eventually.fulfilled;
      const bidShares = Object.values(
        await auction.bidSharesForToken(1)
      ).map((s) => parseInt(formatUnits(s.value, 'ether')));

      expect(bidShares[0]).eq(10);
      expect(bidShares[1]).eq(10);
      expect(bidShares[2]).eq(80);
    });

    it('should reject if the bid shares are invalid', async () => {
      const auction = await auctionAs(mockTokenWallet);

      await expect(
        addBidShares(auction, 1, {
          prevOwner: Decimal.new(0),
          owner: Decimal.new(0),
          creator: Decimal.new(101),
        })
      ).rejectedWith(
        revert('InvertAuction: Invalid bid shares, must sum to 100')
      );
    });
  });

  describe('#setAsk', () => {
    beforeEach(async () => {
      await deploy();
      await configure();
    });

    it('should reject if not called by the token address', async () => {
      const auction = await auctionAs(otherWallet);

      await expect(setAsk(auction)).rejectedWith(
        revert('InvertAuction: Only token contract')
      );
    });

    it('should set the ask if called by the token address', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction);

      await expect(setAsk(auction)).eventually.fulfilled;

      const ask = await auction.currentAskForToken(1);

      expect(toNum(ask.amount)).to.eq(100);
      expect(toNum(ask.currencyDecimals)).to.eq(18);
      expect(ask.currency).to.eq(AddressZero);
    });

    it('should reject if the ask is too low', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction);
      await expect(
        setAsk(auction, 1, {
          amount: 1,
          currency: AddressZero,
          currencyDecimals: 18,
        })
      ).rejectedWith(
        revert('InvertAuction: Ask too small for share splitting')
      );
    });

    it("should reject if the bid shares haven't been set yet", async () => {
      const auction = await auctionAs(mockTokenWallet);
      await expect(setAsk(auction)).rejectedWith(
        revert('InvertAuction: Invalid bid shares for token')
      );
    });
  });

  describe('#setBid', () => {
    let currency: string;
    const defaultBid = {
      amount: 100,
      currency: currency,
      currencyDecimals: 18,
      bidder: bidderWallet.address,
    };

    beforeEach(async () => {
      await deploy();
      await configure();
      currency = await deployCurrency();
      defaultBid.currency = currency;
    });

    it('should revert if not called by the token contract', async () => {
      const auction = await auctionAs(otherWallet);
      await expect(setBid(auction, defaultBid)).rejectedWith(
        revert('InvertAuction: Only token contract')
      );
    });
    it('should revert if the bidder does not have a high enough allowance for their bidding currency', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await expect(setBid(auction, defaultBid)).rejectedWith(
        revert('InvertAuction: allowance not high enough to transfer token.')
      );
    });
    it('should revert if the bidder does not have enough tokens to bid with', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await mintCurrency(currency, defaultBid.bidder);

      await expect(setBid(auction, defaultBid)).rejectedWith(
        revert('InvertAuction: allowance not high enough to transfer token.')
      );
    });
    it('should revert if the bid does not have bid shares set yet', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await mintCurrency(currency, defaultBid.bidder);
      await approveCurrency(currency, auction.address, bidderWallet);
      await expect(setBid(auction, defaultBid)).rejectedWith(
        revert('InvertAuction: Invalid bid shares for token')
      );
    });

    it('should revert if the bid is not valid', async () => {
      const invalidBid = { ...defaultBid, amount: 101 };
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction);
      await mintCurrency(currency, defaultBid.bidder);
      await approveCurrency(currency, auction.address, bidderWallet);
      await expect(setBid(auction, invalidBid)).rejectedWith(
        'InvertAuction: Bid invalid for share splitting'
      );
    });

    it('should accept a valid bid', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction);
      await mintCurrency(currency, defaultBid.bidder);
      await approveCurrency(currency, auction.address, bidderWallet);

      const beforeBalance = toNum(
        await getBalance(currency, defaultBid.bidder)
      );

      await expect(setBid(auction, defaultBid)).fulfilled;

      const afterBalance = toNum(await getBalance(currency, defaultBid.bidder));
      const bid = await auction.bidForTokenBidder(1, bidderWallet.address);
      expect(bid.currency).eq(currency);
      expect(toNum(bid.amount)).eq(defaultBid.amount);
      expect(bid.bidder).eq(defaultBid.bidder);
      expect(beforeBalance).eq(afterBalance + defaultBid.amount);
    });

    it('should refund the original bid if the bidder bids again', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction);
      await mintCurrency(currency, defaultBid.bidder);
      await approveCurrency(currency, auction.address, bidderWallet);

      const bidderBalance = toNum(
        await BaseErc20Factory.connect(currency, bidderWallet).balanceOf(
          bidderWallet.address
        )
      );

      await setBid(auction, defaultBid);
      await expect(
        setBid(auction, { ...defaultBid, amount: defaultBid.amount * 2 })
      ).fulfilled;

      const afterBalance = toNum(
        await BaseErc20Factory.connect(currency, bidderWallet).balanceOf(
          bidderWallet.address
        )
      );
      await expect(afterBalance).eq(bidderBalance - defaultBid.amount * 2);
    });
  });
});
