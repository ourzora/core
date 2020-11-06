import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Blockchain } from '../utils/Blockchain';
import { generatedWallets } from '../utils/generatedWallets';
import { InvertAuctionFactory } from '../typechain/InvertAuctionFactory';
import { ethers, Wallet } from 'ethers';
import { AddressZero } from '@ethersproject/constants';
import Decimal from '../utils/Decimal';
import { BigNumber, BigNumberish, Bytes } from 'ethers';
import {
  BaseErc20Factory,
  InvertToken,
  InvertTokenFactory,
} from '../typechain';
import {
  approveCurrency,
  deployCurrency,
  getBalance,
  mintCurrency,
  toNumWei,
} from './utils';
import { sha256 } from 'ethers/lib/utils';

chai.use(asPromised);

let provider = new JsonRpcProvider();
let blockchain = new Blockchain(provider);


let contentHex: string;
let contentHash: string;
let contentHashBytes: Bytes;
let zeroContentHashBytes: Bytes;

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

describe('InvertToken', () => {
  let [
    deployerWallet,
    bidderWallet,
    creatorWallet,
    ownerWallet,
    prevOwnerWallet,
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
  const defaultBid = (currency: string, bidder: string) => ({
    amount: 100,
    currency,
    bidder,
    sellOnFee: Decimal.new(10),
  });

  let auctionAddress: string;
  let tokenAddress: string;

  async function tokenAs(wallet: Wallet) {
    return InvertTokenFactory.connect(tokenAddress, wallet);
  }
  async function deploy() {
    const auction = await (
      await new InvertAuctionFactory(deployerWallet).deploy()
    ).deployed();
    auctionAddress = auction.address;
    const token = await (
      await new InvertTokenFactory(deployerWallet).deploy(auction.address)
    ).deployed();
    tokenAddress = token.address;

    await auction.configure(tokenAddress);
  }

  async function mint(
    token: InvertToken,
    creator: string,
    tokenURI: string,
    contentHash: Bytes,
    shares: BidShares
  ) {
    return token.mint(creator, tokenURI, contentHash, shares);
  }

  async function setAsk(token: InvertToken, tokenId: number, ask: Ask) {
    return token.setAsk(tokenId, ask);
  }

  async function setBid(token: InvertToken, bid: Bid, tokenId: number) {
    return token.setBid(tokenId, bid);
  }

  async function removeBid(token: InvertToken, tokenId: number) {
    return token.removeBid(tokenId);
  }

  async function acceptBid(
    token: InvertToken,
    tokenId: number,
    bidder: string
  ) {
    return token.acceptBid(tokenId, bidder);
  }

  // Trade a token a few times and create some open bids
  async function setupAuction(currencyAddr: string, tokenId = 0) {
    const asCreator = await tokenAs(creatorWallet);
    const asPrevOwner = await tokenAs(prevOwnerWallet);
    const asOwner = await tokenAs(ownerWallet);
    const asBidder = await tokenAs(bidderWallet);
    const asOther = await tokenAs(otherWallet);

    await mintCurrency(currencyAddr, creatorWallet.address, 10000);
    await mintCurrency(currencyAddr, prevOwnerWallet.address, 10000);
    await mintCurrency(currencyAddr, ownerWallet.address, 10000);
    await mintCurrency(currencyAddr, bidderWallet.address, 10000);
    await mintCurrency(currencyAddr, otherWallet.address, 10000);
    await approveCurrency(currencyAddr, auctionAddress, creatorWallet);
    await approveCurrency(currencyAddr, auctionAddress, prevOwnerWallet);
    await approveCurrency(currencyAddr, auctionAddress, ownerWallet);
    await approveCurrency(currencyAddr, auctionAddress, bidderWallet);
    await approveCurrency(currencyAddr, auctionAddress, otherWallet);

    await mint(
      asCreator,
      creatorWallet.address,
      'www.example.com',
      contentHashBytes,
      defaultBidShares
    );

    await setBid(
      asPrevOwner,
      defaultBid(currencyAddr, prevOwnerWallet.address),
      tokenId
    );
    await acceptBid(asCreator, tokenId, prevOwnerWallet.address);
    await setBid(
      asOwner,
      defaultBid(currencyAddr, ownerWallet.address),
      tokenId
    );
    await acceptBid(asPrevOwner, tokenId, ownerWallet.address);
    await setBid(
      asBidder,
      defaultBid(currencyAddr, bidderWallet.address),
      tokenId
    );
    await setBid(
      asOther,
      defaultBid(currencyAddr, otherWallet.address),
      tokenId
    );
  }

  beforeEach(async () => {
    await blockchain.resetAsync();
    contentHex = ethers.utils.formatBytes32String("invert");
    contentHash = await sha256(contentHex);
    contentHashBytes = ethers.utils.arrayify(contentHash);
    zeroContentHashBytes = ethers.utils.arrayify(ethers.constants.HashZero);
  });

  describe('#constructor', () => {
    it('should be able to deploy', async () => {
      await expect(deploy()).eventually.fulfilled;
    });
  });

  describe('#mint', () => {

    beforeEach(async () => {
      await deploy();
    });

    it('should mint a token', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(
          token,
          creatorWallet.address,
          'www.example.com',
          contentHashBytes,
          {
          prevOwner: Decimal.new(10),
          creator: Decimal.new(90),
          owner: Decimal.new(0),
        })
      ).fulfilled;

      const t = await token.tokenByIndex(0);
      const ownerT = await token.tokenOfOwnerByIndex(creatorWallet.address, 0);
      const ownerOf = await token.ownerOf(0);
      const creator = await token.tokenCreators(0);
      const prevOwner = await token.previousTokenOwners(0);
      const tokenContentHash = await token.tokenContentHashes(0);

      expect(toNumWei(t)).eq(toNumWei(ownerT));
      expect(ownerOf).eq(creatorWallet.address);
      expect(creator).eq(creatorWallet.address);
      expect(prevOwner).eq(creatorWallet.address);
      expect(tokenContentHash).eq(contentHash);
    });

    it('should set the contentHash as zero bits if one is not specified', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(
          token,
          creatorWallet.address,
          'www.example.com',
          zeroContentHashBytes,
          {
            prevOwner: Decimal.new(10),
            creator: Decimal.new(90),
            owner: Decimal.new(0),
          })
      ).fulfilled;

      const t = await token.tokenByIndex(0);
      const ownerT = await token.tokenOfOwnerByIndex(creatorWallet.address, 0);
      const ownerOf = await token.ownerOf(0);
      const creator = await token.tokenCreators(0);
      const prevOwner = await token.previousTokenOwners(0);
      const tokenContentHash = await token.tokenContentHashes(0);

      expect(toNumWei(t)).eq(toNumWei(ownerT));
      expect(ownerOf).eq(creatorWallet.address);
      expect(creator).eq(creatorWallet.address);
      expect(prevOwner).eq(creatorWallet.address);
      expect(tokenContentHash).eq(ethers.constants.HashZero);
    });

    it('should not be able to mint a token with bid shares summing to less than 100', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(
          token,
          creatorWallet.address,
          'www.example.com',
          contentHashBytes,
          {
          prevOwner: Decimal.new(15),
          owner: Decimal.new(15),
          creator: Decimal.new(15),
        })
      ).rejected;
    });

    it('should not be able to mint a token with bid shares summing to greater than 100', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(
          token,
          creatorWallet.address,
          '222',
          contentHashBytes,
          {
          prevOwner: Decimal.new(99),
          owner: Decimal.new(1),
          creator: Decimal.new(1),
        })
      ).rejected;
    });
  });

  describe('#setAsk', () => {
    let currencyAddr: string;
    beforeEach(async () => {
      await deploy();
      currencyAddr = await deployCurrency();
      await setupAuction(currencyAddr);
    });

    it('should set the ask', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(setAsk(token, 0, defaultAsk)).fulfilled;
    });

    it('should reject if the ask is 0', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(setAsk(token, 0, { ...defaultAsk, amount: 0 })).rejected;
    });

    it('should reject if the ask amount is invalid and cannot be split', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(setAsk(token, 0, { ...defaultAsk, amount: 101 })).rejected;
    });

    it('should reject if the ask amount is larger than (100 - creatorShare)', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(
        setAsk(token, 0, { ...defaultAsk, sellOnFee: Decimal.new(91) })
      );
    });
  });

  describe('#setBid', () => {
    let currencyAddr: string;
    beforeEach(async () => {
      await deploy();
      await mint(
        await tokenAs(creatorWallet),
        creatorWallet.address,
        '1111',
        contentHashBytes,
        defaultBidShares
      );
      currencyAddr = await deployCurrency();
    });

    it('should revert if the token bidder does not have a high enough allowance for their bidding currency', async () => {
      const token = await tokenAs(bidderWallet);
      await expect(
        token.setBid(0, defaultBid(currencyAddr, bidderWallet.address))
      ).rejected;
    });

    it('should revert if the token bidder does not have a high enough balance for their bidding currency', async () => {
      const token = await tokenAs(bidderWallet);
      await approveCurrency(currencyAddr, auctionAddress, bidderWallet);
      await expect(
        token.setBid(0, defaultBid(currencyAddr, bidderWallet.address))
      ).rejected;
    });

    it('should set a bid', async () => {
      const token = await tokenAs(bidderWallet);
      await approveCurrency(currencyAddr, auctionAddress, bidderWallet);
      await mintCurrency(currencyAddr, bidderWallet.address, 100000);
      await expect(
        token.setBid(0, defaultBid(currencyAddr, bidderWallet.address))
      ).fulfilled;
      const balance = await getBalance(currencyAddr, bidderWallet.address);
      expect(toNumWei(balance)).eq(100000 - 100);
    });

    it('should automatically transfer the token if the ask is set', async () => {
      const token = await tokenAs(bidderWallet);
      const asOwner = await tokenAs(ownerWallet);
      await setupAuction(currencyAddr, 1);
      await setAsk(asOwner, 1, { ...defaultAsk, currency: currencyAddr });

      await expect(
        token.setBid(1, defaultBid(currencyAddr, bidderWallet.address))
      ).fulfilled;

      await expect(token.ownerOf(1)).eventually.eq(bidderWallet.address);
    });

    it('should not automatically transfer the token if the ask sellOnFee is higher than the bid', async () => {
      const token = await tokenAs(bidderWallet);
      const asOwner = await tokenAs(ownerWallet);
      await setupAuction(currencyAddr, 1);
      await setAsk(asOwner, 1, {
        ...defaultAsk,
        currency: currencyAddr,
        sellOnFee: Decimal.new(60),
      });

      await expect(
        token.setBid(1, defaultBid(currencyAddr, bidderWallet.address))
      ).fulfilled;

      await expect(token.ownerOf(1)).eventually.eq(ownerWallet.address);
    });

    it('should refund a bid if one already exists for the bidder', async () => {
      const token = await tokenAs(bidderWallet);
      await setupAuction(currencyAddr, 1);

      const beforeBalance = toNumWei(
        await getBalance(currencyAddr, bidderWallet.address)
      );
      await setBid(
        token,
        {
          currency: currencyAddr,
          amount: 200,
          bidder: bidderWallet.address,
          sellOnFee: Decimal.new(10),
        },
        1
      );
      const afterBalance = toNumWei(
        await getBalance(currencyAddr, bidderWallet.address)
      );

      expect(afterBalance).eq(beforeBalance - 100);
    });
  });

  describe('#removeBid', () => {
    let currencyAddr: string;
    beforeEach(async () => {
      await deploy();
      currencyAddr = await deployCurrency();
      await setupAuction(currencyAddr);
    });

    it('should remove a bid and refund the bidder', async () => {
      const token = await tokenAs(bidderWallet);
      const beforeBalance = toNumWei(
        await getBalance(currencyAddr, bidderWallet.address)
      );
      await expect(removeBid(token, 0)).fulfilled;
      const afterBalance = toNumWei(
        await getBalance(currencyAddr, bidderWallet.address)
      );

      expect(afterBalance).eq(beforeBalance + 100);
    });

    it('should not be able to remove a bid twice', async () => {
      const token = await tokenAs(bidderWallet);
      await removeBid(token, 0);

      await expect(removeBid(token, 0)).rejected;
    });

    it('should remove a bid, even if the token is burned', async () => {
      const asOwner = await tokenAs(ownerWallet);
      const asBidder = await tokenAs(bidderWallet);

      await asOwner.burn(0);
      const beforeBalance = toNumWei(
        await getBalance(currencyAddr, bidderWallet.address)
      );
      await expect(asBidder.removeBid(0)).fulfilled;
      const afterBalance = toNumWei(
        await getBalance(currencyAddr, bidderWallet.address)
      );
      expect(afterBalance).eq(beforeBalance + 100);
    });
  });

  describe('#acceptBid', () => {
    let currencyAddr: string;
    beforeEach(async () => {
      await deploy();
      currencyAddr = await deployCurrency();
      await setupAuction(currencyAddr);
    });

    it('should accept a bid', async () => {
      const token = await tokenAs(ownerWallet);
      const auction = await InvertAuctionFactory.connect(
        auctionAddress,
        bidderWallet
      );
      const asBidder = await tokenAs(bidderWallet);
      await setBid(
        asBidder,
        {
          ...defaultBid(currencyAddr, bidderWallet.address),
          sellOnFee: Decimal.new(15),
        },
        0
      );

      const beforeOwnerBalance = toNumWei(
        await getBalance(currencyAddr, ownerWallet.address)
      );
      const beforePrevOwnerBalance = toNumWei(
        await getBalance(currencyAddr, prevOwnerWallet.address)
      );
      const beforeCreatorBalance = toNumWei(
        await getBalance(currencyAddr, creatorWallet.address)
      );
      await expect(token.acceptBid(0, bidderWallet.address)).fulfilled;
      const newOwner = await token.ownerOf(0);
      const afterOwnerBalance = toNumWei(
        await getBalance(currencyAddr, ownerWallet.address)
      );
      const afterPrevOwnerBalance = toNumWei(
        await getBalance(currencyAddr, prevOwnerWallet.address)
      );
      const afterCreatorBalance = toNumWei(
        await getBalance(currencyAddr, creatorWallet.address)
      );
      const bidShares = await auction.bidSharesForToken(0);

      expect(afterOwnerBalance).eq(beforeOwnerBalance + 80);
      expect(afterPrevOwnerBalance).eq(beforePrevOwnerBalance + 10);
      expect(afterCreatorBalance).eq(beforeCreatorBalance + 10);
      expect(newOwner).eq(bidderWallet.address);
      expect(toNumWei(bidShares.owner.value)).eq(75 * 10 ** 18);
      expect(toNumWei(bidShares.prevOwner.value)).eq(15 * 10 ** 18);
      expect(toNumWei(bidShares.creator.value)).eq(10 * 10 ** 18);
    });

    it('should revert if not called by the owner', async () => {
      const token = await tokenAs(otherWallet);

      await expect(token.acceptBid(0, otherWallet.address)).rejected;
    });

    it('should revert if a non-existent bid is accepted', async () => {
      const token = await tokenAs(creatorWallet);
      await expect(token.acceptBid(0, AddressZero)).rejected;
    });
  });

  describe('#burn', () => {
    let currencyAddr: string;

    beforeEach(async () => {
      await deploy();
      currencyAddr = await deployCurrency();
      await setupAuction(currencyAddr);
    });

    it('should burn the token when called by an owner', async () => {
      const token = await tokenAs(ownerWallet);

      await expect(token.burn(0)).fulfilled;
      await expect(token.ownerOf(0)).rejected;
    });

    it('should not be burnable when called by a non-owner', async () => {
      const token = await tokenAs(otherWallet);

      await expect(token.burn(0)).rejected;
    });
  });

  describe("#updateTokenURI", async () => {
    let currencyAddr: string;

    beforeEach(async () => {
      await deploy();
      currencyAddr = await deployCurrency();
      await setupAuction(currencyAddr);
    });

    it("should revert if the token does not exist", async () => {
      const token = await tokenAs(creatorWallet);

      await expect(token.updateTokenURI(1, "blah blah")).rejected;
    });

    it("should revert if the token does not have a content hash", async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(
          token,
          creatorWallet.address,
          'www.example.com',
          zeroContentHashBytes,
          {
            prevOwner: Decimal.new(10),
            creator: Decimal.new(90),
            owner: Decimal.new(0),
          })
      ).fulfilled;

      const owner = await token.ownerOf(1);
      const tokenContentHash = await token.tokenContentHashes(1);

      await expect(owner).eq(creatorWallet.address);
      await expect(tokenContentHash).eq(ethers.constants.HashZero);
      await expect(token.updateTokenURI(1, "blah blah")).rejected;
    });

    it("should revert if the caller is not the owner of the token", async () => {
      const token = await tokenAs(otherWallet);

      await expect(token.updateTokenURI(0, "blah blah")).rejected;
    });

    it("should set the tokenURI to the URI passed", async () => {
      const token = await tokenAs(ownerWallet);
      await expect(token.updateTokenURI(0, "blah blah")).fulfilled;

      const tokenURI = await token.tokenURI(0);
      expect(tokenURI).eq("blah blah");
    })
  });
});
