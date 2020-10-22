pragma solidity 0.6.8;

interface ICreatorMigrationStorage {
    function approve() external;
    function isApproved(address creatorAddress) external view returns(bool);
}
