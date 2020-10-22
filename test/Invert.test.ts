import { generatedWallets } from '../utils/generatedWallets'
import { Blockchain } from '../utils/Blockchain'

import { Invert } from '../typechain/Invert'
import { InvertFactory } from '../typechain/InvertFactory'
import { JsonRpcProvider } from 'ethers/providers'
import chai, { expect } from 'chai'
import asPromised from 'chai-as-promised'

chai.use(asPromised)


let provider = new JsonRpcProvider()
let blockchain = new Blockchain(provider);

describe('Invert', () => {
  let [
    deployerWallet,
    creatorWallet,
    ownerWallet,
    bidderWallet,
    otherWallet
  ] = generatedWallets(provider)

  beforeEach(async () => {
    await blockchain.resetAsync()
  })

  describe('#constructor', () => {
    it('should be able to deploy', async () => {
      await expect((await new InvertFactory(deployerWallet).deploy()).deployed()).to.eventually.be.not.null
    })
  })
})