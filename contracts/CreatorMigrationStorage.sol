pragma solidity 0.6.8;

import {ECDSA} from "@openzeppelin/contracts/cryptography/ECDSA.sol";

contract CreatorMigrationStorage {

    mapping (address => bool ) private _approvedCreators;
    bytes32 public message = 0x00818a54cf83407b094e3c47a79f3ae6bdbba59933701f01b859eac6433b00c3;
    // keccak("invert");

    function submitApproval(address creatorAddress, bytes calldata signature)
        external
    {
        bytes32 normalizedMessage = ECDSA.toEthSignedMessageHash(message);
        require(ECDSA.recover(normalizedMessage, signature) == creatorAddress, "invalid signature");

        _approvedCreators[creatorAddress] = true;
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
