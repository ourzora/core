import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Blockchain } from '../utils/Blockchain';
import { generatedWallets } from '../utils/generatedWallets';
import { InvertAuctionFactory } from '../typechain/InvertAuctionFactory';
import { Wallet } from 'ethers';
import Decimal from '../utils/Decimal';
import { BigNumber, BigNumberish } from 'ethers';
import { formatUnits } from '@ethersproject/units';
import { AddressZero, MaxUint256 } from '@ethersproject/constants';
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
  amount: BigNumberish;
};

type Bid = {
  currency: string;
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

  let defaultBidShares = {
    prevOwner: Decimal.new(10),
    owner: Decimal.new(80),
    creator: Decimal.new(10),
  };

  let defaultTokenId = 1;
  let defaultAsk = {
    amount: 100,
    currency: '0x41A322b28D0fF354040e2CbC676F0320d8c8850d',
  };

  let auctionAddress: string;

  function revert(message: string) {
    return `VM Exception while processing transaction: revert ${message}`;
  }
  function toNumWei(val: BigNumber) {
    return parseFloat(formatUnits(val, 'wei'));
  }

  function toNumEther(val: BigNumber) {
    return parseFloat(formatUnits(val, 'ether'));
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

  async function readTokenContract() {
    return InvertAuctionFactory.connect(
      auctionAddress,
      deployerWallet
    ).tokenContract();
  }

  async function addBidShares(
    auction: InvertAuction,
    tokenId: number,
    bidShares?: BidShares
  ) {
    return auction.addBidShares(tokenId, bidShares);
  }

  async function setAsk(auction: InvertAuction, tokenId: number, ask?: Ask) {
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
  async function setBid(auction: InvertAuction, bid: Bid, tokenId: number) {
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
        InvertAuctionFactory.connect(auctionAddress, otherWallet)
          .configure(
            mockTokenWallet.address
          )
      ).eventually.rejectedWith(revert('InvertAuction: Only owner'));
    });

    it('should be callable by the owner', async () => {
      await expect(configure()).eventually.fulfilled;
      const tokenContractAddress = await readTokenContract();

      expect(tokenContractAddress).eq(mockTokenWallet.address);
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

      await expect(addBidShares(auction, defaultTokenId, defaultBidShares)).rejectedWith(
        revert('InvertAuction: Only token contract')
      );
    });

    it('should set the bid shares if called by the token address', async () => {
      const auction = await auctionAs(mockTokenWallet);

      await expect(addBidShares(auction, defaultTokenId, defaultBidShares)).eventually.fulfilled;

      const tokenBidShares = Object.values(
        await auction.bidSharesForToken(defaultTokenId)
      ).map((s) => parseInt(formatUnits(s.value, 'ether')));

      expect(tokenBidShares[0]).eq(toNumEther(defaultBidShares.prevOwner.value));
      expect(tokenBidShares[1]).eq(toNumEther(defaultBidShares.creator.value));
      expect(tokenBidShares[2]).eq(toNumEther(defaultBidShares.owner.value));
    });

    it('should reject if the bid shares are invalid', async () => {
      const auction = await auctionAs(mockTokenWallet);
      const invalidBidShares = {
        prevOwner: Decimal.new(0),
        owner: Decimal.new(0),
        creator: Decimal.new(101),
      }

      await expect(
        addBidShares(auction, defaultTokenId, invalidBidShares)
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

      await expect(setAsk(auction, defaultTokenId, defaultAsk)).rejectedWith(
        revert('InvertAuction: Only token contract')
      );
    });

    it('should set the ask if called by the token address', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction, defaultTokenId, defaultBidShares);

      await expect(setAsk(auction, defaultTokenId, defaultAsk)).eventually.fulfilled;

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
        })
      ).rejectedWith(
        revert('InvertAuction: Ask too small for share splitting')
      );
    });

    it("should reject if the bid shares haven't been set yet", async () => {
      const auction = await auctionAs(mockTokenWallet);
      await expect(setAsk(auction, defaultTokenId, defaultAsk)).rejectedWith(
        revert('InvertAuction: Invalid bid shares for token')
      );
    });
  });

  describe('#setBid', () => {
    let currency: string;
    const defaultBid = {
      amount: 100,
      currency: currency,
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
      await expect(setBid(auction, defaultBid, defaultTokenId)).rejectedWith(
        revert('InvertAuction: Only token contract')
      );
    });

    it('should revert if the bidder does not have a high enough allowance for their bidding currency', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await expect(setBid(auction, defaultBid, defaultTokenId)).rejectedWith(
        revert('InvertAuction: allowance not high enough to transfer token.')
      );
    });

    it('should revert if the bidder does not have enough tokens to bid with', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await mintCurrency(currency, defaultBid.bidder, defaultBid.amount-1);
      await approveCurrency(currency, auction.address, bidderWallet);

      await expect(setBid(auction, defaultBid, defaultTokenId)).rejectedWith(
        revert("InvertAuction: Not enough funds to transfer token.")
      );
    });

    it('should revert if the bid does not have bid shares set yet', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await mintCurrency(currency, defaultBid.bidder, defaultBid.amount);
      await approveCurrency(currency, auction.address, bidderWallet);
      await expect(setBid(auction, defaultBid, defaultTokenId)).rejectedWith(
        revert('InvertAuction: Invalid bid shares for token')
      );
    });

    it('should revert if the bid is smaller than the min bid', async () => {
      const invalidBid = { ...defaultBid, amount: 99 };
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction, defaultTokenId, defaultBidShares);
      await mintCurrency(currency, defaultBid.bidder, defaultBid.amount);
      await approveCurrency(currency, auction.address, bidderWallet);
      await expect(setBid(auction, invalidBid, defaultTokenId)).rejectedWith(
        revert('InvertAuction: Bid invalid for share splitting')
      );
    });

    it('should revert if the bid is greater than the min bid, but cannot be divided by it evenly', async () => {
      const invalidBid = { ...defaultBid, amount: defaultBid.amount + 1};
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction, defaultTokenId, defaultBidShares);
      await mintCurrency(currency, defaultBid.bidder, defaultBid.amount + 1);
      await approveCurrency(currency, auction.address, bidderWallet);
      await expect(setBid(auction, invalidBid, defaultTokenId)).rejectedWith(
        revert('InvertAuction: Bid invalid for share splitting')
      );
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

      const afterBalance = toNumWei(await getBalance(currency, defaultBid.bidder));
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
      }

      await mintCurrency(currency, largerValidBid.bidder, largerValidBid.amount);
      await approveCurrency(currency, auction.address, bidderWallet);

      const beforeBalance = toNumWei(
        await getBalance(currency, defaultBid.bidder)
      );

      await expect(setBid(auction, largerValidBid, defaultTokenId)).fulfilled;

      const afterBalance = toNumWei(await getBalance(currency, largerValidBid.bidder));
      const bid = await auction.bidForTokenBidder(1, bidderWallet.address);
      expect(bid.currency).eq(currency);
      expect(toNumWei(bid.amount)).eq(largerValidBid.amount);
      expect(bid.bidder).eq(largerValidBid.bidder);
      expect(beforeBalance).eq(afterBalance + largerValidBid.amount);
    });

    it('should revert if the bidder bids again but the bid is invalid', async () => {
      const auction = await auctionAs(mockTokenWallet);
      await addBidShares(auction, defaultTokenId, defaultBidShares);
      await mintCurrency(currency, defaultBid.bidder, 5000);
      await approveCurrency(currency, auction.address, bidderWallet);

      await setBid(auction, defaultBid, defaultTokenId);

      await expect(
        setBid(
          auction,
          { ...defaultBid, amount: defaultBid.amount - 1 },
          defaultTokenId
        )
      ).rejectedWith(
        revert('InvertAuction: Bid invalid for share splitting')
      );
    })

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
          defaultTokenId)
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
