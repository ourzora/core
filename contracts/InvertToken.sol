pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/ERC721Burnable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {SafeMath} from "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import {Math} from "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import {Decimal} from "./Decimal.sol";
import "./InvertAuction.sol";

contract InvertToken is ERC721Burnable {
    using SafeMath for uint256;

    // Address for the auction
    address private _auctionContract;

    // Mapping from token to previous owner of the token
    mapping(uint256 => address) private _previousTokenOwners;

    // Mapping from token id to creator address
    mapping (uint256 => address) private _tokenCreators;

    event BidCreated(
        uint256 tokenId,
        address bidder
    );
    event AskCreated(
        uint256 tokenId,
        address owner,
        uint256 amount,
        address currency,
        uint256 currencyDecimals
    );

    modifier onlyExistingToken (uint256 tokenId) {
        require(_exists(tokenId), "InvertToken: Nonexistant token");
        _;
    }

    modifier onlyApprovedOrOwner(address spender, uint256 tokenId) {
        require(_isApprovedOrOwner(spender, tokenId), "InvertToken: Only approved or owner");
        _;
    }

    modifier onlyAuction() {
        require(msg.sender == _auctionContract, "Invert: only auction contract");
        _;
    }

    constructor(address auctionContract) public ERC721("Invert", "INVERT") {
        _auctionContract = auctionContract;
    }

    function auctionTransfer(uint256 tokenId, address bidder)
        public
        onlyAuction
    {
        _previousTokenOwners[tokenId] = ownerOf(tokenId);
        _safeTransfer(ownerOf(tokenId), bidder, tokenId, '');
    }

    function tokenCreator(uint256 tokenId) public returns(address) {
        return _tokenCreators[tokenId];
    }

    function tokenPreviousOwner(uint256 tokenId) public returns(address) {
        return _previousTokenOwners[tokenId];
    }

    function setAsk(uint256 tokenId, InvertAuction.Ask memory ask) public
        onlyApprovedOrOwner(msg.sender, tokenId)
        onlyExistingToken(tokenId)
    {
        InvertAuction(_auctionContract).setAsk(tokenId, ask);
    }

    function setBid(uint256 tokenId, InvertAuction.Bid memory bid)
        onlyExistingToken(tokenId)
        public
    {
        InvertAuction(_auctionContract).setBid(tokenId, bid);
    }

    function removeBid(uint256 tokenId)
        onlyExistingToken(tokenId)
        public
    {
        InvertAuction(_auctionContract).removeBid(tokenId, msg.sender);
    }

    function acceptBid(uint256 tokenId, address bidder)
        onlyExistingToken(tokenId)
        onlyApprovedOrOwner(msg.sender, tokenId)
        public
    {
        InvertAuction(_auctionContract).acceptBid(tokenId, bidder);
    }
}