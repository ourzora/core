pragma solidity 0.6.8;

interface ICreatorMigrationStorage {
    function approve() external;
    function isApproved(address creatorAddress) external view returns(bool);
    function addTokenLink(uint256 invertTokenId, address oldTokenAddress, uint256 oldTokenId) external;
}
