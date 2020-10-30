pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "/interfaces/IZoraMigrate.sol";
import "/interfaces/ICreatorMigrationStorage";


/**
* This implementation only works for SuperRareV2
*
*
*/

interface ISuperRareV2 {
    function safeTransferFrom(address from, address to, uint256 tokenId) public;
    function deleteToken(uint256 tokenId) public;
}

contract SuperRareMigrate is IZoraMigrate, IERC721Receiver {

    address private _storage;
    address private _invert;

    bytes4 private constant _ERC721_RECEIVED = 0x150b7a02;

    constructor(address storageAddress) {
        _storage = storageAddress;
    }

    modifier onlyOwnerAndAllowance(address owner, address tokenAddress, uint256 tokenId) {
        IERC721 token = IERC721(tokenAddress);
        require(owner == token.ownerOf(tokenId), "you do not own this NFT");
        require(token.getApproved(tokenId) == address(this), 'you must approve() this contract to give it permission to withdraw this nft');
    }

    function migrate(address tokenAddress, uint256 tokenId, creatorAddress) external {
        ISuperRareV2 token = ISuperRareV2(tokenAddress);

        // require that creator has approved
        address creator = token.tokenCreator(tokenId);
        require(ICreatorMigrateStorage(_storage).isApproved(creator), "creator has not yet approved migration");

        // do a transferFrom
        token.safeTransferFrom(msg.sender, address(this), tokenId, "");

        // do a burn
        token.deleteToken(tokenId);

        // do a mint
    }

    function onERC721Received(address, uint256, bytes) public returns(bytes4) {
        return _ERC721_RECEIVED;
    }
}
