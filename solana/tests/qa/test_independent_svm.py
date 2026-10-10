"""Independent actual-SBF LiteSVM tests. No keys, signing, RPC or deployment.

Fixed bytes below are synthetic PUBLIC addresses. Signer flags are exercised with
zero signatures and sigverify disabled; cryptographic authentication is not tested.
"""
import hashlib
import struct
import unittest
from pathlib import Path

from solders.account import Account
from solders.clock import Clock
from solders.instruction import AccountMeta, Instruction
from solders.litesvm import LiteSVM
from solders.message import Message
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import Transaction
from solders.transaction_metadata import FailedTransactionMetadata

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "artifacts/pact_licensing.so"
PROGRAM = Pubkey(bytes([7]) * 32)
SELLER = Pubkey(bytes([1]) * 32)
BUYER = Pubkey(bytes([2]) * 32)
OTHER = Pubkey(bytes([3]) * 32)
FEE_PAYER = Pubkey(bytes([9]) * 32)
SYSTEM = Pubkey.default()
CREATE = bytes.fromhex("ede9c0a8f807f9f1")
BUY = bytes.fromhex("ff518198a9c9e869")
DEACTIVATE = bytes.fromhex("e95f0b2f84316a43")
OFFER_DISC = bytes.fromhex("d7583c47aaa249e5")
LICENSE_DISC = bytes.fromhex("f898c364b96cb0e7")
PRICE = 1_000_000
TERMS = hashlib.sha256(b"independent QA off-chain demo terms").digest()


def offer_address(seller=SELLER, nonce=0):
    return Pubkey.find_program_address([b"offer", bytes(seller), struct.pack("<Q", nonce)], PROGRAM)


def license_address(offer, buyer=BUYER):
    return Pubkey.find_program_address([b"license", bytes(offer), bytes(buyer)], PROGRAM)


class IndependentProgramQA(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not ARTIFACT.is_file():
            raise RuntimeError(f"Actual compiled SBF program is required: {ARTIFACT}")
        if ARTIFACT.read_bytes()[:4] != b"\x7fELF":
            raise RuntimeError("Program artifact is not ELF")

    def setUp(self):
        self.svm = LiteSVM().with_sigverify(False).with_transaction_history(0)
        self.svm.add_program_from_file(PROGRAM, ARTIFACT)
        self.svm.set_clock(Clock(100, 0, 0, 0, 1000))
        for address in (SELLER, BUYER, OTHER, FEE_PAYER):
            self.svm.set_account(address, Account(10_000_000_000, b"", SYSTEM))

    def transaction(self, instruction):
        # Separate payer ensures buyer/seller is NOT implicitly promoted to signer.
        message = Message.new_with_blockhash([instruction], FEE_PAYER, self.svm.latest_blockhash())
        return Transaction.populate(message, [Signature.default()] * message.header.num_required_signatures)

    def execute(self, instruction, succeeds=True):
        result = self.svm.send_transaction(self.transaction(instruction))
        if succeeds:
            self.assertNotIsInstance(result, FailedTransactionMetadata, str(result))
        else:
            self.assertIsInstance(result, FailedTransactionMetadata, "Invalid transaction unexpectedly succeeded")
        return result

    def create(self, seller=SELLER, nonce=0, price=PRICE, duration=60, terms=TERMS, target=None, signer=True):
        offer, _ = offer_address(seller, nonce)
        instruction = Instruction(PROGRAM, CREATE + struct.pack("<QQQ", nonce, price, duration) + terms,
            [AccountMeta(seller, signer, True), AccountMeta(target or offer, False, True), AccountMeta(SYSTEM, False, False)])
        return offer, instruction

    def initialize_offer(self, **kwargs):
        offer, instruction = self.create(**kwargs)
        self.execute(instruction)
        return offer

    def buy(self, offer, buyer=BUYER, seller=SELLER, license=None, signer=True, writable=True, system=SYSTEM, suffix=b""):
        entitlement, _ = license_address(offer, buyer)
        return Instruction(PROGRAM, BUY + suffix,
            [AccountMeta(buyer, signer, writable), AccountMeta(offer, False, False),
             AccountMeta(seller, False, True), AccountMeta(license or entitlement, False, True), AccountMeta(system, False, False)])

    def deactivate(self, offer, seller=SELLER, signer=True):
        return Instruction(PROGRAM, DEACTIVATE, [AccountMeta(seller, signer, False), AccountMeta(offer, False, True)])

    def balance(self, address):
        account = self.svm.get_account(address)
        return account.lamports if account else 0

    def set_time(self, timestamp):
        self.svm.set_clock(Clock(101, 0, 0, 0, timestamp))

    def assert_no_payment(self, offer, instruction):
        before_buyer, before_seller = self.balance(BUYER), self.balance(SELLER)
        license, _ = license_address(offer)
        before_license = self.svm.get_account(license)
        self.execute(instruction, succeeds=False)
        self.assertEqual(self.balance(BUYER), before_buyer)
        self.assertEqual(self.balance(SELLER), before_seller)
        self.assertEqual(self.svm.get_account(license), before_license)

    def test_exact_direct_settlement_rent_and_buyer_bound_data(self):
        offer = self.initialize_offer()
        self.assertEqual(self.svm.get_account(offer).data[:8], OFFER_DISC)
        before_buyer, before_seller = self.balance(BUYER), self.balance(SELLER)
        self.execute(self.buy(offer))
        license, bump = license_address(offer)
        account = self.svm.get_account(license)
        self.assertEqual(account.owner, PROGRAM)
        self.assertEqual(len(account.data), 81)
        self.assertEqual(account.data[:8], LICENSE_DISC)
        self.assertEqual(account.data[8:40], bytes(offer))
        self.assertEqual(account.data[40:72], bytes(BUYER))
        self.assertEqual(struct.unpack_from("<q", account.data, 72)[0], 1060)
        self.assertEqual(account.data[80], bump)
        self.assertEqual(self.balance(SELLER) - before_seller, PRICE)
        self.assertEqual(before_buyer - self.balance(BUYER), PRICE + account.lamports)
        self.assertIsNone(self.svm.get_account(license_address(offer, OTHER)[0]))

    def test_duplicate_exact_expiry_repurchase_no_second_rent(self):
        offer = self.initialize_offer()
        self.execute(self.buy(offer))
        self.set_time(1059)
        self.assert_no_payment(offer, self.buy(offer))
        license, _ = license_address(offer)
        rent = self.balance(license)
        self.set_time(1060)
        before_buyer, before_seller = self.balance(BUYER), self.balance(SELLER)
        self.execute(self.buy(offer))
        self.assertEqual(before_buyer - self.balance(BUYER), PRICE)
        self.assertEqual(self.balance(SELLER) - before_seller, PRICE)
        self.assertEqual(self.balance(license), rent)
        self.assertEqual(struct.unpack_from("<q", self.svm.get_account(license).data, 72)[0], 1120)

    def test_deactivation_requires_seller_and_does_not_revoke(self):
        offer = self.initialize_offer()
        self.execute(self.buy(offer))
        license, _ = license_address(offer)
        license_data = self.svm.get_account(license).data
        self.execute(self.deactivate(offer, OTHER), succeeds=False)
        self.execute(self.deactivate(offer), succeeds=True)
        self.assertEqual(self.svm.get_account(offer).data[96], 0)
        self.assertEqual(self.svm.get_account(license).data, license_data)
        self.assert_no_payment(offer, self.buy(offer))
        self.execute(self.deactivate(offer), succeeds=False)

    def test_missing_buyer_signer_readonly_buyer_wrong_seller_wrong_system(self):
        offer = self.initialize_offer()
        for instruction in (self.buy(offer, signer=False), self.buy(offer, writable=False),
                            self.buy(offer, seller=OTHER), self.buy(offer, system=OTHER)):
            with self.subTest(instruction=instruction.data.hex()):
                self.assert_no_payment(offer, instruction)

    def test_wrong_license_pda_cannot_buy_or_reassign_entitlement(self):
        offer = self.initialize_offer()
        wrong_license, _ = license_address(offer, OTHER)
        self.assert_no_payment(offer, self.buy(offer, license=wrong_license))
        self.assertIsNone(self.svm.get_account(wrong_license))

    def test_insufficient_price_rolls_back_rent_initialization_and_payment(self):
        offer = self.initialize_offer()
        rent = self.svm.minimum_balance_for_rent_exemption(81)
        self.svm.set_account(BUYER, Account(rent + PRICE - 1, b"", SYSTEM))
        self.assert_no_payment(offer, self.buy(offer))
        self.assertIsNone(self.svm.get_account(license_address(offer)[0]))

    def test_prefunded_offer_and_license_initialize_without_donation_dos(self):
        offer, instruction = self.create()
        self.svm.set_account(offer, Account(1, b"", SYSTEM))
        self.execute(instruction)
        license, _ = license_address(offer)
        self.svm.set_account(license, Account(1, b"", SYSTEM))
        before_buyer, before_seller = self.balance(BUYER), self.balance(SELLER)
        self.execute(self.buy(offer))
        rent = self.svm.minimum_balance_for_rent_exemption(81)
        self.assertEqual(self.balance(license), rent)
        self.assertEqual(before_buyer - self.balance(BUYER), PRICE + rent - 1)
        self.assertEqual(self.balance(SELLER) - before_seller, PRICE)

    def test_invalid_creation_boundaries_and_missing_seller_signer(self):
        for kwargs in ({"price": 0}, {"duration": 0}, {"duration": 31536001}, {"terms": bytes(32)}, {"signer": False}):
            with self.subTest(kwargs=kwargs):
                offer, instruction = self.create(**kwargs)
                before = self.balance(SELLER)
                self.execute(instruction, succeeds=False)
                self.assertEqual(self.balance(SELLER), before)
                self.assertIsNone(self.svm.get_account(offer))
        self.initialize_offer(nonce=(2**64 - 1), duration=31536000)

    def test_reinitialization_and_wrong_offer_pda_rejected(self):
        offer = self.initialize_offer()
        original = self.svm.get_account(offer)
        self.execute(self.create(price=2 * PRICE)[1], succeeds=False)
        self.assertEqual(self.svm.get_account(offer), original)
        self.execute(self.create(nonce=1, target=offer)[1], succeeds=False)
        self.assertEqual(self.svm.get_account(offer), original)

    def test_extra_payment_argument_is_rejected_instead_of_overriding_price(self):
        offer = self.initialize_offer()
        self.assert_no_payment(offer, self.buy(offer, suffix=struct.pack("<Q", 1)))

    def test_wrong_offer_owner_size_discriminator_bump_are_rejected(self):
        offer = self.initialize_offer()
        original = self.svm.get_account(offer)
        mutations = [(OTHER, original.data), (PROGRAM, original.data[:-1]),
                     (PROGRAM, b"\0" * 8 + original.data[8:]),
                     (PROGRAM, original.data[:-1] + bytes([original.data[-1] ^ 1]))]
        for owner, data in mutations:
            with self.subTest(owner=str(owner), size=len(data)):
                self.svm.set_account(offer, Account(original.lamports, data, owner))
                self.assert_no_payment(offer, self.buy(offer))
        self.svm.set_account(offer, original)

    def test_corrupt_license_cannot_redirect_payment_or_holder(self):
        offer = self.initialize_offer()
        self.execute(self.buy(offer))
        license, _ = license_address(offer)
        original = self.svm.get_account(license)
        self.set_time(1060)
        mutations = [(OTHER, original.data), (PROGRAM, original.data[:-1]),
                     (PROGRAM, b"\0" * 8 + original.data[8:]),
                     (PROGRAM, original.data[:40] + bytes(OTHER) + original.data[72:]),
                     (PROGRAM, original.data[:-1] + bytes([original.data[-1] ^ 1]))]
        for owner, data in mutations:
            with self.subTest(owner=str(owner), size=len(data)):
                self.svm.set_account(license, Account(original.lamports, data, owner))
                self.assert_no_payment(offer, self.buy(offer))

    def test_negative_clock_and_expiry_overflow_rollback(self):
        offer = self.initialize_offer()
        for timestamp in (-1, 2**63 - 30):
            with self.subTest(timestamp=timestamp):
                self.set_time(timestamp)
                self.assert_no_payment(offer, self.buy(offer))

    def test_unsigned_simulation_returns_post_accounts_without_persisting_state(self):
        offer = self.initialize_offer()
        before_buyer, before_seller = self.balance(BUYER), self.balance(SELLER)
        result = self.svm.simulate_transaction(self.transaction(self.buy(offer)))
        self.assertNotIsInstance(result, FailedTransactionMetadata, str(result))
        license, _ = license_address(offer)
        post = dict(result.post_accounts())
        self.assertEqual(post[SELLER].lamports - before_seller, PRICE)
        self.assertEqual(post[license].owner, PROGRAM)
        self.assertEqual(self.balance(BUYER), before_buyer)
        self.assertEqual(self.balance(SELLER), before_seller)
        self.assertIsNone(self.svm.get_account(license))


if __name__ == "__main__":
    unittest.main(verbosity=2)
