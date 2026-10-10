// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {PactLicensing} from "../src/PactLicensing.sol";

/// @dev Foundry's test EVM records script calls locally; nothing is broadcast.
contract DeployTest is Test {
    Deploy deployment;

    function setUp() public {
        deployment = new Deploy();
    }

    function testLocalChainAllowed() public {
        vm.chainId(31337);
        PactLicensing pact = deployment.run();
        assertGt(address(pact).code.length, 0);
        assertEq(pact.nextOfferId(), 0);
    }

    function testBaseSepoliaAllowed() public {
        vm.chainId(84532);
        PactLicensing pact = deployment.run();
        assertGt(address(pact).code.length, 0);
        assertEq(pact.nextOfferId(), 0);
    }

    function testBaseMainnetRejected() public {
        vm.chainId(8453);
        vm.expectRevert("unsupported chain");
        deployment.run();
    }

    function testFuzzUnsupportedChainRejected(uint64 chain) public {
        vm.assume(chain != 31337 && chain != 84532);
        vm.chainId(chain);
        vm.expectRevert("unsupported chain");
        deployment.run();
    }
}
