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
};
