pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/EnumerableSet.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Decimal} from "./Decimal.sol";
import {Media} from "./Media.sol";

contract Market {
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    /* *******
     * STRUCTS
     * *******
     */
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

    /* *******
     * Events
     * *******
     */
    event BidCreated(uint256 tokenId, Bid bid);
    event BidRemoved(uint256 tokenId, Bid bid);
    event BidFinalized(uint256 tokenId, Bid bid);
    event AskCreated(uint256 tokenId, Ask ask);
    event BidShareUpdated(uint256 tokenId, BidShares bidShares);

    /* *******
     * Globals
     * *******
     */
    uint256 constant ONE_HUNDRED = 100;

    // Address of the media contract that can call this market
    address public tokenContract;

    // Deployment Address
    address private _owner;

    // True if the token contract has been set, false otherwise
    bool private _configured;

    // Mapping from token to mapping from bidder to bid
    mapping(uint256 => mapping(address => Bid)) private _tokenBidders;

    // Mapping from token to the bid shares for the token
    mapping(uint256 => BidShares) private _bidShares;

    // Mapping from token to the current ask for the token
    mapping(uint256 => Ask) private _tokenAsks;

    /* *********
     * Modifiers
     * *********
     */
    modifier onlyTransferAllowanceAndSolvent(
        address spender,
        address currencyAddress,
        uint256 amount
    ) {
        IERC20 token = IERC20(currencyAddress);
        require(
            token.allowance(spender, address(this)) >= amount,
            "Market: allowance not high enough to transfer token"
        );
        require(
            token.balanceOf(spender) >= amount,
            "Market: Not enough funds to transfer token"
        );
        _;
    }

    modifier onlyTokenCaller() {
        require(tokenContract == msg.sender, "Market: Only token contract");
        _;
    }

    /* ****************
     * View Functions
     * ****************
     */
    function bidForTokenBidder(uint256 tokenId, address bidder)
        external
        view
        returns (Bid memory)
    {
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

    function isValidBid(uint256 tokenId, uint256 bidAmount)
        public
        view
        returns (bool)
    {
        return bidAmount != 0 && ((bidAmount % minBidForToken(tokenId)) == 0);
    }

    /**
     * @dev Validates that the bid shares provided sum to 100
     */
    function isValidBidShares(BidShares memory bidShares)
        public
        pure
        returns (bool)
    {
        uint256 hundredPercent = uint256(100).mul(Decimal.BASE);
        uint256 creatorShare = bidShares.creator.value;
        uint256 ownerShare = bidShares.owner.value;
        uint256 prevOwnerShare = bidShares.prevOwner.value;
        uint256 shareSum = creatorShare.add(ownerShare).add(prevOwnerShare);
        return shareSum == hundredPercent;
    }

    function _splitShare(Decimal.D256 memory sharePercentage, Bid memory bid)
        public
        pure
        returns (uint256)
    {
        return Decimal.mul(bid.amount, sharePercentage).div(100);
    }

    /**
     * @dev Given a token id, calculate the minimum bid amount required such that the bid shares can be split exactly.
     * For example, if the bid fee % is all whole units, the minimum amount would be 100
     * if the bid fee % has one decimal place , the minimum amount would be 1000
     */
    function minBidForToken(uint256 tokenId) public view returns (uint256) {
        BidShares memory bidShares = _bidShares[tokenId];

        require(
            isValidBidShares(bidShares),
            "Market: Invalid bid shares for token"
        );

        uint256 creatorMinCommonDenominator = 0;
        uint256 ownerMinCommonDenominator = 0;
        uint256 prevOwnerMinCommonDenominator = 0;

        for (uint256 i = Decimal.BASE_POW; i >= 0; i--) {
            if (bidShares.creator.value % uint256(10**i) == 0) {
                creatorMinCommonDenominator = uint256(ONE_HUNDRED).mul(
                    10**(Decimal.BASE_POW - i)
                );
                break;
            }
        }
        for (uint256 i = Decimal.BASE_POW; i >= 0; i--) {
            if (bidShares.owner.value % uint256(10**i) == 0) {
                ownerMinCommonDenominator = uint256(ONE_HUNDRED).mul(
                    10**(Decimal.BASE_POW - i)
                );
                break;
            }
        }
        for (uint256 i = Decimal.BASE_POW; i >= 0; i--) {
            if (bidShares.prevOwner.value % uint256(10**i) == 0) {
                prevOwnerMinCommonDenominator = uint256(ONE_HUNDRED).mul(
                    10**(Decimal.BASE_POW - i)
                );
                break;
            }
        }

        uint256 minBid =
            Math.max(
                Math.max(
                    creatorMinCommonDenominator,
                    ownerMinCommonDenominator
                ),
                prevOwnerMinCommonDenominator
            );

        return Math.min((ONE_HUNDRED * 10**Decimal.BASE_POW), minBid);
    }

    /* ****************
     * Public Functions
     * ****************
     */

    constructor() public {
        _owner = msg.sender;
        _configured = false;
    }

    /**
     * @dev Sets the token contract address. This address is the only permitted address that
     * can call the mutable functions. This method can only be called once.
     */
    function configure(address tokenContractAddress) public {
        require(msg.sender == _owner, "Market: Only owner");
        require(_configured == false, "Market: Already configured");

        tokenContract = tokenContractAddress;
        _configured = true;
    }

    /**
     * @dev Adds bid shares for a particular tokenId. These bid shares must
     * sum to 100.
     */
    function addBidShares(uint256 tokenId, BidShares memory bidShares)
        public
        onlyTokenCaller
    {
        require(
            isValidBidShares(bidShares),
            "Market: Invalid bid shares, must sum to 100"
        );
        _bidShares[tokenId] = bidShares;
        emit BidShareUpdated(tokenId, bidShares);
    }

    /**
     * @dev Sets the ask on a particular token. If the ask cannot be evenly split into the token's
     * bid shares, this reverts.
     */
    function setAsk(uint256 tokenId, Ask memory ask) public onlyTokenCaller {
        require(
            isValidBid(tokenId, ask.amount),
            "Market: Ask invalid for share splitting"
        );

        uint256 hundredPercent = uint256(100).mul(Decimal.BASE);
        BidShares memory bidShares = _bidShares[tokenId];
        require(
            bidShares.creator.value.add(ask.sellOnFee.value) <=
                uint256(100).mul(Decimal.BASE),
            "Market: invalid sell on fee"
        );

        _tokenAsks[tokenId] = ask;
        emit AskCreated(tokenId, ask);
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
            bidShares.creator.value.add(bid.sellOnFee.value) <=
                uint256(100).mul(Decimal.BASE),
            "Market: Sell on fee invalid for share splitting"
        );
        require(bid.bidder != address(0), "Market: Bidder cannot be 0 address");

        Bid storage existingBid = _tokenBidders[tokenId][bid.bidder];

        if (existingBid.amount > 0) {
            removeBid(tokenId, bid.bidder);
        }

        IERC20 token = IERC20(bid.currency);
        require(
            token.transferFrom(bid.bidder, address(this), bid.amount),
            "Market: transfer failed"
        );
        _tokenBidders[tokenId][bid.bidder] = bid;
        emit BidCreated(tokenId, bid);

        // If the bid is over the ask price and the currency is the same, automatically accept the bid
        if (
            bid.currency == _tokenAsks[tokenId].currency &&
            bid.amount >= _tokenAsks[tokenId].amount &&
            bid.sellOnFee.value >= _tokenAsks[tokenId].sellOnFee.value
        ) {
            // Finalize exchange
            _finalizeNFTTransfer(tokenId, bid.bidder);
        }
    }

    /**
     * @dev Removes the bid on a particular token for a bidder. The bid amount
     * is transferred from this contract to the bidder, if they have a bid placed.
     */
    function removeBid(uint256 tokenId, address bidder) public onlyTokenCaller {
        Bid storage bid = _tokenBidders[tokenId][bidder];
        uint256 bidAmount = bid.amount;
        address bidCurrency = bid.currency;

        require(bid.amount > 0, "Market: cannot remove bid amount of 0");

        IERC20 token = IERC20(bidCurrency);

        emit BidRemoved(tokenId, bid);
        delete _tokenBidders[tokenId][bidder];
        require(
            token.transfer(bidder, bidAmount),
            "Market: token transfer failed"
        );
    }

    /**
     * @dev Accepts a bid from a particular bidder. Can only be called by the token
     * owner or an approved address. See {_finalizeNFTTransfer}
     */
    function acceptBid(uint256 tokenId, Bid calldata expectedBid)
        external
        onlyTokenCaller
    {
        Bid memory bid = _tokenBidders[tokenId][expectedBid.bidder];
        require(bid.amount > 0, "Market: cannot accept bid of 0");
        require(
            bid.amount == expectedBid.amount &&
                bid.currency == expectedBid.currency &&
                bid.sellOnFee.value == expectedBid.sellOnFee.value,
            "Market: Unexpected bid found."
        );
        require(
            isValidBid(tokenId, bid.amount),
            "Market: Bid invalid for share splitting"
        );

        _finalizeNFTTransfer(tokenId, bid.bidder);
    }

    /**
     * @dev Given a token ID and a bidder, this method transfers the value of
     * the bid to the shareholders. It also transfers the ownership of the media
     * to the bidder. Finally, it removes the accepted bid and the current ask.
     */
    function _finalizeNFTTransfer(uint256 tokenId, address bidder) private {
        Bid memory bid = _tokenBidders[tokenId][bidder];
        BidShares storage bidShares = _bidShares[tokenId];

        IERC20 token = IERC20(bid.currency);

        require(
            token.transfer(
                IERC721(tokenContract).ownerOf(tokenId),
                _splitShare(bidShares.owner, bid)
            ),
            "Market: token transfer to owner failed"
        );
        require(
            token.transfer(
                Media(tokenContract).tokenCreators(tokenId),
                _splitShare(bidShares.creator, bid)
            ),
            "Market: token transfer to creator failed"
        );
        require(
            token.transfer(
                Media(tokenContract).previousTokenOwners(tokenId),
                _splitShare(bidShares.prevOwner, bid)
            ),
            "Market: token transfer to prevOwner failed"
        );

        Media(tokenContract).auctionTransfer(tokenId, bidder);

        bidShares.owner = Decimal.D256(
            uint256(100)
                .mul(Decimal.BASE)
                .sub(_bidShares[tokenId].creator.value)
                .sub(bid.sellOnFee.value)
        );
        bidShares.prevOwner = bid.sellOnFee;

        emit BidFinalized(tokenId, bid);
        delete _tokenAsks[tokenId];
        delete _tokenBidders[tokenId][bidder];
    }
}
