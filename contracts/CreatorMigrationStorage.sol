pragma solidity 0.6.8;

import {ECDSA} from "@openzeppelin/contracts/cryptography/ECDSA.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract CreatorMigrationStorage is AccessControl {

    struct PreviousTokenInfo {
        address tokenContract;
        uint256 tokenId;
    }

    mapping (address => bool ) private _approvedCreators;
    mapping (uint256 => PreviousTokenInfo) public previousTokenInfo;
    bytes32 public message = 0x00818a54cf83407b094e3c47a79f3ae6bdbba59933701f01b859eac6433b00c3; // keccak256("invert");

    bytes32 public WRITE_STORAGE_ROLE = keccak256("WRITE_STORAGE_ROLE");

    constructor()
        public
    {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(WRITE_STORAGE_ROLE, msg.sender);
    }

    modifier onlyWriteStorageRole(){
        require(hasRole(WRITE_STORAGE_ROLE, msg.sender), "CreatorMigrationStorage: caller must have WRITE_STORAGE_ROLE");
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

    function addPreviousTokenInfo(uint256 invertTokenId, address prevTokenContract, uint256 prevTokenId)
        external
        onlyWriteStorageRole()
    {
        PreviousTokenInfo memory prev = PreviousTokenInfo({
            tokenContract: prevTokenContract,
            tokenId: prevTokenId
        });

        previousTokenInfo[invertTokenId] = prev;
    }
}
