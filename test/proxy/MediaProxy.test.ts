import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Blockchain } from '../../utils/Blockchain';
import { generatedWallets } from '../../utils/generatedWallets';
import { MarketFactory } from '../../typechain/MarketFactory';
import { Bytes, ethers, Wallet } from 'ethers';
import Decimal from '../../utils/Decimal';
import { BigNumber, BigNumberish } from 'ethers';
import { formatUnits } from '@ethersproject/units';
import { AddressZero, MaxUint256 } from '@ethersproject/constants';
import { BaseErc20Factory } from '../../typechain/BaseErc20Factory';
import { Market } from '../../typechain/Market';
import { Media, MediaFactory, MediaProxyFactory } from '../../typechain';
import { sha256 } from 'ethers/lib/utils';
import { signPermit, toNumWei, Permit } from '../utils';

chai.use(asPromised);

let provider = new JsonRpcProvider();
let blockchain = new Blockchain(provider);

type DecimalValue = { value: BigNumber };

type BidShares = {
  owner: DecimalValue;
  prevOwner: DecimalValue;
  creator: DecimalValue;
};

type ProxyPermit = {
  spender: string,
  tokenId: BigNumberish,
  deadline: BigNumberish,
  v: any,
  r: any,
  s: any
}

type Ask = {
  currency: string;
  amount: BigNumberish;
  sellOnFee: { value: BigNumberish };
};


describe("MediaProxy", async () => {

  let [
    deployerWallet,
    creatorWallet,
    bidderWallet,
    mockTokenWallet,
    otherWallet,
  ] = generatedWallets(provider);

  let marketAddress: string;
  let mediaAddress: string;
  let currencyAddress: string;
  let proxyAddress: string;

  let metadataHex: string;
  let metadataHash: string;
  let metadataHashBytes: Bytes;

  let contentHex: string;
  let contentHash: string;
  let contentHashBytes: Bytes;

  let otherContentHex: string;
  let otherContentHash: string;
  let otherContentHashBytes: Bytes;

  let defaultBidShares = {
    prevOwner: Decimal.new(10),
    owner: Decimal.new(80),
    creator: Decimal.new(10),
  };


  async function deployMarket() {
    const auction = await (
      await new MarketFactory(deployerWallet).deploy()
    ).deployed();
    marketAddress = auction.address;
  }

  async function configureMarket(mediaAddress: string) {
    return MarketFactory.connect(marketAddress, deployerWallet).configure(
      mediaAddress
    );
  }

  async function deployMedia(){
    const media = await (
      await new MediaFactory(deployerWallet).deploy(marketAddress)
    ).deployed();
    mediaAddress = media.address;
  }

  async function deployCurrency() {
    const currency = await new BaseErc20Factory(deployerWallet).deploy(
      'test',
      'TEST',
      18
    );
    currencyAddress = currency.address;
  }

  async function mediaAs(wallet: Wallet) {
    return MediaFactory.connect(mediaAddress, wallet);
  }

  async function marketAs(wallet: Wallet) {
    return MarketFactory.connect(marketAddress, wallet);
  }

  async function proxyAs(wallet: Wallet) {
    return MediaProxyFactory.connect(proxyAddress, wallet);
  }

  async function deployProxy() {
    const proxy = await (
      await new MediaProxyFactory(deployerWallet).deploy(mediaAddress)
    ).deployed()
    proxyAddress = proxy.address;
  }

  async function mintMedia(
    media: Media,
    creator: string,
    metadataURI: string,
    tokenURI: string,
    contentHash: Bytes,
    metadataHash: Bytes,
    shares: BidShares
  ) {
    return media.mint(
      creator,
      tokenURI,
      metadataURI,
      contentHash,
      metadataHash,
      shares
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
  })


  describe("#setAsk", async () => {

    beforeEach(async () => {
      await deployMarket();
      await deployMedia();
      await configureMarket(mediaAddress);
      await deployCurrency();
      await deployProxy();

      const media = await mediaAs(creatorWallet);
      await mintMedia(
        media,
        creatorWallet.address,
        "idk",
        "idk2",
        contentHashBytes,
        metadataHashBytes,
        defaultBidShares
      );
    })

    it("should accept valid permit, set ask on behalf of owner, then reset approvals", async () => {
      const media = await mediaAs(creatorWallet);
      const sig = await signPermit(creatorWallet, proxyAddress, mediaAddress, 0, 1);

      const proxyPermit = {
        spender: proxyAddress,
        tokenId: 0,
        deadline: sig.deadline,
        v: sig.v,
        r: sig.r,
        s: sig.s
      }

      const ask = {
        amount: 100,
        currency: currencyAddress,
        sellOnFee: Decimal.new(10),
      }

      const proxy = await proxyAs(otherWallet);
      await expect(proxy.setAsk(proxyPermit, ask)).fulfilled;

      await expect(media.getApproved(0)).eventually.eq(ethers.constants.AddressZero);
      const market = await marketAs(otherWallet);

      const curAsk = await market.currentAskForToken(0);
      expect(curAsk.currency).eq(currencyAddress);
      expect(toNumWei(curAsk.amount)).eq(ask.amount);
      expect(toNumWei(curAsk.sellOnFee.value)).eq(toNumWei(ask.sellOnFee.value));
    });

    it("should revert if the wrong spender address is specified in the permit", async () => {
      const sig = await signPermit(creatorWallet, proxyAddress, mediaAddress, 0, 1);

      const proxyPermit = {
        spender: creatorWallet.address,
        tokenId: 0,
        deadline: sig.deadline,
        v: sig.v,
        r: sig.r,
        s: sig.s
      }

      const ask = {
        amount: 100,
        currency: currencyAddress,
        sellOnFee: Decimal.new(10),
      }

      const proxy = await proxyAs(otherWallet);
      await expect(proxy.setAsk(proxyPermit, ask)).rejectedWith(
        "Media: Signature invalid"
      );
    });

    it("should revert if the wrong spender address is specified in both permit and signature", async () => {
      const sig = await signPermit(creatorWallet, creatorWallet.address, mediaAddress, 0, 1);

      const proxyPermit = {
        spender: creatorWallet.address,
        tokenId: 0,
        deadline: sig.deadline,
        v: sig.v,
        r: sig.r,
        s: sig.s
      }

      const ask = {
        amount: 100,
        currency: currencyAddress,
        sellOnFee: Decimal.new(10),
      }

      const proxy = await proxyAs(otherWallet);
      await expect(proxy.setAsk(proxyPermit, ask)).rejectedWith(
        "Media: Only approved or owner"
      );

      const media = await mediaAs(creatorWallet);
      const approved = await media.getApproved(0)
      await expect(approved).eq(ethers.constants.AddressZero);
    });

    it("should revert if a non existent tokenId is specified", async () => {
      const sig = await signPermit(creatorWallet, proxyAddress, mediaAddress, 1, 1);

      const proxyPermit = {
        spender: proxyAddress,
        tokenId: 1,
        deadline: sig.deadline,
        v: sig.v,
        r: sig.r,
        s: sig.s,
      }

      const ask = {
        amount: 100,
        currency: currencyAddress,
        sellOnFee: Decimal.new(10),
      }

      const proxy = await proxyAs(otherWallet);
      await expect(proxy.setAsk(proxyPermit, ask)).rejectedWith(
        "ERC721: operator query for nonexistent token"
      );
    });

    it("should revert if a tokenId that is not owned by creatorWallet is specified", async () => {
      const media = await mediaAs(otherWallet);

      await mintMedia(
        media,
        otherWallet.address,
        "idk",
        "idk2",
        otherContentHashBytes,
        metadataHashBytes,
        defaultBidShares
      );

      const sig = await signPermit(creatorWallet, proxyAddress, mediaAddress, 1, 1);

      const proxyPermit = {
        spender: proxyAddress,
        tokenId: 1,
        deadline: sig.deadline,
        v: sig.v,
        r: sig.r,
        s: sig.s
      }

      const ask = {
        amount: 100,
        currency: currencyAddress,
        sellOnFee: Decimal.new(10),
      }

      const proxy = await proxyAs(otherWallet);
      await expect(proxy.setAsk(proxyPermit, ask)).rejectedWith(
        "Media: Signature invalid"
      );
    });
  })



})


