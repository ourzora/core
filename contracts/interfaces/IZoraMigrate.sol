pragma solidity 0.6.8;

interface IZoraMigrate {
    function migrate(address tokenAddress, uint256 tokenId, creatorAddress) external;
}