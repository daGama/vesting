// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { RewardsPool } from "../RewardsPool.sol";

contract TestRewardsPool is RewardsPool {
    constructor(
        uint256 start_,
        uint256 cap_,
        address token_
    )
        RewardsPool(
            start_,
            cap_,
            token_
    )
    {}
}
