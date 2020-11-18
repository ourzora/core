pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {IMedia} from "../interfaces/IMedia.sol";
import {Market} from "../Market.sol";

contract MediaProxy {

    struct Permit {
        address spender;
        uint256 tokenId;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    IMedia public mediaContract;

    constructor(address _mediaContract) public {
        mediaContract = IMedia(_mediaContract);
    }

    function setAsk(Permit memory _permit, Market.Ask memory ask) public {
        applyPermit(_permit);
        mediaContract.setAsk(_permit.tokenId, ask);
        mediaContract.revokeApproval(_permit.tokenId);
    }

    function acceptBid(Permit memory _permit, Market.Bid memory bid) public {
        applyPermit(_permit);
        mediaContract.acceptBid(_permit.tokenId, bid);
    }

    function burn(Permit memory _permit) public {
        applyPermit(_permit);
        mediaContract.burn(_permit.tokenId);
    }

    function updateTokenURI(Permit memory _permit, string memory tokenURI) public {
        applyPermit(_permit);
        mediaContract.updateTokenURI(_permit.tokenId, tokenURI);
        mediaContract.revokeApproval(_permit.tokenId);
    }

    function updateTokenMetadataURI(Permit memory _permit, string memory metadataURI) public {
        applyPermit(_permit);
        mediaContract.updateTokenMetadataURI(_permit.tokenId, metadataURI);
        mediaContract.revokeApproval(_permit.tokenId);
    }

    function applyPermit(Permit memory _permit) internal {
        mediaContract.permit(
            _permit.spender,
            _permit.tokenId,
            _permit.deadline,
            _permit.v,
            _permit.r,
            _permit.s
        );
    }
}
