pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Math} from "./Math.sol";

/**
 * @title Decimal
 *
 * Library that defines a fixed-point number with 18 decimal places.
 */
library Decimal {
    using SafeMath for uint256;

    // ============ Constants ============

    uint256 constant BASE_POW = 18;
    uint256 constant BASE = 10**BASE_POW;

    // ============ Structs ============

    struct D256 {
        uint256 value;
    }

    // ============ Functions ============

    function one()
    internal
    pure
    returns (D256 memory)
    {
        return D256({ value: BASE });
    }

    function onePlus(
        D256 memory d
    )
    internal
    pure
    returns (D256 memory)
    {
        return D256({ value: d.value.add(BASE) });
    }

    function mul(
        uint256 target,
        D256 memory d
    )
    internal
    pure
    returns (uint256)
    {
        return Math.getPartial(target, d.value, BASE);
    }

    function div(
        uint256 target,
        D256 memory d
    )
    internal
    pure
    returns (uint256)
    {
        return Math.getPartial(target, BASE, d.value);
    }

    function add(
        D256 memory d,
        uint256 amount
    )
    internal
    pure
    returns (D256 memory)
    {
        return D256({ value: d.value.add(amount) });
    }

    function sub(
        D256 memory d,
        uint256 amount
    )
    internal
    pure
    returns (D256 memory)
    {
        return D256({ value: d.value.sub(amount) });
    }
}