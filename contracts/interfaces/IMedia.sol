pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {Market} from "../Market.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IMedia is IERC721 {
    function mint(
        address creator,
        string calldata tokenURI,
        bytes32 contentHash,
        Market.BidShares calldata bidShares
    ) external;

    function auctionTransfer(uint256 tokenId, address bidder) external;
    function tokenCreator(uint256 tokenId) external returns (address);
    function tokenPreviousOwner(uint256 tokenId) external returns (address);
    function setAsk(uint256 tokenId, Market.Ask calldata ask) external;
    function setBid(uint256 tokenId, Market.Bid calldata bid) external;
    function removeBid(uint256 tokenId) external;
    function acceptBid(uint256 tokenId, Market.Bid calldata bid) external;
    function permit(
        address spender,
        uint256 tokenId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function revokeApproval(uint256 tokenId) external;
    function updateTokenURI(uint256 tokenId, string calldata tokenURI) external;
    function updateTokenMetadataURI(uint256 tokenId, string calldata metadataURI) external;
    function burn(uint256 tokenId) external;
}
