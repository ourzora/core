pragma solidity ^0.4.0;

contract CreatorMigrationStorage {

    mapping (address => bool ) private _approvedCreators;

    function approve()
        external
    {
        _approvedCreators[msg.sender] = true;
    }

    function isApproved(address creatorAddress)
        external
        view
        returns(bool)
    {
        if (_approvedCreators[creatorAddress] == true){
            return true;
        }

        return false;
    }
}
