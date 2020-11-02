import { BaseErc20Factory } from '../typechain';
import { BigNumber, Wallet } from 'ethers';
import { MaxUint256 } from '@ethersproject/constants';
import { generatedWallets } from '../utils/generatedWallets';
import { JsonRpcProvider } from '@ethersproject/providers';
import { formatUnits } from '@ethersproject/units';

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
