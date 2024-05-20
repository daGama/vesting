// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RewardsPool is Ownable, ReentrancyGuard {
    // events
    event TokenReserved(address indexed beneficiary, uint256 value);
    event TokenClaimed(address indexed beneficiary, uint256 value);
    event FundsWithdrawal(uint256 value);
    // PV
    // start  unix timestamp
    uint256 private immutable _start;
    // full  amounts
    uint256 private immutable _cap;

    // amount purchased
    uint256 private _purchased;
    // the token being sold
    IERC20 private immutable _token;
    /**
     * @dev wallet structure for collecting benefeciary purchased/claimed amounts
     */
    struct RewardsWallet {
        uint256 purchased;
        uint256 claimed;
        uint256 lastClaimTs;
    }

    mapping(address => RewardsWallet) private _balances;

    // modifiers

    /**
     * @dev checking value not zero
     */
    modifier valueNotZero(uint256 val) {
        require(val != 0, "value can't be zero");
        _;
    }

    constructor(
        address initialOwner,
        uint256 start_,
        uint256 cap_,
        address token_
    ) Ownable(initialOwner) {
        require(
            block.timestamp < start_,
            "start  timestamp can't be in the past"
        );
        require(cap_ > 0, "invalid cap amount");
        require(token_ != address(0), "invalid token address");

        _token = IERC20(token_);

        _start = start_;

        _cap = cap_;
    }

    /**
     * @dev getting start  timestamp
     * @return start  timestamp
     */
    function startTimestamp() public view returns (uint) {
        return _start;
    }

    /**
     * @return address of the token being sold.
     */
    function token() public view returns (address) {
        return address(_token);
    }

    /**
     * @return amount of purchased.
     */
    function allPurchased() public view returns (uint256) {
        return _purchased;
    }

    /**
     * @return full  cap
     */
    function cap() public view returns (uint256) {
        return _cap;
    }

    /**
     * @return available for purchase amounts.
     */
    function availableForPurchase() public view returns (uint256) {
        return _cap - _purchased;
    }

    /**
     * @dev admin method getting users claimed amounts
     * @return the amount claimed by user.
     */
    function claimedByUser(address beneficiary) public view returns (uint256) {
        return _balances[beneficiary].claimed;
    }

    /**
     * @dev public method getting users claimed amounts
     * @return the amount claimed by user.
     */
    function claimed() public view returns (uint256) {
        return _balances[msg.sender].claimed;
    }

    /**
     * @dev manager method getting users purchased amounts
     * @return the amount purchased by user.
     */
    function purchasedByUser(
        address beneficiary
    ) public view returns (uint256) {
        return _balances[beneficiary].purchased;
    }

    /**
     * @dev public method getting users purchased amounts
     * @return the amount purchased by user.
     */
    function purchased() public view returns (uint256) {
        return _balances[msg.sender].purchased;
    }

    /**
     * @dev manager method getting beneficiary amounts value available for claim
     * @return amount available for claim.
     */
    function claimableForUser(
        address beneficiary
    ) public view returns (uint256) {
        return _claimable(beneficiary);
    }

    /**
     * @dev getting beneficiary amounts value available for claim
     * @return amount available for claim.
     */
    function claimable() public view returns (uint256) {
        return _claimable(msg.sender);
    }

    /**
     * @dev private method getting beneficiary amounts value available for claim
     * @return amount available for claim.
     */
    function _claimable(address beneficiary) private view returns (uint256) {
        RewardsWallet storage balance = _balances[beneficiary];
        uint256 purchasedBalance = balance.purchased;
        if (purchasedBalance == 0) {
            return 0;
        }

        uint256 currentTime = block.timestamp;
        // Vesting not started
        if (currentTime < startTimestamp()) {
            return 0;
        }

        // Non-linear vesting
        uint256 lastClaimTs = balance.lastClaimTs > _start
            ? balance.lastClaimTs
            : _start;
        if ((currentTime - lastClaimTs) < 4 weeks) {
            return 0; // Less than a month passed since last claim or start
        }

        uint256 monthsElapsed = (currentTime - lastClaimTs) / 4 weeks;
        uint256 unlocked = balance.claimed;

        for (uint256 i = 0; i < monthsElapsed; ) {
            uint256 remainingBalance = purchasedBalance - unlocked;
            unlocked += (remainingBalance * 4) / 1000; // 0.4% per month
            unchecked {
                i++;
            }
        }

        return unlocked - balance.claimed;
    }

    /**
     * @dev claim funds
     */
    function claim(uint256 amount) public valueNotZero(amount) nonReentrant {
        require(
            _balances[msg.sender].purchased > 0,
            "account is not beneficiary"
        );
        require(_claimable(msg.sender) >= amount, "insufficient funds");
        _balances[msg.sender].claimed += amount;
        _balances[msg.sender].lastClaimTs = block.timestamp;

        bool res = _token.transfer(msg.sender, amount);
        require(res, "claim amounts error");

        emit TokenClaimed(msg.sender, amount);
    }

    /**
     * @dev reserve tokens
     */
    function reserveTokens(
        address beneficiary,
        uint256 amount
    ) public onlyOwner {
        require((allPurchased() + amount) <= cap(), "cap exceeded");

        _purchased += amount;
        _balances[beneficiary].purchased += amount;

        emit TokenReserved(beneficiary, amount);
    }
}
