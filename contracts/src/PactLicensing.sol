// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @notice Hackathon demonstration only. Not audited; no real funds.
contract PactLicensing is ReentrancyGuard {
    struct Offer {
        address seller;
        uint256 priceWei;
        uint64 duration;
        bytes32 termsHash;
        bool active;
    }
    uint256 public nextOfferId;
    mapping(uint256 => Offer) public offers;
    mapping(uint256 => mapping(address => uint256)) public licenseExpiry;
    mapping(address => uint256) public pendingWithdrawals;

    event OfferCreated(
        uint256 indexed offerId, address indexed seller, uint256 priceWei, uint64 duration, bytes32 termsHash
    );
    event OfferDeactivated(uint256 indexed offerId);
    event LicensePurchased(uint256 indexed offerId, address indexed buyer, uint256 expiresAt);
    event ProceedsWithdrawn(address indexed seller, uint256 amount);

    function createOffer(uint256 priceWei, uint64 duration, bytes32 termsHash) external returns (uint256 id) {
        require(priceWei > 0 && duration > 0 && termsHash != bytes32(0), "invalid offer");
        id = nextOfferId++;
        offers[id] = Offer(msg.sender, priceWei, duration, termsHash, true);
        emit OfferCreated(id, msg.sender, priceWei, duration, termsHash);
    }

    function deactivateOffer(uint256 id) external {
        require(id < nextOfferId, "unknown offer");
        Offer storage offer = offers[id];
        require(msg.sender == offer.seller, "not seller");
        require(offer.active, "already inactive");
        offer.active = false;
        emit OfferDeactivated(id);
    }

    function buyLicense(uint256 id) external payable {
        require(id < nextOfferId, "unknown offer");
        Offer memory offer = offers[id];
        require(offer.active, "inactive");
        require(msg.value == offer.priceWei, "incorrect payment");
        require(licenseExpiry[id][msg.sender] <= block.timestamp, "already licensed");
        uint256 expiry = block.timestamp + uint256(offer.duration);
        licenseExpiry[id][msg.sender] = expiry;
        pendingWithdrawals[offer.seller] += msg.value;
        emit LicensePurchased(id, msg.sender, expiry);
    }

    function isLicenseValid(uint256 id, address holder) external view returns (bool) {
        return id < nextOfferId && licenseExpiry[id][holder] > block.timestamp;
    }

    function withdrawProceeds() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
        emit ProceedsWithdrawn(msg.sender, amount);
    }
}
