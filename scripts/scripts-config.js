module.exports = {
  localhost: {
    'deploy.js': [
      {
        name: 'Market',
      },
      {
        name: 'Media',
        constructorArgs: ['Market.address'],
      },
    ],
    'initialize.js': [
      {
        contract: 'Market',
        function: 'configure',
        args: ['Media.address'],
      },
    ],
    // "verify.js": ["+REST"]
  },
  goerli: {
    'deploy.js': [
      {
        name: 'Market',
      },
      {
        name: 'Media',
        constructorArgs: ['Market.address'],
      },
    ],
    'initialize.js': [
      {
        contract: 'Market',
        function: 'configure',
        args: ['Media.address'],
      },
    ],
    'verify.js': ['+REST'],
  },
  // "mainnet": {
  //     "deploy.js": [
  //         {
  //             name: "K21"
  //         },
  //         {
  //             name: "CommonNFT"
  //         },
  //         {
  //             name: "BasisPoints"
  //         },
  //         {
  //             name: "DQ",
  //             libraries: {"BasisPoints": "BasisPoints.address"}
  //         },
  //         {
  //             name: "DQURI"
  //         },
  //         {
  //             name: "Base64"
  //         },
  //         {
  //             name: "RQ",
  //             libraries: {"BasisPoints": "BasisPoints.address"},
  //             constructorArgs: ["DQ.address"]
  //         },
  //         {
  //             name: "DispatchLib"
  //         },
  //         {
  //             name: "RQDQURI"
  //         },
  //         {
  //             name: "RQDQ",
  //             libraries: {"DispatchLib": "DispatchLib.address", "BasisPoints": "BasisPoints.address"},
  //             constructorArgs: ["K21.address", "RQDQURI.address"]
  //         },
  //         {
  //             name: "ReservationBook",
  //             libraries: {"DispatchLib": "DispatchLib.address"},
  //             constructorArgs: ["RQDQ.address"]
  //         }
  //     ],
  //     "initialize.js": [
  //         {
  //             contract: "DQ",
  //             function: "initialize",
  //             args: ["RQ.address","DQURI.address"]
  //         },
  //         {
  //             contract: "RQDQ",
  //             function: "initialize",
  //             args: ["ReservationBook.address"]
  //         }
  //     ],
  //     "verify.js": ["+REST"]
  // }
};
