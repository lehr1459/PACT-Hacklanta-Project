// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PactLicensing} from "../src/PactLicensing.sol";

contract PactLicensingTest is Test {
    PactLicensing pact;
    address seller = address(0xA11CE);
    address buyer = address(0xB0B);
    uint256 constant PRICE = 0.001 ether;

    function setUp() public {
        pact = new PactLicensing();
        vm.prank(seller);
        pact.createOffer(PRICE, 60, keccak256("terms-v1"));
        vm.deal(buyer, 1 ether);
    }

    function testPurchaseExpiryAndWithdrawal() public {
        vm.prank(buyer);
        pact.buyLicense{value: PRICE}(0);
        assertTrue(pact.isLicenseValid(0, buyer));
        assertEq(pact.pendingWithdrawals(seller), PRICE);
        vm.prank(seller);
        pact.withdrawProceeds();
        assertEq(seller.balance, PRICE);
        vm.warp(block.timestamp + 61);
        assertFalse(pact.isLicenseValid(0, buyer));
    }

    function testRejectDuplicateAndWrongPayment() public {
        vm.prank(buyer);
        vm.expectRevert("incorrect payment");
        pact.buyLicense{value: 1}(0);
        vm.prank(buyer);
        pact.buyLicense{value: PRICE}(0);
        vm.prank(buyer);
        vm.expectRevert("already licensed");
        pact.buyLicense{value: PRICE}(0);
    }

    function testSellerOnlyDeactivate() public {
        vm.prank(buyer);
        vm.expectRevert("not seller");
        pact.deactivateOffer(0);
        vm.prank(seller);
        pact.deactivateOffer(0);
        vm.prank(buyer);
        vm.expectRevert("inactive");
        pact.buyLicense{value: PRICE}(0);
    }

    function testInvalidOfferParameters() public {
        vm.expectRevert("invalid offer");
        pact.createOffer(0, 60, keccak256("terms"));
        vm.expectRevert("invalid offer");
        pact.createOffer(PRICE, 0, keccak256("terms"));
        vm.expectRevert("invalid offer");
        pact.createOffer(PRICE, 60, bytes32(0));
        assertEq(pact.nextOfferId(), 1);
    }

    function testUnknownOffers() public {
        assertFalse(pact.isLicenseValid(1, buyer));
        vm.expectRevert("unknown offer");
        pact.deactivateOffer(1);
        vm.prank(buyer);
        vm.expectRevert("unknown offer");
        pact.buyLicense{value: PRICE}(1);
    }

    function testExpiryBoundaryAndRepurchase() public {
        vm.prank(buyer);
        pact.buyLicense{value: PRICE}(0);
        uint256 expiry = pact.licenseExpiry(0, buyer);
        vm.warp(expiry - 1);
        assertTrue(pact.isLicenseValid(0, buyer));
        vm.warp(expiry);
        assertFalse(pact.isLicenseValid(0, buyer));
        vm.prank(buyer);
        pact.buyLicense{value: PRICE}(0);
        assertEq(pact.licenseExpiry(0, buyer), expiry + 60);
        assertEq(pact.pendingWithdrawals(seller), PRICE * 2);
    }

    function testDeactivationPreservesExistingLicense() public {
        vm.prank(buyer);
        pact.buyLicense{value: PRICE}(0);
        vm.prank(seller);
        pact.deactivateOffer(0);
        assertTrue(pact.isLicenseValid(0, buyer));
        vm.prank(seller);
        vm.expectRevert("already inactive");
        pact.deactivateOffer(0);
    }

    function testPaymentFailuresLeaveStateUnchanged() public {
        vm.startPrank(buyer);
        vm.expectRevert("incorrect payment");
        pact.buyLicense{value: PRICE - 1}(0);
        vm.expectRevert("incorrect payment");
        pact.buyLicense{value: PRICE + 1}(0);
        vm.stopPrank();
        assertEq(pact.licenseExpiry(0, buyer), 0);
        assertEq(pact.pendingWithdrawals(seller), 0);
        assertEq(address(pact).balance, 0);
    }

    function testIndependentBuyersAndUnauthorizedWithdrawal() public {
        address secondBuyer = address(0xCAFE);
        vm.deal(secondBuyer, PRICE);
        vm.prank(buyer);
        pact.buyLicense{value: PRICE}(0);
        vm.prank(secondBuyer);
        pact.buyLicense{value: PRICE}(0);
        assertTrue(pact.isLicenseValid(0, secondBuyer));
        vm.prank(buyer);
        vm.expectRevert("nothing to withdraw");
        pact.withdrawProceeds();
        assertEq(pact.pendingWithdrawals(seller), PRICE * 2);
        vm.prank(seller);
        pact.withdrawProceeds();
        assertEq(address(pact).balance, 0);
        vm.prank(seller);
        vm.expectRevert("nothing to withdraw");
        pact.withdrawProceeds();
    }

    function testFuzzPurchaseAccounting(uint96 price, uint64 duration) public {
        vm.assume(price > 0 && duration > 0);
        vm.prank(seller);
        uint256 id = pact.createOffer(price, duration, keccak256("fuzz terms"));
        vm.deal(buyer, price);
        vm.prank(buyer);
        pact.buyLicense{value: price}(id);
        assertEq(pact.licenseExpiry(id, buyer), block.timestamp + uint256(duration));
        assertEq(pact.pendingWithdrawals(seller), price);
        assertEq(address(pact).balance, price);
    }

    function testRejectedWithdrawalRestoresCredit() public {
        WithdrawalReceiver receiver = new WithdrawalReceiver(pact);
        uint256 id = receiver.createOffer();
        vm.prank(buyer);
        pact.buyLicense{value: PRICE}(id);
        vm.expectRevert("transfer failed");
        receiver.withdraw();
        assertEq(pact.pendingWithdrawals(address(receiver)), PRICE);
        assertEq(address(pact).balance, PRICE);
        receiver.configure(false, false);
        receiver.withdraw();
        assertEq(pact.pendingWithdrawals(address(receiver)), 0);
        assertEq(address(receiver).balance, PRICE);
    }

    function testWithdrawalReentrancyBlocked() public {
        WithdrawalReceiver receiver = new WithdrawalReceiver(pact);
        uint256 id = receiver.createOffer();
        vm.prank(buyer);
        pact.buyLicense{value: PRICE}(id);
        receiver.configure(false, true);
        receiver.withdraw();
        assertFalse(receiver.reentrySucceeded());
        assertEq(pact.pendingWithdrawals(address(receiver)), 0);
        assertEq(address(receiver).balance, PRICE);
        assertEq(address(pact).balance, 0);
    }
}

/// @dev Test-only adversarial payout receiver; not part of deployment.
contract WithdrawalReceiver {
    PactLicensing immutable pact;
    bool reject = true;
    bool attemptReentry;
    bool public reentrySucceeded;

    constructor(PactLicensing target) {
        pact = target;
    }

    function createOffer() external returns (uint256) {
        return pact.createOffer(0.001 ether, 60, keccak256("receiver terms"));
    }

    function configure(bool rejectPayment, bool reenter) external {
        reject = rejectPayment;
        attemptReentry = reenter;
    }

    function withdraw() external {
        pact.withdrawProceeds();
    }

    receive() external payable {
        require(!reject, "rejected");
        if (attemptReentry) {
            (reentrySucceeded,) = address(pact).call(abi.encodeCall(PactLicensing.withdrawProceeds, ()));
        }
    }
}
