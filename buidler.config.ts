import { BuidlerConfig, usePlugin } from '@nomiclabs/buidler/config'


usePlugin("@nomiclabs/buidler-waffle");

// You have to export an object to set up your config
// This object can have the following optional entries:
// defaultNetwork, networks, solc, and paths.
// Go to https://buidler.dev/config/ to learn more
const config: BuidlerConfig = {
  solc: {
    version: "0.6.8",
  },
}

export default config