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
        // requires permit
        applyPermit(_permit);

        // setAsk
        mediaContract.setAsk(_permit.tokenId, ask);

        // reset approvals?
        mediaContract.clearApproval(_permit.tokenId);
    }

//    function setBid() public {
//
//    }

//    function acceptBid() public {
//        // requires permit
//    }
//

    function updateTokenURI() public {
        // requires permit
    }

    function updateMetadataURI() public {
        // requires permit
    }

    function applyPermit(Permit memory _permit) public {
        mediaContract.permit(
            _permit.spender,
            _permit.tokenId,
            _permit.deadline,
            _permit.v,
            _permit.r,
            _permit.s
        );
    }

//    function clearApprovals(uint256 tokenId) public {
//        mediaContract.approve();
//    }
}
