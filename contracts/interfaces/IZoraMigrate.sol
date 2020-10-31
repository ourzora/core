pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../SuperRareMigrate.sol";

interface IZoraMigrate {
    function migrate(address tokenAddress, uint256 tokenId, address creatorAddress, SuperRareMigrate.PartialBidShares calldata pbs) external;
}