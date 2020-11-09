import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Blockchain } from '../utils/Blockchain';
import { generatedWallets } from '../utils/generatedWallets';
import { MarketFactory } from '../typechain/MarketFactory';
import { Wallet } from 'ethers';
import Decimal from '../utils/Decimal';
import { BigNumber, BigNumberish } from 'ethers';
import { formatUnits } from '@ethersproject/units';
import { AddressZero, MaxUint256 } from '@ethersproject/constants';
import { BaseErc20Factory } from '../typechain/BaseErc20Factory';
import { Market } from '../typechain/Market';

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
  amount: BigNumberish;
  sellOnFee: { value: BigNumberish };
};

type Bid = {
  currency: string;
  amount: BigNumberish;
  bidder: string;
  sellOnFee: { value: BigNumberish };
};

describe('Market', () => {
  let [
    deployerWallet,
    bidderWallet,
    mockTokenWallet,
    otherWallet,
  ] = generatedWallets(provider);

  let defaultBidShares = {
    prevOwner: Decimal.new(10),
    owner: Decimal.new(80),
    creator: Decimal.new(10),
  };

  let defaultTokenId = 1;
  let defaultAsk = {
    amount: 100,
    currency: '0x41A322b28D0fF354040e2CbC676F0320d8c8850d',
    sellOnFee: Decimal.new(0),
  };

  let auctionAddress: string;

  function toNumWei(val: BigNumber) {
    return parseFloat(formatUnits(val, 'wei'));
  }

  function toNumEther(val: BigNumber) {
    return parseFloat(formatUnits(val, 'ether'));
  }

  async function auctionAs(wallet: Wallet) {
    return MarketFactory.connect(auctionAddress, wallet);
  }
  async function deploy() {
    const auction = await (
      await new MarketFactory(deployerWallet).deploy()
    ).deployed();
    auctionAddress = auction.address;
  }
  async function configure() {
    return MarketFactory.connect(auctionAddress, deployerWallet).configure(
      mockTokenWallet.address
    );
  }

  async function readTokenContract() {
    return MarketFactory.connect(
      auctionAddress,
      deployerWallet
    ).tokenContract();
  }

  async function addBidShares(
    auction: Market,
    tokenId: number,
    bidShares?: BidShares
  ) {
    return auction.addBidShares(tokenId, bidShares);
  }

  async function setAsk(auction: Market, tokenId: number, ask?: Ask) {
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

  async function mintCurrency(currency: string, to: string, value: number) {
    await BaseErc20Factory.connect(currency, deployerWallet).mint(to, value);
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
  async function setBid(auction: Market, bid: Bid, tokenId: number) {
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
        MarketFactory.connect(auctionAddress, otherWallet).configure(
          mockTokenWallet.address
        )
      ).eventually.rejectedWith("Market: Only owner");
    });

    it('should be callable by the owner', async () => {
      await expect(configure()).eventually.fulfilled;
      const tokenContractAddress = await readTokenContract();

      expect(tokenContractAddress).eq(mockTokenWallet.address);
    });

    it('should reject if called twice', async () => {
      await configure();

      await expect(configure()).eventually.rejectedWith("Market: Already configured");
    });
  });

  describe('#addBidShares', () => {
    beforeEach(async () => {
      await deploy();
      await configure();
    });

    it('should reject if not called by the token address', async () => {
      const auction = await auctionAs(otherWallet);

      await expect(addBidShares(auction, defaultTokenId, defaultBidShares))
        .rejectedWith("Market: Only token contract");
    });

    it('should set the bid shares if called by the token address', async () => {
      const auction = await auctionAs(mockTokenWallet);

      await expect(addBidShares(auction, defaultTokenId, defaultBidShares))
        .eventually.fulfilled;

      const tokenBidShares = Object.values(
        await auction.bidSharesForToken(defaultTokenId)
      ).map((s) => parseInt(formatUnits(s.value, 'ether')));

      expect(tokenBidShares[0]).eq(
        toNumEther(defaultBidShares.prevOwner.value)
      );
      expect(tokenBidShares[1]).eq(toNumEther(defaultBidShares.creator.value));
      expect(tokenBidShares[2]).eq(toNumEther(defaultBidShares.owner.value));
    });

    it('should reject if the bid shares are invalid', async () => {
      const auction = await auctionAs(mockTokenWallet);
      const invalidBidShares = {
        prevOwner: Decimal.new(0),
        owner: Decimal.new(0),
        creator: Decimal.new(101),
      };

      await expect(addBidShares(auction, defaultTokenId, invalidBidShares))
        .rejectedWith("Market: Invalid bid shares, must sum to 100");
    });
  });

  describe('#setAsk', () => {
    beforeEach(async () => {
      await deploy();
      await configure();
    });

    it('should reject if not called by the token address', async () => {
      const auction = await auctionAs(otherWallet);

      await expect(setAsk(auction, defaultTokenId, defaultAsk)).rejectedWith("Market: Only token contract");
    });

    it('should set the ask if called by the token address', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction, defaultTokenId, defaultBidShares);

      await expect(setAsk(auction, defaultTokenId, defaultAsk)).eventually
        .fulfilled;

      const ask = await auction.currentAskForToken(defaultTokenId);

      expect(toNumWei(ask.amount)).to.eq(defaultAsk.amount);
      expect(ask.currency).to.eq(defaultAsk.currency);
    });

    it('should reject if the ask is too low', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction, defaultTokenId, defaultBidShares);

      await expect(
        setAsk(auction, defaultTokenId, {
          amount: 1,
          currency: AddressZero,
          sellOnFee: Decimal.new(0),
        })
      ).rejectedWith("Market: Ask invalid for share splitting");
    });

    it("should reject if the bid shares haven't been set yet", async () => {
      const auction = await auctionAs(mockTokenWallet);
      await expect(setAsk(auction, defaultTokenId, defaultAsk)).rejectedWith("Market: Invalid bid shares for token");
    });
  });

  describe('#setBid', () => {
    let currency: string;
    const defaultBid = {
      amount: 100,
      currency: currency,
      bidder: bidderWallet.address,
      sellOnFee: Decimal.new(10),
    };

    beforeEach(async () => {
      await deploy();
      await configure();
      currency = await deployCurrency();
      defaultBid.currency = currency;
    });

    it('should revert if not called by the token contract', async () => {
      const auction = await auctionAs(otherWallet);
      await expect(setBid(auction, defaultBid, defaultTokenId)).rejectedWith("Market: Only token contract");
    });

    it('should revert if the bidder does not have a high enough allowance for their bidding currency', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await expect(setBid(auction, defaultBid, defaultTokenId)).rejectedWith("Market: allowance not high enough to transfer token");
    });

    it('should revert if the bidder does not have enough tokens to bid with', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await mintCurrency(currency, defaultBid.bidder, defaultBid.amount - 1);
      await approveCurrency(currency, auction.address, bidderWallet);

      await expect(setBid(auction, defaultBid, defaultTokenId)).rejectedWith("Market: Not enough funds to transfer token");
    });

    it('should accept a valid bid', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction, defaultTokenId, defaultBidShares);
      await mintCurrency(currency, defaultBid.bidder, defaultBid.amount);
      await approveCurrency(currency, auction.address, bidderWallet);

      const beforeBalance = toNumWei(
        await getBalance(currency, defaultBid.bidder)
      );

      await expect(setBid(auction, defaultBid, defaultTokenId)).fulfilled;

      const afterBalance = toNumWei(
        await getBalance(currency, defaultBid.bidder)
      );
      const bid = await auction.bidForTokenBidder(1, bidderWallet.address);
      expect(bid.currency).eq(currency);
      expect(toNumWei(bid.amount)).eq(defaultBid.amount);
      expect(bid.bidder).eq(defaultBid.bidder);
      expect(beforeBalance).eq(afterBalance + defaultBid.amount);
    });

    it('should accept a valid bid larger than the min bid', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction, defaultTokenId, defaultBidShares);

      const largerValidBid = {
        amount: 130000000,
        currency: currency,
        bidder: bidderWallet.address,
        sellOnFee: Decimal.new(10),
      };

      await mintCurrency(
        currency,
        largerValidBid.bidder,
        largerValidBid.amount
      );
      await approveCurrency(currency, auction.address, bidderWallet);

      const beforeBalance = toNumWei(
        await getBalance(currency, defaultBid.bidder)
      );

      await expect(setBid(auction, largerValidBid, defaultTokenId)).fulfilled;

      const afterBalance = toNumWei(
        await getBalance(currency, largerValidBid.bidder)
      );
      const bid = await auction.bidForTokenBidder(1, bidderWallet.address);
      expect(bid.currency).eq(currency);
      expect(toNumWei(bid.amount)).eq(largerValidBid.amount);
      expect(bid.bidder).eq(largerValidBid.bidder);
      expect(beforeBalance).eq(afterBalance + largerValidBid.amount);
    });

    it('should refund the original bid if the bidder bids again', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction, defaultTokenId, defaultBidShares);
      await mintCurrency(currency, defaultBid.bidder, 5000);
      await approveCurrency(currency, auction.address, bidderWallet);

      const bidderBalance = toNumWei(
        await BaseErc20Factory.connect(currency, bidderWallet).balanceOf(
          bidderWallet.address
        )
      );

      await setBid(auction, defaultBid, defaultTokenId);
      await expect(
        setBid(
          auction,
          { ...defaultBid, amount: defaultBid.amount * 2 },
          defaultTokenId
        )
      ).fulfilled;

      const afterBalance = toNumWei(
        await BaseErc20Factory.connect(currency, bidderWallet).balanceOf(
          bidderWallet.address
        )
      );
      await expect(afterBalance).eq(bidderBalance - defaultBid.amount * 2);
    });
  });
});
