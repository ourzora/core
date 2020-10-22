pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import { SuperRareV2Migrate } from "../SuperRareV2Migrate.sol";

interface IZoraMigrate {
    function migrate(uint256 tokenId, address creatorAddress, SuperRareV2Migrate.PartialBidShares calldata pbs) external;
}