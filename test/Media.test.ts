import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Blockchain } from '../utils/Blockchain';
import { generatedWallets } from '../utils/generatedWallets';
import { MarketFactory } from '../typechain/MarketFactory';
import { ethers, Wallet } from 'ethers';
import { AddressZero } from '@ethersproject/constants';
import Decimal from '../utils/Decimal';
import { BigNumber, BigNumberish, Bytes } from 'ethers';
import { MediaFactory } from '../typechain/MediaFactory';
import { Media } from '../typechain/Media';
import {
  approveCurrency,
  deployCurrency,
  EIP712Sig,
  getBalance,
  mintCurrency,
  signMintWithSig,
  signPermit,
  toNumWei,
} from './utils';
import {
  arrayify,
  formatBytes32String,
  formatUnits,
  sha256,
} from 'ethers/lib/utils';
import exp from 'constants';

chai.use(asPromised);

let provider = new JsonRpcProvider();
let blockchain = new Blockchain(provider);

let contentHex: string;
let contentHash: string;
let contentHashBytes: Bytes;
let otherContentHex: string;
let otherContentHash: string;
let otherContentHashBytes: Bytes;
let zeroContentHashBytes: Bytes;
let metadataHex: string;
let metadataHash: string;
let metadataHashBytes: Bytes;

let tokenURI = 'www.example.com';
let metadataURI = 'www.example2.com';

type DecimalValue = { value: BigNumber };

type BidShares = {
  owner: DecimalValue;
  prevOwner: DecimalValue;
  creator: DecimalValue;
};

type MediaData = {
  tokenURI: string;
  metadataURI: string;
  contentHash: Bytes;
  metadataHash: Bytes;
};

type Ask = {
  currency: string;
  amount: BigNumberish;
};

type Bid = {
  currency: string;
  amount: BigNumberish;
  bidder: string;
  recipient: string;
  sellOnShare: { value: BigNumberish };
};

describe('Media', () => {
  let [
    deployerWallet,
    bidderWallet,
    creatorWallet,
    ownerWallet,
    prevOwnerWallet,
    otherWallet,
    nonBidderWallet,
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
    sellOnShare: Decimal.new(0),
  };
  const defaultBid = (
    currency: string,
    bidder: string,
    recipient?: string
  ) => ({
    amount: 100,
    currency,
    bidder,
    recipient: recipient || bidder,
    sellOnShare: Decimal.new(10),
  });

  let auctionAddress: string;
  let tokenAddress: string;

  async function tokenAs(wallet: Wallet) {
    return MediaFactory.connect(tokenAddress, wallet);
  }
  async function deploy() {
    const auction = await (
      await new MarketFactory(deployerWallet).deploy()
    ).deployed();
    auctionAddress = auction.address;
    const token = await (
      await new MediaFactory(deployerWallet).deploy(auction.address)
    ).deployed();
    tokenAddress = token.address;

    await auction.configure(tokenAddress);
  }

  async function mint(
    token: Media,
    metadataURI: string,
    tokenURI: string,
    contentHash: Bytes,
    metadataHash: Bytes,
    shares: BidShares
  ) {
    const data: MediaData = {
      tokenURI,
      metadataURI,
      contentHash,
      metadataHash,
    };
    return token.mint(data, shares);
  }

  async function mintWithSig(
    token: Media,
    creator: string,
    tokenURI: string,
    metadataURI: string,
    contentHash: Bytes,
    metadataHash: Bytes,
    shares: BidShares,
    sig: EIP712Sig
  ) {
    const data: MediaData = {
      tokenURI,
      metadataURI,
      contentHash,
      metadataHash,
    };

    return token.mintWithSig(creator, data, shares, sig);
  }

  async function setAsk(token: Media, tokenId: number, ask: Ask) {
    return token.setAsk(tokenId, ask);
  }

  async function removeAsk(token: Media, tokenId: number) {
    return token.removeAsk(tokenId);
  }

  async function setBid(token: Media, bid: Bid, tokenId: number) {
    return token.setBid(tokenId, bid);
  }

  async function removeBid(token: Media, tokenId: number) {
    return token.removeBid(tokenId);
  }

  async function acceptBid(token: Media, tokenId: number, bid: Bid) {
    return token.acceptBid(tokenId, bid);
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
      metadataURI,
      tokenURI,
      contentHashBytes,
      metadataHashBytes,
      defaultBidShares
    );

    await setBid(
      asPrevOwner,
      defaultBid(currencyAddr, prevOwnerWallet.address),
      tokenId
    );
    await acceptBid(asCreator, tokenId, {
      ...defaultBid(currencyAddr, prevOwnerWallet.address),
    });
    await setBid(
      asOwner,
      defaultBid(currencyAddr, ownerWallet.address),
      tokenId
    );
    await acceptBid(
      asPrevOwner,
      tokenId,
      defaultBid(currencyAddr, ownerWallet.address)
    );
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

    metadataHex = ethers.utils.formatBytes32String('{}');
    metadataHash = await sha256(metadataHex);
    metadataHashBytes = ethers.utils.arrayify(metadataHash);

    contentHex = ethers.utils.formatBytes32String('invert');
    contentHash = await sha256(contentHex);
    contentHashBytes = ethers.utils.arrayify(contentHash);

    otherContentHex = ethers.utils.formatBytes32String('otherthing');
    otherContentHash = await sha256(otherContentHex);
    otherContentHashBytes = ethers.utils.arrayify(otherContentHash);

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
          metadataURI,
          tokenURI,
          contentHashBytes,
          metadataHashBytes,
          {
            prevOwner: Decimal.new(10),
            creator: Decimal.new(90),
            owner: Decimal.new(0),
          }
        )
      ).fulfilled;

      const t = await token.tokenByIndex(0);
      const ownerT = await token.tokenOfOwnerByIndex(creatorWallet.address, 0);
      const ownerOf = await token.ownerOf(0);
      const creator = await token.tokenCreators(0);
      const prevOwner = await token.previousTokenOwners(0);
      const tokenContentHash = await token.tokenContentHashes(0);
      const metadataContentHash = await token.tokenMetadataHashes(0);
      const savedTokenURI = await token.tokenURI(0);
      const savedMetadataURI = await token.tokenMetadataURI(0);

      expect(toNumWei(t)).eq(toNumWei(ownerT));
      expect(ownerOf).eq(creatorWallet.address);
      expect(creator).eq(creatorWallet.address);
      expect(prevOwner).eq(creatorWallet.address);
      expect(tokenContentHash).eq(contentHash);
      expect(metadataContentHash).eq(metadataHash);
      expect(savedTokenURI).eq(tokenURI);
      expect(savedMetadataURI).eq(metadataURI);
    });

    it('should revert if an empty content hash is specified', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(
          token,
          metadataURI,
          tokenURI,
          zeroContentHashBytes,
          metadataHashBytes,
          {
            prevOwner: Decimal.new(10),
            creator: Decimal.new(90),
            owner: Decimal.new(0),
          }
        )
      ).rejectedWith('Media: content hash must be non-zero');
    });

    it('should revert if the content hash already exists for a created token', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(
          token,
          metadataURI,
          tokenURI,
          contentHashBytes,
          metadataHashBytes,
          {
            prevOwner: Decimal.new(10),
            creator: Decimal.new(90),
            owner: Decimal.new(0),
          }
        )
      ).fulfilled;

      await expect(
        mint(
          token,
          metadataURI,
          tokenURI,
          contentHashBytes,
          metadataHashBytes,
          {
            prevOwner: Decimal.new(10),
            creator: Decimal.new(90),
            owner: Decimal.new(0),
          }
        )
      ).rejectedWith(
        'Media: a token has already been created with this content hash'
      );
    });

    it('should revert if the metadataHash is empty', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(
          token,
          metadataURI,
          tokenURI,
          contentHashBytes,
          zeroContentHashBytes,
          {
            prevOwner: Decimal.new(10),
            creator: Decimal.new(90),
            owner: Decimal.new(0),
          }
        )
      ).rejectedWith('Media: metadata hash must be non-zero');
    });

    it('should revert if the tokenURI is empty', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(token, metadataURI, '', zeroContentHashBytes, metadataHashBytes, {
          prevOwner: Decimal.new(10),
          creator: Decimal.new(90),
          owner: Decimal.new(0),
        })
      ).rejectedWith('Media: specified uri must be non-empty');
    });

    it('should revert if the metadataURI is empty', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(token, '', tokenURI, zeroContentHashBytes, metadataHashBytes, {
          prevOwner: Decimal.new(10),
          creator: Decimal.new(90),
          owner: Decimal.new(0),
        })
      ).rejectedWith('Media: specified uri must be non-empty');
    });

    it('should not be able to mint a token with bid shares summing to less than 100', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(
          token,
          metadataURI,
          tokenURI,
          contentHashBytes,
          metadataHashBytes,
          {
            prevOwner: Decimal.new(15),
            owner: Decimal.new(15),
            creator: Decimal.new(15),
          }
        )
      ).rejectedWith('Market: Invalid bid shares, must sum to 100');
    });

    it('should not be able to mint a token with bid shares summing to greater than 100', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(
        mint(token, metadataURI, '222', contentHashBytes, metadataHashBytes, {
          prevOwner: Decimal.new(99),
          owner: Decimal.new(1),
          creator: Decimal.new(1),
        })
      ).rejectedWith('Market: Invalid bid shares, must sum to 100');
    });
  });

  describe('#mintWithSig', () => {
    beforeEach(async () => {
      await deploy();
    });

    it('should mint a token for a given creator with a valid signature', async () => {
      const token = await tokenAs(otherWallet);
      const market = await MarketFactory.connect(auctionAddress, otherWallet);
      const sig = await signMintWithSig(
        creatorWallet,
        token.address,
        creatorWallet.address,
        contentHash,
        metadataHash,
        Decimal.new(5).value.toString(),
        1
      );

      const beforeNonce = await token.mintWithSigNonces(creatorWallet.address);
      await expect(
        mintWithSig(
          token,
          creatorWallet.address,
          tokenURI,
          metadataURI,
          contentHashBytes,
          metadataHashBytes,
          {
            prevOwner: Decimal.new(0),
            owner: Decimal.new(95),
            creator: Decimal.new(5),
          },
          sig
        )
      ).fulfilled;

      const recovered = await token.tokenCreators(0);
      const recoveredTokenURI = await token.tokenURI(0);
      const recoveredMetadataURI = await token.tokenMetadataURI(0);
      const recoveredContentHash = await token.tokenContentHashes(0);
      const recoveredMetadataHash = await token.tokenMetadataHashes(0);
      const recoveredCreatorBidShare = formatUnits(
        (await market.bidSharesForToken(0)).creator.value,
        'ether'
      );
      const afterNonce = await token.mintWithSigNonces(creatorWallet.address);

      expect(recovered).to.eq(creatorWallet.address);
      expect(recoveredTokenURI).to.eq(tokenURI);
      expect(recoveredMetadataURI).to.eq(metadataURI);
      expect(recoveredContentHash).to.eq(contentHash);
      expect(recoveredMetadataHash).to.eq(metadataHash);
      expect(recoveredCreatorBidShare).to.eq('5.0');
      expect(toNumWei(afterNonce)).to.eq(toNumWei(beforeNonce) + 1);
    });

    it('should not mint a token for a different creator', async () => {
      const token = await tokenAs(otherWallet);
      const sig = await signMintWithSig(
        bidderWallet,
        token.address,
        creatorWallet.address,
        tokenURI,
        metadataURI,
        Decimal.new(5).value.toString(),
        1
      );

      await expect(
        mintWithSig(
          token,
          creatorWallet.address,
          tokenURI,
          metadataURI,
          contentHashBytes,
          metadataHashBytes,
          {
            prevOwner: Decimal.new(0),
            owner: Decimal.new(95),
            creator: Decimal.new(5),
          },
          sig
        )
      ).rejectedWith('Media: Signature invalid');
    });

    it('should not mint a token for a different contentHash', async () => {
      const badContent = 'bad bad bad';
      const badContentHex = formatBytes32String(badContent);
      const badContentHash = sha256(badContentHex);
      const badContentHashBytes = arrayify(badContentHash);

      const token = await tokenAs(otherWallet);
      const sig = await signMintWithSig(
        creatorWallet,
        token.address,
        creatorWallet.address,
        contentHash,
        metadataHash,
        Decimal.new(5).value.toString(),
        1
      );

      await expect(
        mintWithSig(
          token,
          creatorWallet.address,
          tokenURI,
          metadataURI,
          badContentHashBytes,
          metadataHashBytes,
          {
            prevOwner: Decimal.new(0),
            owner: Decimal.new(95),
            creator: Decimal.new(5),
          },
          sig
        )
      ).rejectedWith('Media: Signature invalid');
    });
    it('should not mint a token for a different metadataHash', async () => {
      const badMetadata = '{"some": "bad", "data": ":)"}';
      const badMetadataHex = formatBytes32String(badMetadata);
      const badMetadataHash = sha256(badMetadataHex);
      const badMetadataHashBytes = arrayify(badMetadataHash);
      const token = await tokenAs(otherWallet);
      const sig = await signMintWithSig(
        creatorWallet,
        token.address,
        creatorWallet.address,
        contentHash,
        metadataHash,
        Decimal.new(5).value.toString(),
        1
      );

      await expect(
        mintWithSig(
          token,
          creatorWallet.address,
          tokenURI,
          metadataURI,
          contentHashBytes,
          badMetadataHashBytes,
          {
            prevOwner: Decimal.new(0),
            owner: Decimal.new(95),
            creator: Decimal.new(5),
          },
          sig
        )
      ).rejectedWith('Media: Signature invalid');
    });
    it('should not mint a token for a different creator bid share', async () => {
      const token = await tokenAs(otherWallet);
      const sig = await signMintWithSig(
        creatorWallet,
        token.address,
        creatorWallet.address,
        tokenURI,
        metadataURI,
        Decimal.new(5).value.toString(),
        1
      );

      await expect(
        mintWithSig(
          token,
          creatorWallet.address,
          tokenURI,
          metadataURI,
          contentHashBytes,
          metadataHashBytes,
          {
            prevOwner: Decimal.new(0),
            owner: Decimal.new(100),
            creator: Decimal.new(0),
          },
          sig
        )
      ).rejectedWith('Media: Signature invalid');
    });
    it('should not mint a token with an invalid deadline', async () => {
      const token = await tokenAs(otherWallet);
      const sig = await signMintWithSig(
        creatorWallet,
        token.address,
        creatorWallet.address,
        tokenURI,
        metadataURI,
        Decimal.new(5).value.toString(),
        1
      );

      await expect(
        mintWithSig(
          token,
          creatorWallet.address,
          tokenURI,
          metadataURI,
          contentHashBytes,
          metadataHashBytes,
          {
            prevOwner: Decimal.new(0),
            owner: Decimal.new(95),
            creator: Decimal.new(5),
          },
          { ...sig, deadline: '1' }
        )
      ).rejectedWith('Media: mintWithSig expired');
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
      await expect(setAsk(token, 0, { ...defaultAsk, amount: 0 })).rejectedWith(
        'Market: Ask invalid for share splitting'
      );
    });

    it('should reject if the ask amount is invalid and cannot be split', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(
        setAsk(token, 0, { ...defaultAsk, amount: 101 })
      ).rejectedWith('Market: Ask invalid for share splitting');
    });
  });

  describe('#removeAsk', () => {
    it('should remove the ask', async () => {
      const token = await tokenAs(ownerWallet);
      const market = await MarketFactory.connect(
        auctionAddress,
        deployerWallet
      );
      await setAsk(token, 0, defaultAsk);

      await expect(removeAsk(token, 0)).fulfilled;
      const ask = await market.currentAskForToken(0);
      expect(toNumWei(ask.amount)).eq(0);
      expect(ask.currency).eq(AddressZero);
    });

    it('should emit an Ask Removed event', async () => {
      const token = await tokenAs(ownerWallet);
      const auction = await MarketFactory.connect(
        auctionAddress,
        deployerWallet
      );
      await setAsk(token, 0, defaultAsk);
      const block = await provider.getBlockNumber();
      const tx = await removeAsk(token, 0);

      const events = await auction.queryFilter(
        auction.filters.AskRemoved(0, null),
        block
      );
      expect(events.length).eq(1);
      const logDescription = auction.interface.parseLog(events[0]);
      expect(toNumWei(logDescription.args.tokenId)).to.eq(0);
      expect(toNumWei(logDescription.args.ask.amount)).to.eq(defaultAsk.amount);
      expect(logDescription.args.ask.currency).to.eq(defaultAsk.currency);
    });

    it('should not be callable by anyone that is not owner or approved', async () => {
      const token = await tokenAs(ownerWallet);
      const asOther = await tokenAs(otherWallet);
      await setAsk(token, 0, defaultAsk);

      expect(removeAsk(asOther, 0)).rejectedWith(
        'Media: Only approved or owner'
      );
    });
  });

  describe('#setBid', () => {
    let currencyAddr: string;
    beforeEach(async () => {
      await deploy();
      await mint(
        await tokenAs(creatorWallet),
        metadataURI,
        '1111',
        otherContentHashBytes,
        metadataHashBytes,
        defaultBidShares
      );
      currencyAddr = await deployCurrency();
    });

    it('should revert if the token bidder does not have a high enough allowance for their bidding currency', async () => {
      const token = await tokenAs(bidderWallet);
      await expect(
        token.setBid(0, defaultBid(currencyAddr, bidderWallet.address))
      ).rejectedWith('SafeERC20: ERC20 operation did not succeed');
    });

    it('should revert if the token bidder does not have a high enough balance for their bidding currency', async () => {
      const token = await tokenAs(bidderWallet);
      await approveCurrency(currencyAddr, auctionAddress, bidderWallet);
      await expect(
        token.setBid(0, defaultBid(currencyAddr, bidderWallet.address))
      ).rejectedWith('SafeERC20: ERC20 operation did not succeed');
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
          recipient: otherWallet.address,
          sellOnShare: Decimal.new(10),
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

    it('should revert if the bidder has not placed a bid', async () => {
      const token = await tokenAs(nonBidderWallet);

      await expect(removeBid(token, 0)).rejectedWith(
        'Market: cannot remove bid amount of 0'
      );
    });

    it('should revert if the tokenId has not yet ben created', async () => {
      const token = await tokenAs(bidderWallet);

      await expect(removeBid(token, 100)).rejectedWith(
        'Media: token with that id does not exist'
      );
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

      await expect(removeBid(token, 0)).rejectedWith(
        'Market: cannot remove bid amount of 0'
      );
    });

    it('should remove a bid, even if the token is burned', async () => {
      const asOwner = await tokenAs(ownerWallet);
      const asBidder = await tokenAs(bidderWallet);
      const asCreator = await tokenAs(creatorWallet);

      await asOwner.transferFrom(ownerWallet.address, creatorWallet.address, 0);
      await asCreator.burn(0);
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
      const auction = await MarketFactory.connect(auctionAddress, bidderWallet);
      const asBidder = await tokenAs(bidderWallet);
      const bid = {
        ...defaultBid(currencyAddr, bidderWallet.address, otherWallet.address),
        sellOnShare: Decimal.new(15),
      };
      await setBid(asBidder, bid, 0);

      const beforeOwnerBalance = toNumWei(
        await getBalance(currencyAddr, ownerWallet.address)
      );
      const beforePrevOwnerBalance = toNumWei(
        await getBalance(currencyAddr, prevOwnerWallet.address)
      );
      const beforeCreatorBalance = toNumWei(
        await getBalance(currencyAddr, creatorWallet.address)
      );
      await expect(token.acceptBid(0, bid)).fulfilled;
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
      expect(newOwner).eq(otherWallet.address);
      expect(toNumWei(bidShares.owner.value)).eq(75 * 10 ** 18);
      expect(toNumWei(bidShares.prevOwner.value)).eq(15 * 10 ** 18);
      expect(toNumWei(bidShares.creator.value)).eq(10 * 10 ** 18);
    });

    it('should emit a bid finalized event if the bid is accepted', async () => {
      const asBidder = await tokenAs(bidderWallet);
      const token = await tokenAs(ownerWallet);
      const auction = await MarketFactory.connect(auctionAddress, bidderWallet);
      const bid = defaultBid(currencyAddr, bidderWallet.address);
      const block = await provider.getBlockNumber();
      await setBid(asBidder, bid, 0);
      await token.acceptBid(0, bid);
      const events = await auction.queryFilter(
        auction.filters.BidFinalized(null, null),
        block
      );
      expect(events.length).eq(1);
      const logDescription = auction.interface.parseLog(events[0]);
      expect(toNumWei(logDescription.args.tokenId)).to.eq(0);
      expect(toNumWei(logDescription.args.bid.amount)).to.eq(bid.amount);
      expect(logDescription.args.bid.currency).to.eq(bid.currency);
      expect(toNumWei(logDescription.args.bid.sellOnShare.value)).to.eq(
        toNumWei(bid.sellOnShare.value)
      );
      expect(logDescription.args.bid.bidder).to.eq(bid.bidder);
    });

    it('should emit a bid shares updated event if the bid is accepted', async () => {
      const asBidder = await tokenAs(bidderWallet);
      const token = await tokenAs(ownerWallet);
      const auction = await MarketFactory.connect(auctionAddress, bidderWallet);
      const bid = defaultBid(currencyAddr, bidderWallet.address);
      const block = await provider.getBlockNumber();
      await setBid(asBidder, bid, 0);
      await token.acceptBid(0, bid);
      const events = await auction.queryFilter(
        auction.filters.BidShareUpdated(null, null),
        block
      );
      expect(events.length).eq(1);
      const logDescription = auction.interface.parseLog(events[0]);
      expect(toNumWei(logDescription.args.tokenId)).to.eq(0);
      expect(toNumWei(logDescription.args.bidShares.prevOwner.value)).to.eq(
        10000000000000000000
      );
      expect(toNumWei(logDescription.args.bidShares.owner.value)).to.eq(
        80000000000000000000
      );
      expect(toNumWei(logDescription.args.bidShares.creator.value)).to.eq(
        10000000000000000000
      );
    });

    it('should revert if not called by the owner', async () => {
      const token = await tokenAs(otherWallet);

      await expect(
        token.acceptBid(0, { ...defaultBid(currencyAddr, otherWallet.address) })
      ).rejectedWith('Media: Only approved or owner');
    });

    it('should revert if a non-existent bid is accepted', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(
        token.acceptBid(0, { ...defaultBid(currencyAddr, AddressZero) })
      ).rejectedWith('Market: cannot accept bid of 0');
    });

    it('should revert if an invalid bid is accepted', async () => {
      const token = await tokenAs(ownerWallet);
      const asBidder = await tokenAs(bidderWallet);
      const bid = {
        ...defaultBid(currencyAddr, bidderWallet.address),
        amount: 99,
      };
      await setBid(asBidder, bid, 0);

      await expect(token.acceptBid(0, bid)).rejectedWith(
        'Market: Bid invalid for share splitting'
      );
    });

    // TODO: test the front running logic
  });

  describe('#transfer', () => {
    let currencyAddr: string;
    beforeEach(async () => {
      await deploy();
      currencyAddr = await deployCurrency();
      await setupAuction(currencyAddr);
    });

    it('should remove the ask after a transfer', async () => {
      const token = await tokenAs(ownerWallet);
      const auction = MarketFactory.connect(auctionAddress, deployerWallet);
      await setAsk(token, 0, defaultAsk);

      await expect(
        token.transferFrom(ownerWallet.address, otherWallet.address, 0)
      ).fulfilled;
      const ask = await auction.currentAskForToken(0);
      await expect(toNumWei(ask.amount)).eq(0);
      await expect(ask.currency).eq(AddressZero);
    });
  });

  describe('#burn', () => {
    beforeEach(async () => {
      await deploy();
      const token = await tokenAs(creatorWallet);
      await mint(
        token,
        metadataURI,
        tokenURI,
        contentHashBytes,
        metadataHashBytes,
        {
          prevOwner: Decimal.new(10),
          creator: Decimal.new(90),
          owner: Decimal.new(0),
        }
      );
    });

    it('should revert when the caller is the owner, but not creator', async () => {
      const creatorToken = await tokenAs(creatorWallet);
      await creatorToken.transferFrom(
        creatorWallet.address,
        ownerWallet.address,
        0
      );
      const token = await tokenAs(ownerWallet);
      await expect(token.burn(0)).rejectedWith(
        'Media: owner is not creator of media'
      );
    });

    it('should revert when the caller is approved, but the owner is not the creator', async () => {
      const creatorToken = await tokenAs(creatorWallet);
      await creatorToken.transferFrom(
        creatorWallet.address,
        ownerWallet.address,
        0
      );
      const token = await tokenAs(ownerWallet);
      await token.approve(otherWallet.address, 0);

      const otherToken = await tokenAs(otherWallet);
      await expect(otherToken.burn(0)).rejectedWith(
        'Media: owner is not creator of media'
      );
    });

    it('should revert when the caller is not the owner or a creator', async () => {
      const token = await tokenAs(otherWallet);

      await expect(token.burn(0)).rejectedWith('Media: Only approved or owner');
    });

    it('should revert if the token id does not exist', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(token.burn(100)).rejectedWith('Media: nonexistent token');
    });

    it('should clear approvals, set remove owner, but maintain tokenURI and contentHash when the owner is creator and caller', async () => {
      const token = await tokenAs(creatorWallet);
      await expect(token.approve(otherWallet.address, 0)).fulfilled;

      await expect(token.burn(0)).fulfilled;

      await expect(token.ownerOf(0)).rejectedWith(
        'ERC721: owner query for nonexistent token'
      );

      const totalSupply = await token.totalSupply();
      expect(toNumWei(totalSupply)).eq(0);

      await expect(token.getApproved(0)).rejectedWith(
        'ERC721: approved query for nonexistent token'
      );

      const tokenURI = await token.tokenURI(0);
      expect(tokenURI).eq('www.example.com');

      const contentHash = await token.tokenContentHashes(0);
      expect(contentHash).eq(contentHash);

      const previousOwner = await token.previousTokenOwners(0);
      expect(previousOwner).eq(AddressZero);
    });

    it('should clear approvals, set remove owner, but maintain tokenURI and contentHash when the owner is creator and caller is approved', async () => {
      const token = await tokenAs(creatorWallet);
      await expect(token.approve(otherWallet.address, 0)).fulfilled;

      const otherToken = await tokenAs(otherWallet);

      await expect(otherToken.burn(0)).fulfilled;

      await expect(token.ownerOf(0)).rejectedWith(
        'ERC721: owner query for nonexistent token'
      );

      const totalSupply = await token.totalSupply();
      expect(toNumWei(totalSupply)).eq(0);

      await expect(token.getApproved(0)).rejectedWith(
        'ERC721: approved query for nonexistent token'
      );

      const tokenURI = await token.tokenURI(0);
      expect(tokenURI).eq('www.example.com');

      const contentHash = await token.tokenContentHashes(0);
      expect(contentHash).eq(contentHash);

      const previousOwner = await token.previousTokenOwners(0);
      expect(previousOwner).eq(AddressZero);
    });
  });

  describe('#updateTokenURI', async () => {
    let currencyAddr: string;

    beforeEach(async () => {
      await deploy();
      currencyAddr = await deployCurrency();
      await setupAuction(currencyAddr);
    });

    it('should revert if the token does not exist', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(token.updateTokenURI(1, 'blah blah')).rejectedWith(
        'ERC721: operator query for nonexistent token'
      );
    });

    it('should revert if the caller is not the owner of the token and does not have approval', async () => {
      const token = await tokenAs(otherWallet);

      await expect(token.updateTokenURI(0, 'blah blah')).rejectedWith(
        'Media: Only approved or owner'
      );
    });

    it('should revert if the uri is empty string', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(token.updateTokenURI(0, '')).rejectedWith(
        'Media: specified uri must be non-empty'
      );
    });

    it('should revert if the token has been burned', async () => {
      const token = await tokenAs(creatorWallet);

      await mint(
        token,
        metadataURI,
        tokenURI,
        otherContentHashBytes,
        metadataHashBytes,
        {
          prevOwner: Decimal.new(10),
          creator: Decimal.new(90),
          owner: Decimal.new(0),
        }
      );

      await expect(token.burn(1)).fulfilled;

      await expect(token.updateTokenURI(1, 'blah')).rejectedWith(
        'ERC721: operator query for nonexistent token'
      );
    });

    it('should set the tokenURI to the URI passed if the msg.sender is the owner', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(token.updateTokenURI(0, 'blah blah')).fulfilled;

      const tokenURI = await token.tokenURI(0);
      expect(tokenURI).eq('blah blah');
    });

    it('should set the tokenURI to the URI passed if the msg.sender is approved', async () => {
      const token = await tokenAs(ownerWallet);
      await token.approve(otherWallet.address, 0);

      const otherToken = await tokenAs(otherWallet);
      await expect(otherToken.updateTokenURI(0, 'blah blah')).fulfilled;

      const tokenURI = await token.tokenURI(0);
      expect(tokenURI).eq('blah blah');
    });
  });

  describe('#updateMetadataURI', async () => {
    let currencyAddr: string;

    beforeEach(async () => {
      await deploy();
      currencyAddr = await deployCurrency();
      await setupAuction(currencyAddr);
    });

    it('should revert if the token does not exist', async () => {
      const token = await tokenAs(creatorWallet);

      await expect(token.updateTokenMetadataURI(1, 'blah blah')).rejectedWith(
        'ERC721: operator query for nonexistent token'
      );
    });

    it('should revert if the caller is not the owner of the token or approved', async () => {
      const token = await tokenAs(otherWallet);

      await expect(token.updateTokenMetadataURI(0, 'blah blah')).rejectedWith(
        'Media: Only approved or owner'
      );
    });

    it('should revert if the uri is empty string', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(token.updateTokenMetadataURI(0, '')).rejectedWith(
        'Media: specified uri must be non-empty'
      );
    });

    it('should revert if the token has been burned', async () => {
      const token = await tokenAs(creatorWallet);

      await mint(
        token,
        metadataURI,
        tokenURI,
        otherContentHashBytes,
        metadataHashBytes,
        {
          prevOwner: Decimal.new(10),
          creator: Decimal.new(90),
          owner: Decimal.new(0),
        }
      );

      await expect(token.burn(1)).fulfilled;

      await expect(token.updateTokenMetadataURI(1, 'blah')).rejectedWith(
        'ERC721: operator query for nonexistent token'
      );
    });

    it('should set the tokenMetadataURI to the URI passed if msg.sender is the owner', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(token.updateTokenMetadataURI(0, 'blah blah')).fulfilled;

      const tokenURI = await token.tokenMetadataURI(0);
      expect(tokenURI).eq('blah blah');
    });

    it('should set the tokenMetadataURI to the URI passed if the msg.sender is approved', async () => {
      const token = await tokenAs(ownerWallet);
      await token.approve(otherWallet.address, 0);

      const otherToken = await tokenAs(otherWallet);
      await expect(otherToken.updateTokenMetadataURI(0, 'blah blah')).fulfilled;

      const tokenURI = await token.tokenMetadataURI(0);
      expect(tokenURI).eq('blah blah');
    });
  });

  describe('#permit', () => {
    let currency: string;

    beforeEach(async () => {
      await deploy();
      currency = await deployCurrency();
      await setupAuction(currency);
    });

    it('should allow a wallet to set themselves to approved with a valid signature', async () => {
      const token = await tokenAs(otherWallet);
      const sig = await signPermit(
        ownerWallet,
        otherWallet.address,
        token.address,
        0,
        // NOTE: We set the chain ID to 1 because of an error with ganache-core: https://github.com/trufflesuite/ganache-core/issues/515
        1
      );
      await expect(token.permit(otherWallet.address, 0, sig)).fulfilled;
      await expect(token.getApproved(0)).eventually.eq(otherWallet.address);
    });

    it('should not allow a wallet to set themselves to approved with an invalid signature', async () => {
      const token = await tokenAs(otherWallet);
      const sig = await signPermit(
        ownerWallet,
        bidderWallet.address,
        token.address,
        0,
        1
      );
      await expect(token.permit(otherWallet.address, 0, sig)).rejectedWith(
        'Media: Signature invalid'
      );
      await expect(token.getApproved(0)).eventually.eq(AddressZero);
    });
  });

  describe('#supportsInterface', async () => {
    beforeEach(async () => {
      await deploy();
    });

    it('should return true to supporting new metadata interface', async () => {
      const token = await tokenAs(otherWallet);
      const interfaceId = ethers.utils.arrayify('0x4e222e66');
      const supportsId = await token.supportsInterface(interfaceId);
      expect(supportsId).eq(true);
    });

    it('should return false to supporting the old metadata interface', async () => {
      const token = await tokenAs(otherWallet);
      const interfaceId = ethers.utils.arrayify('0x5b5e139f');
      const supportsId = await token.supportsInterface(interfaceId);
      expect(supportsId).eq(false);
    });
  });

  describe('#revokeApproval', async () => {
    let currency: string;

    beforeEach(async () => {
      await deploy();
      currency = await deployCurrency();
      await setupAuction(currency);
    });

    it('should revert if the caller is the owner', async () => {
      const token = await tokenAs(ownerWallet);
      await expect(token.revokeApproval(0)).rejectedWith(
        'Media: caller not approved address'
      );
    });

    it('should revert if the caller is the creator', async () => {
      const token = await tokenAs(creatorWallet);
      await expect(token.revokeApproval(0)).rejectedWith(
        'Media: caller not approved address'
      );
    });

    it('should revert if the caller is neither owner, creator, or approver', async () => {
      const token = await tokenAs(otherWallet);
      await expect(token.revokeApproval(0)).rejectedWith(
        'Media: caller not approved address'
      );
    });

    it('should revoke the approval for token id if caller is approved address', async () => {
      const token = await tokenAs(ownerWallet);
      await token.approve(otherWallet.address, 0);
      const otherToken = await tokenAs(otherWallet);
      await expect(otherToken.revokeApproval(0)).fulfilled;
      const approved = await token.getApproved(0);
      expect(approved).eq(ethers.constants.AddressZero);
    });
  });
});
