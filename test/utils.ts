import { BaseErc20Factory, MediaFactory } from '../typechain';
import { BigNumber, BigNumberish, Bytes, Wallet } from 'ethers';
import { MaxUint256, AddressZero } from '@ethersproject/constants';
import { generatedWallets } from '../utils/generatedWallets';
import { JsonRpcProvider } from '@ethersproject/providers';
import { formatUnits } from '@ethersproject/units';
import {
  recoverTypedMessage,
  recoverTypedSignature,
  signTypedData,
} from 'eth-sig-util';
import {
  bufferToHex,
  ecrecover,
  fromRpcSig,
  pubToAddress,
} from 'ethereumjs-util';
import { toUtf8Bytes } from 'ethers/lib/utils';
import { keccak256 } from '@ethersproject/keccak256';

let provider = new JsonRpcProvider();
let [deployerWallet] = generatedWallets(provider);

export async function deployCurrency() {
  const currency = await new BaseErc20Factory(deployerWallet).deploy(
    'test',
    'TEST',
    18
  );
  return currency.address;
}

export async function mintCurrency(
  currency: string,
  to: string,
  value: number
) {
  await BaseErc20Factory.connect(currency, deployerWallet).mint(to, value);
}

export async function approveCurrency(
  currency: string,
  spender: string,
  owner: Wallet
) {
  await BaseErc20Factory.connect(currency, owner).approve(spender, MaxUint256);
}
export async function getBalance(currency: string, owner: string) {
  return BaseErc20Factory.connect(currency, deployerWallet).balanceOf(owner);
}

function revert(message: string) {
  return `VM Exception while processing transaction: revert ${message}`;
}
export function toNumWei(val: BigNumber) {
  return parseFloat(formatUnits(val, 'wei'));
}

export type EIP712Sig = {
  deadline: BigNumberish;
  v: any;
  r: any;
  s: any;
};

export async function signPermit(
  owner: Wallet,
  toAddress: string,
  tokenAddress: string,
  tokenId: number,
  chainId: number
) {
  return new Promise<EIP712Sig>(async (res, reject) => {
    let nonce;
    const mediaContract = MediaFactory.connect(tokenAddress, owner);

    try {
      nonce = (
        await mediaContract.permitNonces(owner.address, tokenId)
      ).toNumber();
    } catch (e) {
      console.error('NONCE', e);
      reject(e);
      return;
    }

    const deadline = Math.floor(new Date().getTime() / 1000) + 60 * 60 * 24; // 24 hours
    const name = await mediaContract.name();

    try {
      const sig = signTypedData(Buffer.from(owner.privateKey.slice(2), 'hex'), {
        data: {
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' },
            ],
            Permit: [
              { name: 'spender', type: 'address' },
              { name: 'tokenId', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          primaryType: 'Permit',
          domain: {
            name,
            version: '1',
            chainId,
            verifyingContract: mediaContract.address,
          },
          message: {
            spender: toAddress,
            tokenId,
            nonce,
            deadline,
          },
        },
      });
      const response = fromRpcSig(sig);
      res({
        r: response.r,
        s: response.s,
        v: response.v,
        deadline: deadline.toString(),
      });
    } catch (e) {
      console.error(e);
      reject(e);
    }
  });
}

export async function signMintWithSig(
  owner: Wallet,
  tokenAddress: string,
  creator: string,
  contentHash: string,
  metadataHash: string,
  creatorShare: BigNumberish,
  chainId: number
) {
  return new Promise<EIP712Sig>(async (res, reject) => {
    let nonce;
    const mediaContract = MediaFactory.connect(tokenAddress, owner);

    try {
      nonce = (await mediaContract.mintWithSigNonces(creator)).toNumber();
    } catch (e) {
      console.error('NONCE', e);
      reject(e);
      return;
    }

    const deadline = Math.floor(new Date().getTime() / 1000) + 60 * 60 * 24; // 24 hours
    const name = await mediaContract.name();

    try {
      const sig = signTypedData(Buffer.from(owner.privateKey.slice(2), 'hex'), {
        data: {
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' },
            ],
            MintWithSig: [
              { name: 'contentHash', type: 'bytes32' },
              { name: 'metadataHash', type: 'bytes32' },
              { name: 'creatorShare', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          primaryType: 'MintWithSig',
          domain: {
            name,
            version: '1',
            chainId,
            verifyingContract: mediaContract.address,
          },
          message: {
            contentHash,
            metadataHash,
            creatorShare,
            nonce,
            deadline,
          },
        },
      });
      const response = fromRpcSig(sig);
      res({
        r: response.r,
        s: response.s,
        v: response.v,
        deadline: deadline.toString(),
      });
    } catch (e) {
      console.error(e);
      reject(e);
    }
  });
}
