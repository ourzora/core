pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";
import {EnumerableSet} from  "@openzeppelin/contracts/utils/EnumerableSet.sol";
import {Counters} from  "@openzeppelin/contracts/utils/Counters.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Decimal} from "./Decimal.sol";
import {InvertToken} from "./InvertToken.sol";

contract InvertAuction {
    using Counters for Counters.Counter;
    using SafeMath for uint256;


    uint256 constant ONE_HUNDRED = 100;

    address private _tokenContract;
    address private _owner;
    bool private _configured;

    // Mapping from token to mapping from bidder to bid
    mapping(uint256 => mapping(address => Bid)) private _tokenBidders;

    // Mapping from token to the bid shares for the token
    mapping(uint256 => BidShares) private _bidShares;

    // Mapping from token to the current ask for the token
    mapping(uint256 => Ask) private _tokenAsks;


    modifier onlyExistingToken(uint256 tokenId) {
        address owner = IERC721(_tokenContract).ownerOf(tokenId);
        require(owner != address(0), "InvertAuction: Token does not exist");
        _;
    }

    modifier onlyApprovedOrOwner(address spender, uint256 tokenId) {
        address owner = IERC721(_tokenContract).ownerOf(tokenId);
        require(spender == owner || IERC721(_tokenContract).getApproved(tokenId) == spender || IERC721(_tokenContract).isApprovedForAll(owner, spender), "InvertAuction: not approved or owner");
        _;
    }

    modifier onlyTransferAllowanceAndSolvent (address spender, address currencyAddress, uint256 amount) {
        IERC20 token = IERC20(currencyAddress);
        require(token.allowance(spender, address(this)) >= amount, "Invert: allowance not high enough to transfer token.");
        require(token.balanceOf(spender) >= amount, "Invert: Not enough funds to transfer token.");
        _;
    }

    modifier onlyTokenCaller() {
        require(_tokenContract == msg.sender, "InvertAuction: Only token contract");
        _;
    }

    constructor() public {
        _owner = msg.sender;
        _configured = false;
    }

    function configure(address tokenContract) public {
        require(msg.sender == _owner, "InvertAuction: Only owner");
        require(_configured == false, "InvertAuction: Already configured");

        _tokenContract = tokenContract;
        _configured = true;
    }

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

    struct Bid {
        // Amount of the currency being bid
        uint256 amount;
        // Address to the ERC20 token being used to bid
        address currency;
        // Number of decimals on the ERC20 token
        uint256 currencyDecimals;
        // Address of the bidder
        address bidder;
    }

    struct Ask {
        // Amount of the currency being asked
        uint256 amount;
        // Address to the ERC20 token being asked
        address currency;
        // Number of decimals on the ERC20 token
        uint256 currencyDecimals;
    }

    struct BidShares {
        // % of sale value that goes to the _previous_ owner of the nft
        Decimal.D256 prevOwner;

        // % of sale value that goes to the original creator of the nft
        Decimal.D256 creator;

        // % of sale value that goes to the seller (current owner) of the nft
        Decimal.D256 owner;
    }

    function bidForTokenBidder(uint256 tokenId, address bidder) external view returns (Bid memory) {
        return _tokenBidders[tokenId][bidder];
    }

    function currentAskForToken(uint256 tokenId)
    external
    view
    returns (Ask memory)
    {
        return _tokenAsks[tokenId];
    }

    function addBidShares(uint256 tokenId, BidShares memory bidShares)
        public
        onlyTokenCaller
    {
        _bidShares[tokenId] = bidShares;
    }

    function setAsk(uint tokenId, Ask memory ask)
        public
        onlyExistingToken(tokenId)
        onlyApprovedOrOwner(msg.sender, tokenId)
    {
        _tokenAsks[tokenId] = ask;
    }

    /**
    * @dev Sets the bid on a particular token for a bidder. The token being used to bid
    * is transferred from the bidder to this contract to be held until removed or accepted.
    * If another bid already exists for the bidder, it is refunded.
    */
    function setBid(uint256 tokenId, Bid memory bid)
        onlyExistingToken(tokenId)
        onlyTransferAllowanceAndSolvent(msg.sender, bid.currency, bid.amount)
        public
    {
        require(
            minBidForToken(tokenId) <= bid.amount,
            "Invert: Bid too small for share splitting"
        );

        // TODO: Move this to a _setBid that accepts the bidder
        Bid storage existingBid = _tokenBidders[tokenId][msg.sender];

        if (existingBid.amount > 0) {
            removeBid(tokenId);
        }

        IERC20 token = IERC20(bid.currency);
        require(token.transferFrom(msg.sender, address(this), bid.amount), "Invert: transfer failed");
        _tokenBidders[tokenId][msg.sender] = Bid(bid.amount, bid.currency, bid.currencyDecimals, msg.sender);

        // If the bid is over the ask price and the currency is the same, automatically accept the bid
        if (bid.currency == _tokenAsks[tokenId].currency && bid.amount >= _tokenAsks[tokenId].amount) {
            // Finalize exchange
            _finalizeNFTTransfer(tokenId, bid.bidder);
        }
    }

    /**
    * @dev Removes the bid on a particular token for a bidder. The bid amount
    * is transferred from this contract to the bidder, if they have a bid placed.
    */
    function removeBid(uint256 tokenId)
        onlyExistingToken(tokenId)
        public
    {
        // TODO this will break, make it onlyTokenContract and pass in msg sender
        Bid storage bid =  _tokenBidders[tokenId][msg.sender];
        uint256 bidAmount = bid.amount;
        address bidCurrency = bid.currency;

        require(bid.amount > 0, "Invert: cannot remove bid amount of 0");

        IERC20 token = IERC20(bidCurrency);

        delete _tokenBidders[tokenId][msg.sender];
        require(token.transfer(msg.sender, bidAmount), "Invert: token transfer failed");
    }

    /**
    * @dev Accepts a bid from a particular bidder. Can only be called by the token
    * owner or an approved address. See {_finalizeNFTTransfer}
    */
    function acceptBid(uint256 tokenId, address bidder)
    // TODO only token contract, pass in original message sender
    onlyApprovedOrOwner(msg.sender, tokenId)
    public
    {
        Bid storage bid = _tokenBidders[tokenId][bidder];
        require(bid.amount > 0, "Invert: cannot accept bid of 0");

        _finalizeNFTTransfer(tokenId, bidder);
    }

    /**
    * @dev Given a token idea, calculate the minimum bid amount required such that the bid shares can be split exactly.
    * For example, if the bid fee % is all whole units, the minimum amount would be 100
    * if the bid fee % has one decimal place , the minimum amount would be 1000
    */
    function minBidForToken(uint256 tokenId)
    public
    view
    onlyExistingToken(tokenId)
    returns (uint256)
    {
        BidShares memory bidShares = _bidShares[tokenId];

        uint256 creatorMinCommonDenominator = 0;
        uint256 ownerMinCommonDenominator = 0;
        uint256 prevOwnerMinCommonDenominator = 0;

        for(uint i=Decimal.BASE_POW; i >= 0; i--) {
            if(bidShares.creator.value % uint256(10**i) == 0) {
                creatorMinCommonDenominator = uint256(ONE_HUNDRED).mul(10 ** (Decimal.BASE_POW-i));
                break;
            }
        }
        for(uint i=Decimal.BASE_POW; i >= 0; i--) {
            if(bidShares.owner.value % uint256(10**i) == 0) {
                ownerMinCommonDenominator = uint256(ONE_HUNDRED).mul(10 ** (Decimal.BASE_POW-i));
                break;
            }
        }
        for(uint i=Decimal.BASE_POW; i >= 0; i--) {
            if(bidShares.prevOwner.value % uint256(10**i) == 0) {
                prevOwnerMinCommonDenominator = uint256(ONE_HUNDRED).mul(10 ** (Decimal.BASE_POW-i));
                break;
            }
        }

        uint256 minBid = Math.max(Math.max(creatorMinCommonDenominator, ownerMinCommonDenominator),  prevOwnerMinCommonDenominator);

        return Math.min((ONE_HUNDRED * 10**Decimal.BASE_POW), minBid);
    }

    /**
    * @dev Validates that the bid shares provided sum to 100
    */
    function isValidBidShares(BidShares memory bidShares) public pure returns (bool){
        uint256 hundredPercent = uint256(100).mul(Decimal.BASE);
        uint256 creatorShare = bidShares.creator.value;
        uint256 ownerShare = bidShares.owner.value;
        uint256 prevOwnerShare = bidShares.prevOwner.value;
        uint256 shareSum = creatorShare.add(ownerShare).add(prevOwnerShare);
        return shareSum == hundredPercent;
    }

    function _splitShare(Decimal.D256 memory sharePercentage, Bid memory bid) public pure returns (uint256) {
        return Decimal.mul(bid.amount, sharePercentage).div(100);
    }

    function _finalizeNFTTransfer(uint256 tokenId, address bidder) internal {
        Bid storage bid = _tokenBidders[tokenId][bidder];
        BidShares memory bidShares = _bidShares[tokenId];

        IERC20 token = IERC20(bid.currency);

        require(token.transfer(IERC721(_tokenContract).ownerOf(tokenId), _splitShare(bidShares.owner, bid)), "Invert: token transfer to owner failed");
        require(token.transfer(InvertToken(_tokenContract).tokenCreator(tokenId), _splitShare(bidShares.creator, bid)), "Invert: token transfer to creator failed");
        require(token.transfer(InvertToken(_tokenContract).tokenPreviousOwner(tokenId), _splitShare(bidShares.prevOwner, bid)), "Invert: token transfer to prevOwner failed");

        InvertToken(_tokenContract).auctionTransfer(tokenId, bidder);

        delete _tokenAsks[tokenId];
        delete _tokenBidders[tokenId][bidder];
    }

}