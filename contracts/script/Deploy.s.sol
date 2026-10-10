// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {PactLicensing} from "../src/PactLicensing.sol";

/// @notice Simulation by default. Broadcasting requires explicit user approval.
/// Uses a locally configured signer; never accepts or reads a private key.
contract Deploy is Script {
    function run() external returns (PactLicensing pact) {
        require(block.chainid == 31337 || block.chainid == 84532, "unsupported chain");
        vm.startBroadcast();
        pact = new PactLicensing();
        vm.stopBroadcast();
    }
}
