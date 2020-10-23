import { BigNumber } from 'ethers/utils';

export default class Decimal {
  static new(value: number) {
    const decimalPlaces = countDecimals(value);
    const difference = 18 - decimalPlaces;
    const zeros = new BigNumber(10).pow(difference);
    const abs = new BigNumber(`${value.toString().replace('.', '')}`);
    return { value: abs.mul(zeros) };
  }

  static raw(value: number) {
    return { value: new BigNumber(value) };
  }
}

function countDecimals(value) {
  if (Math.floor(value) !== value)
    return value.toString().split('.')[1].length || 0;
  return 0;
}
