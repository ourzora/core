pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IZoraMigrate} from "./interfaces/IZoraMigrate.sol";
import {ICreatorMigrationStorage} from "./interfaces/ICreatorMigrationStorage.sol";
import {IInvertToken} from "./interfaces/IInvertToken.sol";
import {Decimal} from "./Decimal.sol";
import {InvertAuction} from "./InvertAuction.sol";
//import "./InvertToken.sol";


/**
* This implementation only works for SuperRareV2
*
*
*/

interface ISuperRareV2 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function deleteToken(uint256 tokenId) external;
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function tokenCreator(uint256 tokenId) external view returns (address);
}

contract SuperRareMigrate is IZoraMigrate, IERC721Receiver {

    struct PartialBidShares {
        // % of sale value that goes to the _previous_ owner of the nft
        Decimal.D256 prevOwner;

        // % of sale value that goes to the seller (current owner) of the nft
        Decimal.D256 owner;
    }

    ICreatorMigrationStorage private _storage;
    IInvertToken private _invert;
    bytes4 private constant _ERC721_RECEIVED = 0x150b7a02;
    Decimal.D256 private defaultCreatorShare = Decimal.D256({value: 10000000000000000000});

    constructor(address storageAddress, address invertAddress) public {
        _storage = ICreatorMigrationStorage(storageAddress);
        _invert = IInvertToken(invertAddress);
    }

    modifier onlyOwnerAndAllowance(address owner, address tokenAddress, uint256 tokenId) {
        IERC721 token = IERC721(tokenAddress);
        require(owner == token.ownerOf(tokenId), "you do not own this NFT");
        require(token.getApproved(tokenId) == address(this), 'you must approve() this contract to give it permission to withdraw this nft');
        _;
    }

    function migrate(address tokenAddress, uint256 tokenId, address creatorAddress, PartialBidShares calldata pbs)
        external
        override
        onlyOwnerAndAllowance(msg.sender, tokenAddress, tokenId)
    {
        ISuperRareV2 superRare = ISuperRareV2(tokenAddress);

        // require that creator has approved
        address creator = superRare.tokenCreator(tokenId);
        require(_storage.isApproved(creator), "creator has not yet approved migration");

        // do a transferFrom
        superRare.safeTransferFrom(msg.sender, address(this), tokenId);

        // fetch the tokenURI
        string memory tokenURI = superRare.tokenURI(tokenId);

        InvertAuction.BidShares memory bidShare = InvertAuction.BidShares({
            creator: defaultCreatorShare,
            owner: pbs.owner,
            prevOwner: pbs.prevOwner
        });

        // do a mint
        _invert.mint(creator, tokenURI, bidShare);

        // do a burn
        superRare.deleteToken(tokenId);
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes memory data)
        public
        override
        returns(bytes4) {
        return _ERC721_RECEIVED;
    }
}
