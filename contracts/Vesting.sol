// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vesting is Ownable, ReentrancyGuard {
    // events
    event TokenReserved(address indexed beneficiary, uint256 value);
    event TokenClaimed(address indexed beneficiary, uint256 value);
    event FundsWithdrawal(uint256 value);
    // PV
    // start round unix timestamp
    uint256 private immutable _startRound;
    // lock-up period (duration, sec)
    uint256 private immutable _cliffPeriod;
    // vesting period (duration, sec)
    uint256 private immutable _vestingPeriod;

    // pre-cliff ration
    // share of funds unlocked for TGE
    uint256 private immutable _tgep;

    // full round amounts
    uint256 private immutable _cap;

    // amount purchased
    uint256 private _purchased;
    // the token being sold
    IERC20 private immutable _token;
    // treasury address
    address payable private immutable _treasury;

    /**
     * @dev ico wallet structure for collecting benefeciary purchased/claimed amounts
     */
    struct VestingWallet {
        uint256 initiallyUnlocked;
        uint256 purchased;
        uint256 claimed;
    }

    mapping(address => VestingWallet) private _balances;

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
        uint256 startRound_,
        uint256 cliffDuration_,
        uint256 vestingDuration_,
        uint256 tgep_, // % in basis points (parts per 10,000)
        uint256 cap_,
        address token_,
        address payable treasury_
    ) Ownable(initialOwner) {
        require(
            block.timestamp < startRound_,
            "start round timestamp can't be in the past"
        );
        require(vestingDuration_ > 0, "invalid vesting period duration");
        require(cliffDuration_ > 0, "invalid cliff period duration");
        require(cap_ > 0, "invalid cap amount");
        require((tgep_ <= 10_000), "invalid rate");
        require(token_ != address(0), "invalid token address");
        require(treasury_ != address(0), "invalid treasury address");

        _token = IERC20(token_);

        _startRound = startRound_;
        _cliffPeriod = cliffDuration_;
        _vestingPeriod = vestingDuration_;

        _tgep = tgep_;
        _cap = cap_;

        _treasury = treasury_;
    }

    /**
     * @dev getting start round timestamp
     * @return start round timestamp
     */
    function startRoundTimestamp() public view returns (uint) {
        return _startRound;
    }

    /**
     * @dev getting vesting timestamp
     * @return vesting timestamp
     */
    function vestingTimestamp() public view returns (uint) {
        return _startRound + _cliffPeriod;
    }

    /**
     * @dev getting finish round timestamp
     * @return finish round timestamp
     */
    function finishRoundTimestamp() public view returns (uint) {
        return vestingTimestamp() + _vestingPeriod;
    }

    /**
     * @return address of the token being sold.
     */
    function token() public view returns (address) {
        return address(_token);
    }

    /**
     * @return treasury address.
     */
    function treasury() public view returns (address payable) {
        return _treasury;
    }

    /**
     * @return amount of purchased.
     */
    function allPurchased() public view returns (uint256) {
        return _purchased;
    }

    /**
     * @return full round cap
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
        if (_balances[beneficiary].purchased == 0) {
            return 0;
        }

        uint256 initiallyUnlocked = _balances[beneficiary].initiallyUnlocked;
        uint256 claimedBalance = _balances[beneficiary].claimed;
        uint256 purchasedBalance = _balances[beneficiary].purchased;
        uint256 currentTime = block.timestamp;

        // round not started
        if (currentTime < startRoundTimestamp()) {
            return 0;
        }

        // round finished
        if (currentTime >= finishRoundTimestamp()) {
            return purchasedBalance - claimedBalance;
        }

        uint256 period = currentTime > vestingTimestamp() ? currentTime - vestingTimestamp() : 0;
        uint256 unlocked = (purchasedBalance - initiallyUnlocked) * period / _vestingPeriod;
        return initiallyUnlocked + unlocked - claimedBalance;
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
        require(
            block.timestamp < (vestingTimestamp() + _vestingPeriod),
            "round finished"
        );
        require((allPurchased() + amount) <= cap(), "cap exceeded");
        _purchased += amount;
        _balances[beneficiary].purchased += amount;
        if (block.timestamp < _startRound) {
            _balances[beneficiary].initiallyUnlocked =
                (_balances[beneficiary].purchased * _tgep) /
                10_000;
        }
        emit TokenReserved(beneficiary, amount);
    }

    /**
     * @dev withdraw unpurchased funds
     */
    function withdrawUnpurchasedFunds() public onlyOwner {
        require(
            block.timestamp > (vestingTimestamp() + _vestingPeriod),
            "round has not finished yet"
        );
        uint256 amount = _token.balanceOf(address(this)) - _purchased;
        require(
            amount != 0,
            "there are no unredeemed funds left on the smart contract account"
        );

        bool res = _token.transfer(_treasury, amount);
        if (!res) {
            revert("withdraw amounts error");
        }

        emit FundsWithdrawal(amount);
    }
}
