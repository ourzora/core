pragma solidity ^0.6.8;

import "./ProxyStorage.sol";
import "./InvertStorage.sol";

contract InvertProxy is ProxyStorage, InvertStorage {
    modifier onlyOwner() {
        require (msg.sender == _owner, "InvertProxy: msg.sender is not owner");
        _;
    }

    constructor(address implementation) public {
        require(implementation != address(0), "InvertProxy: implementation address must be set");
        _owner = msg.sender;
        _implementation = implementation;
    }

    fallback() payable external {
        address impl = _implementation;
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize())
            let result := delegatecall(gas(), impl, ptr, calldatasize(), 0, 0)
            let size := returndatasize()
            returndatacopy(ptr, 0, size)
            switch result
                case 0 { revert(ptr, size) }
                default { return(ptr, size) }
        }
    }
}