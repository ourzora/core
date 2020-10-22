import { BigNumber } from 'ethers';

export default class Decimal {
  static new(value: number) {
    const decimalPlaces = countDecimals(value);
    const difference = 18 - decimalPlaces;
    const zeros = BigNumber.from(10).pow(difference);
    const abs = BigNumber.from(`${value.toString().replace('.', '')}`);
    return { value: abs.mul(zeros) };
  }

  static raw(value: number) {
    return { value: BigNumber.from(value) };
  }
}

function countDecimals(value) {
  if (Math.floor(value) !== value)
    return value.toString().split('.')[1].length || 0;
  return 0;
}
