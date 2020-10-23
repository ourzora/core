pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./Decimal.sol";

contract Invert is ERC721Burnable {
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    uint256 constant ONE_HUNDRED = 100;

    modifier onlyExistingToken (uint256 tokenId) {
        require(_exists(tokenId), "Invert: Nonexistant token");
        _;
    }

    modifier onlyTransferAllowanceAndSolvent (address spender, address currencyAddress, uint256 amount) {
        IERC20 token = IERC20(currencyAddress);
        require(token.allowance(spender, address(this)) >= amount, "Invert: allowance not high enough to transfer token.");
        require(token.balanceOf(spender) >= amount, "Invert: Not enough funds to transfer token.");

        _;
    }

    modifier onlyApprovedOrOwner (address spender, uint256 tokenId) {
        require(_isApprovedOrOwner(spender, tokenId), "Invert: Only approved or owner");
        _;
    }

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

    struct BidShares {
        // % of resale value that goes to the _previous_ owner of the nft
        Decimal.D256 prevOwner;

        // % of resale value that goes to the original creator of the nft
        Decimal.D256 creator;

        // % of resale value that goes to the seller (current owner) of the nft
        Decimal.D256 owner;
    }

    Counters.Counter private _tokenIdTracker;

    // Mapping from creator address to their (enumerable) set of created tokens
    mapping (address => EnumerableSet.UintSet) private _creatorTokens;

    // Mapping from token to mapping from bidder to bid
    mapping(uint256 => mapping(address => Bid)) private _tokenBidders;

    // Mapping from token to previous owner of the token
    mapping(uint256 => address) private _previousTokenOwners;

    // Mapping from token to the bid shares for the token
    mapping(uint256 => BidShares) private _bidShares;

    constructor() public ERC721("Invert", "INVERT") {}

    function tokenOfCreatorByIndex(address creator, uint256 index) external view  returns (uint256) {
        return _creatorTokens[creator].at(index);
    }

    function bidForTokenBidder(uint256 tokenId, address bidder) external view returns (Bid memory) {
        return _tokenBidders[tokenId][bidder];
    }

    /**
    * @dev Creates a new token for `creator`. Its token ID will be automatically
    * assigned (and available on the emitted {IERC721-Transfer} event), and the token
    * URI autogenerated based on the base URI passed at construction.
    *
    * See {ERC721-_safeMint}.
    */
    function mint(address creator, string memory tokenURI, BidShares memory bidShares) public {
        // We cannot just use balanceOf to create the new tokenId because tokens
        // can be burned (destroyed), so we need a separate counter.
        uint256 tokenId = _tokenIdTracker.current();

        require(_isValidBidShares(bidShares), "Invert: Invalid bid shares, must sum to 100");

        _safeMint(creator, tokenId);
        _tokenIdTracker.increment();

        _setTokenURI(tokenId, tokenURI);
        _creatorTokens[creator].add(tokenId);
        _previousTokenOwners[tokenId] = creator;
        _bidShares[tokenId] = bidShares;
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

        if(existingBid.amount > 0) {
            IERC20 refundToken = IERC20(existingBid.currency);
            require(refundToken.transfer(msg.sender, existingBid.amount), "Invert: refund failed");
        }

        IERC20 token = IERC20(bid.currency);
        require(token.transferFrom(msg.sender, address(this), bid.amount), "Invert: transfer failed");
        _tokenBidders[tokenId][msg.sender] = Bid(bid.amount, bid.currency, bid.currencyDecimals, msg.sender);
    }

    /**
    * @dev Removes the bid on a particular token for a bidder. The bid amount
    * is transferred from this contract to the bidder, if they have a bid placed.
    */
    function removeBid(uint256 tokenId)
        onlyExistingToken(tokenId)
        public
    {
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
    * owner or an approved address. The bid currency is transferred to the owner,
    * and the bid is deleted from the token. The ownership of the toke is
    */
    function acceptBid(uint256 tokenId, address bidder)
        onlyApprovedOrOwner(msg.sender, tokenId)
        public
    {
        Bid storage bid = _tokenBidders[tokenId][bidder];

        require(bid.amount > 0, "Invert: cannot accept bid of 0");

        IERC20 token = IERC20(bid.currency);

        _previousTokenOwners[tokenId] = ownerOf(tokenId);
        require(token.transfer(ownerOf(tokenId), bid.amount), "Invert: token transfer failed");
        safeTransferFrom(ownerOf(tokenId), bidder, tokenId);
        delete _tokenBidders[tokenId][bidder];
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

        uint256 creatorMinCommonDenominator;
        uint256 ownerMinCommonDenominator;
        uint256 prevOwnerMinCommonDenominator;

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

        uint256 minBid = Math.max(creatorMinCommonDenominator, ownerMinCommonDenominator, prevOwnerMinCommonDenominator, 0);

        return Math.min(ONE_HUNDRED * 10**Decimal.BASE_POW);
    }

    /**
    * @dev Validates that the bid shares provided sum to 100
    */
    function _isValidBidShares(BidShares memory bidShares) internal view returns (bool){
        uint256 hundredPercent = uint256(100).mul(Decimal.BASE);
        uint256 creatorShare = bidShares.creator.value;
        uint256 ownerShare = bidShares.owner.value;
        uint256 prevOwnerShare = bidShares.prevOwner.value;
        uint256 shareSum = creatorShare.add(ownerShare).add(prevOwnerShare);
        return shareSum == hundredPercent;
    }
}
