pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/EnumerableSet.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Decimal} from "./Decimal.sol";
import {Media} from "./Media.sol";

contract Market {
    using Counters for Counters.Counter;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

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
        // Address of the recipient
        address recipient;
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
    event BidCreated(uint256 indexed tokenId, Bid bid);
    event BidRemoved(uint256 indexed tokenId, Bid bid);
    event BidFinalized(uint256 indexed tokenId, Bid bid);
    event AskCreated(uint256 indexed tokenId, Ask ask);
    event AskRemoved(uint256 indexed tokenId);
    event BidShareUpdated(uint256 indexed tokenId, BidShares bidShares);

    /* *******
     * Globals
     * *******
     */
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

    /**
     * @dev Validates that the bid is valid by ensuring that the bid amount can be split perfectly into all the bid shares.
     *  We do this by comparing the sum of the individual share values with the amount and ensuring they are equal. Because
     *  the _splitShare function uses integer division, any inconsistencies with the original and split sums would be due to
     *  a bid splitting that does not perfectly divide the bid amount.
     */
    function isValidBid(uint256 tokenId, uint256 bidAmount)
        public
        view
        returns (bool)
    {
        BidShares memory bidShares = bidSharesForToken(tokenId);
        require(
            isValidBidShares(bidShares),
            "Market: Invalid bid shares for token"
        );
        return
            bidAmount != 0 &&
            (bidAmount ==
                _splitShare(bidShares.creator, bidAmount)
                    .add(_splitShare(bidShares.prevOwner, bidAmount))
                    .add(_splitShare(bidShares.owner, bidAmount)));
    }

    /**
     * @dev Validates that the bid shares provided sum to 100
     */
    function isValidBidShares(BidShares memory bidShares)
        public
        pure
        returns (bool)
    {
        return
            bidShares.creator.value.add(bidShares.owner.value).add(
                bidShares.prevOwner.value
            ) == uint256(100).mul(Decimal.BASE);
    }

    function _splitShare(Decimal.D256 memory sharePercentage, uint256 amount)
        public
        pure
        returns (uint256)
    {
        return Decimal.mul(amount, sharePercentage).div(100);
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

    function removeAsk(uint256 tokenId) public onlyTokenCaller {
        delete _tokenAsks[tokenId];
        emit AskRemoved(tokenId);
    }

    /**
     * @dev Sets the bid on a particular token for a bidder. The token being used to bid
     * is transferred from the spender to this contract to be held until removed or accepted.
     * If another bid already exists for the bidder, it is refunded.
     */
    function setBid(
        uint256 tokenId,
        Bid memory bid,
        address spender
    )
        public
        onlyTokenCaller
        onlyTransferAllowanceAndSolvent(spender, bid.currency, bid.amount)
    {
        BidShares memory bidShares = _bidShares[tokenId];
        require(
            bidShares.creator.value.add(bid.sellOnFee.value) <=
                uint256(100).mul(Decimal.BASE),
            "Market: Sell on fee invalid for share splitting"
        );
        require(bid.bidder != address(0), "Market: Bidder cannot be 0 address");
        require(bid.amount != 0, "Market: cannot bid amount of 0");

        Bid storage existingBid = _tokenBidders[tokenId][bid.bidder];

        // If there is an existing bid, refund it before continuing
        if (existingBid.amount > 0) {
            removeBid(tokenId, bid.bidder);
        }

        IERC20 token = IERC20(bid.currency);

        // We must check the balance that was actually transferred to the market,
        // as some tokens impose a transfer fee and would not actually transfer the
        // full amount to the market, resulting in locked funds for refunds & bid acceptance
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(spender, address(this), bid.amount);
        uint256 afterBalance = token.balanceOf(address(this));
        _tokenBidders[tokenId][bid.bidder] = Bid(
            afterBalance.sub(beforeBalance),
            bid.currency,
            bid.bidder,
            bid.recipient,
            bid.sellOnFee
        );
        emit BidCreated(tokenId, bid);

        // If the bid is over the ask price and the currency is the same, automatically accept the bid.
        // If no ask is set or the bid does not meet the requirements, ignore.
        // Note, no bid should be 0, so checking if the ask is set should not be required.
        if (
            _tokenAsks[tokenId].currency != address(0) &&
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
        token.safeTransfer(bidder, bidAmount);
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
     * to the bid recipient. Finally, it removes the accepted bid and the current ask.
     */
    function _finalizeNFTTransfer(uint256 tokenId, address bidder) private {
        Bid memory bid = _tokenBidders[tokenId][bidder];
        BidShares storage bidShares = _bidShares[tokenId];

        IERC20 token = IERC20(bid.currency);

        token.safeTransfer(
            IERC721(tokenContract).ownerOf(tokenId),
            _splitShare(bidShares.owner, bid.amount)
        );
        token.safeTransfer(
            Media(tokenContract).tokenCreators(tokenId),
            _splitShare(bidShares.creator, bid.amount)
        );
        token.safeTransfer(
            Media(tokenContract).previousTokenOwners(tokenId),
            _splitShare(bidShares.prevOwner, bid.amount)
        );

        Media(tokenContract).auctionTransfer(tokenId, bid.recipient);

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
