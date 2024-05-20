// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vesting} from "../Vesting.sol";

contract TestVesting is Vesting {
    constructor(
        address initialOwner,
        uint startRound_,
        uint cliffDuration_,
        uint vestingDuration_,
        uint256 tgep_,
        uint256 cap_,
        address token_,
        address payable treasury_
    )
        Vesting(
            initialOwner,
            startRound_,
            cliffDuration_,
            vestingDuration_,
            tgep_,
            cap_,
            token_,
            treasury_
        )
    {}
}
