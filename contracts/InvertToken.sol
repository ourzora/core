pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/ERC721Burnable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {SafeMath} from "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import {Math} from "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import {Decimal} from "./Decimal.sol";

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

    modifier onlyAuction() {
        require(msg.sender == _auctionContract, "Invert: only auction contract");
        _;
    }

    constructor(address auctionContract) public ERC721("Invert", "INVERT") {
        _auctionContract = auctionContract;
    }

    function auctionTransfer(uint256 tokenId, address bidder) public onlyAuction {
        _previousTokenOwners[tokenId] = ownerOf(tokenId);
        _safeTransfer(ownerOf(tokenId), bidder, tokenId, '');
    }

    function tokenCreator(uint256 tokenId) public returns(address) {
        return _tokenCreators[tokenId];
    }

    function tokenPreviousOwner(uint256 tokenId) public returns(address) {
        return _previousTokenOwners[tokenId];
    }

    fallback() external {
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            let target := sload(0)
            calldatacopy(0, 0, calldatasize())
            let result := call(gas(), target, 0, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {revert(0, returndatasize())}
            default {return (0, returndatasize())}
        }
    }
}