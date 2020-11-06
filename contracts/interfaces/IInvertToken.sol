pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {InvertAuction} from "../InvertAuction.sol";

interface IInvertToken {
    function mint(address creator, string calldata tokenURI, bytes32 contentHash, InvertAuction.BidShares calldata bidShares) external;
    function auctionTransfer(uint256 tokenId, address bidder) external;
    function tokenCreator(uint256 tokenId) external returns(address);
    function tokenPreviousOwner(uint256 tokenId) external returns(address);
    function setAsk(uint256 tokenId, InvertAuction.Ask calldata ask) external;
    function setBid(uint256 tokenId, InvertAuction.Bid calldata bid) external;
    function removeBid(uint256 tokenId) external;
    function acceptBid(uint256 tokenId, address bidder) external;
}
