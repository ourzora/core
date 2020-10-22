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

    address public tokenContract;
    address private _owner;
    bool private _configured;

    // Mapping from token to mapping from bidder to bid
    mapping(uint256 => mapping(address => Bid)) private _tokenBidders;

    // Mapping from token to the bid shares for the token
    mapping(uint256 => BidShares) private _bidShares;

    // Mapping from token to the current ask for the token
    mapping(uint256 => Ask) private _tokenAsks;


    modifier onlyTransferAllowanceAndSolvent (address spender, address currencyAddress, uint256 amount) {
        IERC20 token = IERC20(currencyAddress);
        require(token.allowance(spender, address(this)) >= amount, "InvertAuction: allowance not high enough to transfer token.");
        require(token.balanceOf(spender) >= amount, "InvertAuction: Not enough funds to transfer token.");
        _;
    }

    modifier onlyTokenCaller() {
        require(tokenContract == msg.sender, "InvertAuction: Only token contract");
        _;
    }

    constructor() public {
        _owner = msg.sender;
        _configured = false;
    }

    function configure(address tokenContractAddress) public {
        require(msg.sender == _owner, "InvertAuction: Only owner");
        require(_configured == false, "InvertAuction: Already configured");

        tokenContract = tokenContractAddress;
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
        address currency
    );

    struct Bid {
        // Amount of the currency being bid
        uint256 amount;
        // Address to the ERC20 token being used to bid
        address currency;
        // Address of the bidder
        address bidder;
        // % of the next sale to award the previous owner
        Decimal.D256 sellOnFee;
    }

    struct Ask {
        // Amount of the currency being asked
        uint256 amount;
        // Address to the ERC20 token being asked
        address currency;
        // % of the next sale to award the previous owner
        Decimal.D256 sellOnFee;
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

    function bidSharesForToken(uint256 tokenId)
    public
    view
    returns (BidShares memory)
    {
        return _bidShares[tokenId];
    }

    function addBidShares(uint256 tokenId, BidShares memory bidShares)
        public
        onlyTokenCaller
    {
        require(isValidBidShares(bidShares), "InvertAuction: Invalid bid shares, must sum to 100");
        _bidShares[tokenId] = bidShares;
    }

    /**
    * @dev Sets the ask on a particular token. If the ask cannot be evenly split into the token's
    * bid shares, this reverts.
    */
    function setAsk(uint tokenId, Ask memory ask)
        public
        onlyTokenCaller
    {
        require(
            isValidBid(tokenId, ask.amount),
            "InvertAuction: Ask too small for share splitting"
        );
        _tokenAsks[tokenId] = ask;
    }

    /**
    * @dev Sets the bid on a particular token for a bidder. The token being used to bid
    * is transferred from the bidder to this contract to be held until removed or accepted.
    * If another bid already exists for the bidder, it is refunded.
    */
    function setBid(uint256 tokenId, Bid memory bid)
        public
        onlyTokenCaller
        onlyTransferAllowanceAndSolvent(bid.bidder, bid.currency, bid.amount)
    {
        BidShares memory bidShares = _bidShares[tokenId];
        require(
            bidShares.creator.value.add(bid.sellOnFee.value) <= uint256(100).mul(Decimal.BASE),
            "InvertAuction: Sell on fee invalid for share splitting"
        );
        require(
            bid.bidder != address(0),
            "InvertAuction: Bidder cannot be 0 address"
        );

        Bid storage existingBid = _tokenBidders[tokenId][bid.bidder];

        if (existingBid.amount > 0) {
            removeBid(tokenId, bid.bidder);
        }

        IERC20 token = IERC20(bid.currency);
        require(token.transferFrom(bid.bidder, address(this), bid.amount), "InvertAuction: transfer failed");
        _tokenBidders[tokenId][bid.bidder] = Bid(bid.amount, bid.currency, bid.bidder, bid.sellOnFee);

        // If the bid is over the ask price and the currency is the same, automatically accept the bid
        if (bid.currency == _tokenAsks[tokenId].currency && bid.amount >= _tokenAsks[tokenId].amount && bid.sellOnFee.value >= _tokenAsks[tokenId].sellOnFee.value) {
            // Finalize exchange
            _finalizeNFTTransfer(tokenId, bid.bidder);
        }
    }

    /**
    * @dev Removes the bid on a particular token for a bidder. The bid amount
    * is transferred from this contract to the bidder, if they have a bid placed.
    */
    function removeBid(uint256 tokenId, address bidder)
        onlyTokenCaller
        public
    {
        Bid storage bid =  _tokenBidders[tokenId][bidder];
        uint256 bidAmount = bid.amount;
        address bidCurrency = bid.currency;

        require(bid.amount > 0, "InvertAuction: cannot remove bid amount of 0");

        IERC20 token = IERC20(bidCurrency);

        delete _tokenBidders[tokenId][bidder];
        require(token.transfer(bidder, bidAmount), "InvertAuction: token transfer failed");
    }

    /**
    * @dev Accepts a bid from a particular bidder. Can only be called by the token
    * owner or an approved address. See {_finalizeNFTTransfer}
    */
    function acceptBid(uint256 tokenId, address bidder)
    onlyTokenCaller
    external
    {
        Bid memory bid = _tokenBidders[tokenId][bidder];
        require(bid.amount > 0, "InvertAuction: cannot accept bid of 0");
        require(
            isValidBid(tokenId, bid.amount),
            "InvertAuction: Bid invalid for share splitting"
        );

        _finalizeNFTTransfer(tokenId, bidder);
    }

    function isValidBid(uint256 tokenId, uint256 bidAmount)
        public
        view
        returns (bool)
    {
        return bidAmount != 0 && ((bidAmount % minBidForToken(tokenId)) == 0);
    }

    /**
    * @dev Given a token id, calculate the minimum bid amount required such that the bid shares can be split exactly.
    * For example, if the bid fee % is all whole units, the minimum amount would be 100
    * if the bid fee % has one decimal place , the minimum amount would be 1000
    */
    function minBidForToken(uint256 tokenId)
        public
        view
        returns (uint256)
    {
        BidShares memory bidShares = _bidShares[tokenId];

        require(isValidBidShares(bidShares), "InvertAuction: Invalid bid shares for token");

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

    function _finalizeNFTTransfer(uint256 tokenId, address bidder) private {
        Bid memory bid = _tokenBidders[tokenId][bidder];
        BidShares storage bidShares = _bidShares[tokenId];

        IERC20 token = IERC20(bid.currency);

        require(token.transfer(IERC721(tokenContract).ownerOf(tokenId), _splitShare(bidShares.owner, bid)), "InvertAuction: token transfer to owner failed");
        require(token.transfer(InvertToken(tokenContract).tokenCreators(tokenId), _splitShare(bidShares.creator, bid)), "InvertAuction: token transfer to creator failed");
        require(token.transfer(InvertToken(tokenContract).previousTokenOwners(tokenId), _splitShare(bidShares.prevOwner, bid)), "InvertAuction: token transfer to prevOwner failed");

        InvertToken(tokenContract).auctionTransfer(tokenId, bidder);

        bidShares.owner = Decimal.D256(uint256(100).mul(Decimal.BASE).sub(_bidShares[tokenId].creator.value).sub(bid.sellOnFee.value));
        bidShares.prevOwner = bid.sellOnFee;

        delete _tokenAsks[tokenId];
        delete _tokenBidders[tokenId][bidder];
    }

}