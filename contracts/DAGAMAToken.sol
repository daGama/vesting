// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract DAGAMAToken is ERC20Burnable {
    constructor() ERC20("DAGAMA Token", "DAGAMA") {
        _mint(msg.sender, 7e8 * 10 ** 8);
    }

    function decimals() public pure override returns (uint8) {
        return 8;
    }
}
