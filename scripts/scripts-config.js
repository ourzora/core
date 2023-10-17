module.exports = {
  localhost: {
    'deploy.js': [
      {
        name: 'Decimal',
      },
      // ,
      // {
      //     name: "CommonNFT"
      // },
      // {
      //     name: "BasisPoints"
      // },
      // {
      //     name: "DQ",
      //     libraries: {"BasisPoints": "BasisPoints.address"}
      // },
      // {
      //     name: "DQURI"
      // },
      // {
      //     name: "Base64"
      // },
      // {
      //     name: "RQ",
      //     libraries: {"BasisPoints": "BasisPoints.address"},
      //     constructorArgs: ["DQ.address"]
      // },
      // {
      //     name: "DispatchLib"
      // },
      // {
      //     name: "RQDQURI"
      // },
      // {
      //     name: "RQDQ",
      //     libraries: {"DispatchLib": "DispatchLib.address", "BasisPoints": "BasisPoints.address"},
      //     constructorArgs: ["K21.address", "RQDQURI.address"]
      // },
      // {
      //     name: "ReservationBook",
      //     libraries: {"DispatchLib": "DispatchLib.address"},
      //     constructorArgs: ["RQDQ.address"]
      // }
    ],
    'initialize.js': [
      // {
      //     contract: "DQ",
      //     function: "initialize",
      //     args: ["RQ.address","DQURI.address"]
      // },
      // {
      //     contract: "RQDQ",
      //     function: "initialize",
      //     args: ["ReservationBook.address"]
      // }
    ],
    // ,
    // "verify.js": ["+REST"]
  },
  goerli: {
    'deploy.js': [
      {
        name: 'Decimal',
      },
      // {
      //     name: "BasisPoints"
      // },
      // {
      //     name: "DQ",
      //     libraries: {"BasisPoints": "BasisPoints.address"}
      // },
      // {
      //     name: "DQURI"
      // },
      // {
      //     name: "Base64"
      // },
      // {
      //     name: "RQ",
      //     libraries: {"BasisPoints": "BasisPoints.address"},
      //     constructorArgs: ["DQ.address"]
      // },
      // {
      //     name: "DispatchLib"
      // },
      // {
      //     name: "RQDQURI"
      // },
      // {
      //     name: "RQDQ",
      //     libraries: {"DispatchLib": "DispatchLib.address", "BasisPoints": "BasisPoints.address"},
      //     constructorArgs: ["K21.address", "RQDQURI.address"]
      // },
      // {
      //     name: "ReservationBook",
      //     libraries: {"DispatchLib": "DispatchLib.address"},
      //     constructorArgs: ["RQDQ.address"]
      // }
    ],
    // "initialize.js": [
    //     {
    //         contract: "DQ",
    //         function: "initialize",
    //         args: ["RQ.address","DQURI.address"]
    //     },
    //     {
    //         contract: "RQDQ",
    //         function: "initialize",
    //         args: ["ReservationBook.address"]
    //     }
    // ],
    'verify.js': ['Decimal'],
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
