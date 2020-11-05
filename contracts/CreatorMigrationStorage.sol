pragma solidity 0.6.8;

import {ECDSA} from "@openzeppelin/contracts/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract CreatorMigrationStorage is Ownable, AccessControl {

    mapping (address => bool ) private _approvedCreators;
    mapping (uint256 => mapping(address => uint256)) public tokenLink;
    bytes32 public message = 0x00818a54cf83407b094e3c47a79f3ae6bdbba59933701f01b859eac6433b00c3; // keccak256("invert");

    bytes32 public LINKER_ROLE = keccak256("LINKER_ROLE");

    constructor()
        public
        Ownable()
    {
        _setupRole(LINKER_ROLE, msg.sender);
    }

    modifier onlyLinkerRole(){
        require(hasRole(LINKER_ROLE, msg.sender), "CreatorMigrationStorage: caller must have LINKER_ROLE");
        _;
    }

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

    function addTokenLink(uint256 invertTokenId, address oldTokenAddress, uint256 oldTokenId)
        external
        onlyLinkerRole()
    {
        tokenLink[invertTokenId][oldTokenAddress] = oldTokenId;
    }
}
