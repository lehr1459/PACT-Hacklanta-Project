// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PactLicensing} from "../../src/PactLicensing.sol";

/// Test-only adversarial seller: no deployment or real wallets involved.
contract QASeller {
    PactLicensing public immutable pact;
    bool public rejectPayment;
    bool public attemptReentry;
    bool public nestedSucceeded;
    bytes public nestedError;

    constructor(PactLicensing target) {
        pact = target;
    }

    function create(uint256 price) external returns (uint256) {
        return pact.createOffer(price, 60, keccak256("qa-public-demo-terms"));
    }

    function configure(bool reject, bool reenter) external {
        rejectPayment = reject;
        attemptReentry = reenter;
    }

    function withdraw() external {
        pact.withdrawProceeds();
    }

    receive() external payable {
        require(!rejectPayment, "seller rejects payment");
        if (attemptReentry) {
            (nestedSucceeded, nestedError) = address(pact).call(abi.encodeCall(PactLicensing.withdrawProceeds, ()));
        }
    }
}

contract PactIndependentQA is Test {
    PactLicensing pact;
    address seller = address(0x1111);
    address buyer = address(0x2222);
    address other = address(0x3333);
    uint256 constant PRICE = 0.001 ether;

    function setUp() public {
        pact = new PactLicensing();
        vm.warp(1_000);
        vm.deal(buyer, 10 ether);
        vm.deal(other, 10 ether);
        vm.prank(seller);
        pact.createOffer(PRICE, 60, keccak256("qa-public-demo-terms"));
    }

    function purchase(address holder, uint256 id, uint256 price) internal {
        vm.prank(holder);
        pact.buyLicense{value: price}(id);
    }

    function testExactExpiryPermitsRepurchaseAndCreditsBothSales() public {
        purchase(buyer, 0, PRICE);
        vm.warp(1_059);
        assertTrue(pact.isLicenseValid(0, buyer));
        vm.warp(1_060);
        assertFalse(pact.isLicenseValid(0, buyer));
        purchase(buyer, 0, PRICE);
        assertEq(pact.licenseExpiry(0, buyer), 1_120);
        assertEq(pact.pendingWithdrawals(seller), 2 * PRICE);
    }

    function testRejectedWithdrawalRestoresCreditAndCanRetry() public {
        QASeller receiver = new QASeller(pact);
        uint256 id = receiver.create(PRICE);
        purchase(buyer, id, PRICE);
        receiver.configure(true, false);
        vm.expectRevert("transfer failed");
        receiver.withdraw();
        assertEq(pact.pendingWithdrawals(address(receiver)), PRICE);
        assertEq(address(pact).balance, PRICE);
        receiver.configure(false, false);
        receiver.withdraw();
        assertEq(address(receiver).balance, PRICE);
        assertEq(pact.pendingWithdrawals(address(receiver)), 0);
    }

    function testNestedWithdrawalBlockedWithGuardAndOuterPaymentCompletes() public {
        QASeller receiver = new QASeller(pact);
        uint256 id = receiver.create(PRICE);
        purchase(buyer, id, PRICE);
        receiver.configure(false, true);
        receiver.withdraw();
        assertFalse(receiver.nestedSucceeded());
        assertEq(receiver.nestedError(), abi.encodeWithSignature("ReentrancyGuardReentrantCall()"));
        assertEq(address(receiver).balance, PRICE);
        assertEq(address(pact).balance, 0);
        assertEq(pact.pendingWithdrawals(address(receiver)), 0);
    }

    function testSellerBalancesAndEntitlementsAreIsolated() public {
        vm.prank(other);
        pact.createOffer(PRICE * 2, 120, keccak256("qa-other-terms"));
        purchase(buyer, 0, PRICE);
        purchase(buyer, 1, PRICE * 2);
        assertEq(pact.pendingWithdrawals(seller), PRICE);
        assertEq(pact.pendingWithdrawals(other), PRICE * 2);
        assertFalse(pact.isLicenseValid(0, other));
        vm.prank(buyer);
        vm.expectRevert("nothing to withdraw");
        pact.withdrawProceeds();
        vm.prank(seller);
        pact.withdrawProceeds();
        assertEq(address(pact).balance, PRICE * 2);
        assertEq(pact.pendingWithdrawals(other), PRICE * 2);
    }

    function testDeactivationPreservesEntitlementAndBlocksNewBuyers() public {
        purchase(buyer, 0, PRICE);
        vm.prank(seller);
        pact.deactivateOffer(0);
        assertTrue(pact.isLicenseValid(0, buyer));
        vm.prank(other);
        vm.expectRevert("inactive");
        pact.buyLicense{value: PRICE}(0);
        assertEq(pact.pendingWithdrawals(seller), PRICE);
    }

    function testFuzzUnknownIdsCannotMutateState(uint256 id) public {
        vm.assume(id > 0);
        assertFalse(pact.isLicenseValid(id, buyer));
        vm.prank(buyer);
        vm.expectRevert("unknown offer");
        pact.buyLicense{value: PRICE}(id);
        vm.prank(seller);
        vm.expectRevert("unknown offer");
        pact.deactivateOffer(id);
        assertEq(address(pact).balance, 0);
        assertEq(pact.pendingWithdrawals(seller), 0);
    }

    function testFuzzIncorrectPaymentLeavesNoEntitlementOrCredit(uint96 payment) public {
        vm.assume(uint256(payment) != PRICE);
        vm.deal(buyer, uint256(payment));
        vm.prank(buyer);
        vm.expectRevert("incorrect payment");
        pact.buyLicense{value: payment}(0);
        assertEq(pact.licenseExpiry(0, buyer), 0);
        assertEq(pact.pendingWithdrawals(seller), 0);
        assertEq(address(pact).balance, 0);
    }
}
