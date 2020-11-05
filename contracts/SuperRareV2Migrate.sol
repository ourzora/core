pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IZoraMigrate} from "./interfaces/IZoraMigrate.sol";
import {ICreatorMigrationStorage} from "./interfaces/ICreatorMigrationStorage.sol";
import {IInvertToken} from "./interfaces/IInvertToken.sol";
import {ISuperRareV2} from "./interfaces/ISuperRareV2.sol";
import {Decimal} from "./Decimal.sol";
import {InvertAuction} from "./InvertAuction.sol";

/**
* This implementation only works for SuperRareV2
*
*
*/
contract SuperRareV2Migrate is IZoraMigrate, IERC721Receiver {

    struct PartialBidShares {
        // % of sale value that goes to the _previous_ owner of the nft
        Decimal.D256 prevOwner;

        // % of sale value that goes to the seller (current owner) of the nft
        Decimal.D256 owner;
    }

    ICreatorMigrationStorage private _storage;
    IInvertToken private _invert;
    ISuperRareV2 private _superrare;

    bytes4 private constant _ERC721_RECEIVED = 0x150b7a02;
    Decimal.D256 private defaultCreatorShare = Decimal.D256({value: 10000000000000000000});

    constructor(address storageAddress, address superrareAddress, address invertAddress) public {
        _storage = ICreatorMigrationStorage(storageAddress);
        _superrare = ISuperRareV2(superrareAddress);
        _invert = IInvertToken(invertAddress);
    }

    modifier onlyOwnerAndAllowance(address owner, uint256 tokenId) {
        require(owner == _superrare.ownerOf(tokenId), "SuperRareV2Migrate: you must own this NFT to attempt to migrate it to Zora");
        require(_superrare.getApproved(tokenId) == address(this), 'SuperRareV2Migrate: you must approve() this contract to give it permission to withdraw this NFT');
        _;
    }

    function migrate(uint256 oldTokenId, address creatorAddress, PartialBidShares calldata pbs)
        external
        override
        onlyOwnerAndAllowance(msg.sender, oldTokenId)
    {
        address creator = _superrare.tokenCreator(oldTokenId);
        require(_storage.isApproved(creator), "SuperRareV2Migrate: creator has not yet approved the migration of their creations to Zora");
        _superrare.safeTransferFrom(msg.sender, address(this), oldTokenId);

        string memory tokenURI = _superrare.tokenURI(oldTokenId);

        InvertAuction.BidShares memory bidShare = InvertAuction.BidShares({
            creator: defaultCreatorShare,
            owner: pbs.owner,
            prevOwner: pbs.prevOwner
        });

        _invert.mint(creator, tokenURI, bidShare);
        _storage.addTokenLink(_invert.totalSupply()-1, address(_superrare), oldTokenId);
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes memory data)
        public
        override
        returns(bytes4) {
        return _ERC721_RECEIVED;
    }
}
