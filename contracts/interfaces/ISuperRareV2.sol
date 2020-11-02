pragma solidity 0.6.8;

interface ISuperRareV2 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function deleteToken(uint256 tokenId) external;
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function tokenCreator(uint256 tokenId) external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address owner);
    function getApproved(uint256 tokenId) external view returns (address operator);
}
