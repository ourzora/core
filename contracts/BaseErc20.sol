pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";


/**
 * @title ERC20 Token
 *
 * Basic ERC20 Implementation
 */
contract BaseERC20 is IERC20, Ownable {
    using SafeMath for uint256;

    // ============ Variables ============

    string internal _name;
    string internal _symbol;
    uint256 internal _supply;
    uint8 internal _decimals;

    mapping (address => uint256) private  _balances;
    mapping (address => mapping(address => uint256)) private _allowances;

    // ============ Constructor ============

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals
    )
    public
    {
        _name = name;
        _symbol = symbol;
        _decimals = decimals;
    }

    // ============ Public Functions ============

    function symbol()
    public
    view
    returns (string memory)
    {
        return _symbol;
    }

    function name()
    public
    view
    returns (string memory)
    {
        return _name;
    }

    function decimals()
    public
    virtual
    view
    returns (uint8)
    {
        return _decimals;
    }

    function totalSupply()
    public
    override
    view
    returns (uint256)
    {
        return _supply;
    }

    function balanceOf(
        address who
    )
    public
    override
    view returns (uint256)
    {
        return _balances[who];
    }

    function allowance(
        address owner,
        address spender
    )
    public
    override
    view
    returns (uint256)
    {
        return _allowances[owner][spender];
    }

    // ============ Internal Functions ============

    function _mint(address to, uint256 value) internal {
        require(to != address(0), "Cannot mint to zero address");

        _balances[to] = _balances[to].add(value);
        _supply = _supply.add(value);

        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        require(from != address(0), "Cannot burn to zero");

        _balances[from] = _balances[from].sub(value);
        _supply = _supply.sub(value);

        emit Transfer(from, address(0), value);
    }

    // ============ Token Functions ============

    function transfer(
        address to,
        uint256 value
    )
    public
    override
    virtual
    returns (bool)
    {
        if (_balances[msg.sender] >= value) {
            _balances[msg.sender] = _balances[msg.sender].sub(value);
            _balances[to] = _balances[to].add(value);
            emit Transfer(msg.sender, to, value);
            return true;
        } else {
            return false;
        }
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    )
    public
    override
    virtual
    returns (bool)
    {
        if (
            _balances[from] >= value &&
            _allowances[from][msg.sender] >= value
        ) {
            _balances[to] = _balances[to].add(value);
            _balances[from] = _balances[from].sub(value);
            _allowances[from][msg.sender] = _allowances[from][msg.sender].sub(
                value
            );
            emit Transfer(from, to, value);
            return true;
        } else {
            return false;
        }
    }

    function approve(
        address spender,
        uint256 value
    )
    public
    override
    returns (bool)
    {
        return _approve(msg.sender, spender, value);
    }

    function _approve(
        address owner,
        address spender,
        uint256 value
    )
    internal
    returns (bool)
    {
        _allowances[owner][spender] = value;

        emit Approval(
            owner,
            spender,
            value
        );

        return true;
    }

    function mint(address to, uint256 value) onlyOwner public {
        _mint(to, value);
    }
}
