pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC721/ERC721Burnable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract Invert is ERC721Burnable {
    using Counters for Counters.Counter;
    constructor() public ERC721("Invert", "INVERT") {}

    
}