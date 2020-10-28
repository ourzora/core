pragma solidity ^0.4.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";


/**
* This implementation only works for SuperRareV2
*
*
*/

contract CreatorMigrationStorageLike {
    isApproved(address creatorAddress) external view returns(bool);
}

contract Migrate is IERC721Receiver {

    CreatorMigrationStorageLike public Storage = CreatorMigrationStorageLike('');

    bytes4 private constant _ERC721_RECEIVED = 0x150b7a02;


    function migrate(address tokenAddress, uint256 tokenId, creatorAddress) external {
        IERC721 token = IERC721(tokenAddress);
        // require msg.sender is owner
        require(msg.sender == token.ownerOf(tokenId), "you do not own this NFT");

        // require that creator has approved
        address creator = token.tokenCreator(tokenId);
        require(Storage.isApproved(creator), "creator has not yet approved migration");

        // do a transferFrom
        require(token.getApproved(tokenId) == address(this), 'you must approve() this contract to give it permission to withdraw this nft');
        token.safeTransferFroma(msg.sender, address(this), tokenId, "");

        // do a burn


        // do a mint
    }

    function onERC721Received(address, uint256, bytes) public returns(bytes4) {
        return _ERC721_RECEIVED;
    }
}
