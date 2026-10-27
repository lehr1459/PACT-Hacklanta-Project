"""Actual approved SBF with local Ed25519 signatures, blockhashes and replay history.

Random disposable keypairs exist only in memory. Nothing uses RPC, a wallet,
credential files, deployment, or an external transaction sender. These tests are
local execution evidence, not a production security audit or deployment proof.
"""
import hashlib
import json
import struct
import unittest
from pathlib import Path

from solders.account import Account
from solders.clock import Clock
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.litesvm import LiteSVM
from solders.message import Message
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import Transaction
from solders.transaction_metadata import FailedTransactionMetadata
from solders.transaction_status import TransactionErrorFieldless


SOLANA = Path(__file__).resolve().parents[2]
REPOSITORY = SOLANA.parent
ARTIFACT = SOLANA / "artifacts/pact_licensing.so"
PROGRAM = Pubkey(bytes([7]) * 32)
SYSTEM = Pubkey.default()
CREATE = bytes.fromhex("ede9c0a8f807f9f1")
BUY = bytes.fromhex("ff518198a9c9e869")
DEACTIVATE = bytes.fromhex("e95f0b2f84316a43")
OFFER = bytes.fromhex("d7583c47aaa249e5")
LICENSE = bytes.fromhex("f898c364b96cb0e7")
TERMS = hashlib.sha256(b"Opaque public local-runtime fixture commitment").digest()
PRICE, NOW, DURATION = 1_000_000, 1_000, 60
U64_MAX = 2**64 - 1


def create_bytes(nonce=1, price=PRICE, duration=DURATION, terms=TERMS):
    # Deliberately handwritten little-endian bytes, independent of TS builders.
    return CREATE + struct.pack("<QQQ", nonce, price, duration) + terms


class SignedRuntimeQA(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        evidence = json.loads((SOLANA / "artifacts/evidence.json").read_text())
        binary = ARTIFACT.read_bytes()
        if binary[:4] != b"\x7fELF" or hashlib.sha256(binary).hexdigest() != evidence["sha256"]:
            raise RuntimeError("The actual approved ELF must match committed evidence")

    def setUp(self):
        self.svm = (LiteSVM().with_sigverify(True).with_blockhash_check(True)
                    .with_transaction_history(256))
        self.svm.add_program_from_file(PROGRAM, ARTIFACT)
        self.fee_payer, self.seller, self.buyer, self.other = [Keypair() for _ in range(4)]
        self.keys = {key.pubkey(): key for key in
                     (self.fee_payer, self.seller, self.buyer, self.other)}
        for key in self.keys:
            self.svm.set_account(key, Account(50_000_000_000, b"", SYSTEM))
        self.svm.set_clock(Clock(100, 0, 0, 0, NOW))
        self.offer, self.offer_bump = self.offer_address()
        self.license, self.license_bump = self.license_address()

    def offer_address(self, seller=None, nonce=1, program=PROGRAM):
        return Pubkey.find_program_address(
            [b"offer", bytes(seller or self.seller.pubkey()), struct.pack("<Q", nonce)], program)

    def license_address(self, buyer=None, offer=None, program=PROGRAM):
        return Pubkey.find_program_address(
            [b"license", bytes(offer or self.offer), bytes(buyer or self.buyer.pubkey())], program)

    def create(self, *, nonce=1, price=PRICE, duration=DURATION, terms=TERMS, target=None,
               seller_signer=True, seller_writable=True, target_writable=True):
        expected, _ = self.offer_address(nonce=nonce)
        return Instruction(PROGRAM, create_bytes(nonce, price, duration, terms), [
            AccountMeta(self.seller.pubkey(), seller_signer, seller_writable),
            AccountMeta(target or expected, False, target_writable), AccountMeta(SYSTEM, False, False)])

    def buy(self, *, buyer=None, seller=None, target=None, buyer_signer=True,
            buyer_writable=True, seller_writable=True, target_writable=True, system=SYSTEM):
        holder = buyer or self.buyer.pubkey()
        expected, _ = self.license_address(buyer=holder)
        return Instruction(PROGRAM, BUY, [
            AccountMeta(holder, buyer_signer, buyer_writable), AccountMeta(self.offer, False, False),
            AccountMeta(seller or self.seller.pubkey(), False, seller_writable),
            AccountMeta(target or expected, False, target_writable), AccountMeta(system, False, False)])

    def deactivate(self, *, seller=None, signer=True, writable=True):
        return Instruction(PROGRAM, DEACTIVATE, [
            AccountMeta(seller or self.seller.pubkey(), signer, False), AccountMeta(self.offer, False, writable)])

    def transaction(self, instruction, *, omit=(), wrong=None, blockhash=None):
        message = Message.new_with_blockhash(
            [instruction], self.fee_payer.pubkey(), blockhash or self.svm.latest_blockhash())
        signatures = []
        for public in message.account_keys[:message.header.num_required_signatures]:
            key = (wrong or {}).get(public, self.keys.get(public))
            signatures.append(Signature.default() if public in omit or key is None
                              else key.sign_message(bytes(message)))
        return Transaction.populate(message, signatures)

    def execute(self, instruction):
        # Every intentional new attempt gets a new hash. History stays enabled;
        # program errors cannot accidentally be "proved" by duplicate rejection.
        self.svm.expire_blockhash()
        transaction = self.transaction(instruction)
        transaction.verify()
        return self.svm.send_transaction(transaction)

    def ok(self, instruction):
        result = self.execute(instruction)
        self.assertNotIsInstance(result, FailedTransactionMetadata, str(result))
        self.assertGreater(result.compute_units_consumed(), 0)
        return result

    def fails(self, instruction, *, custom=None, error=None):
        result = self.execute(instruction)
        self.assertIsInstance(result, FailedTransactionMetadata, "Invalid instruction succeeded")
        if custom is not None:
            self.assertIn(f"Custom({custom})", str(result.err()))
        if error is not None:
            self.assertIn(error, str(result.err()))
        return result

    def capture(self, *extra):
        # Fee payer is deliberately separate. A program failure may charge its
        # fee while all business accounts must roll back byte-for-byte.
        keys = (self.seller.pubkey(), self.buyer.pubkey(), self.other.pubkey(),
                self.offer, self.license, *extra)
        return {key: self.svm.get_account(key) for key in keys}

    def unchanged(self, before):
        self.assertEqual({key: self.svm.get_account(key) for key in before}, before)

    def set_time(self, timestamp):
        self.svm.set_clock(Clock(101, 0, 0, 0, timestamp))

    def replace_account(self, public, *, owner=None, data=None, lamports=None):
        original = self.svm.get_account(public)
        self.svm.set_account(public, Account(
            original.lamports if lamports is None else lamports,
            original.data if data is None else data, original.owner if owner is None else owner,
            original.executable, original.rent_epoch))

    def test_genuine_create_buy_deactivate_and_exact_direct_payment(self):
        seller_before = self.svm.get_balance(self.seller.pubkey())
        self.ok(self.create())
        offer = self.svm.get_account(self.offer)
        expected = (OFFER + bytes(self.seller.pubkey()) + struct.pack("<QQQ", 1, PRICE, DURATION)
                    + TERMS + bytes([1, self.offer_bump]))
        self.assertEqual(offer.data, expected)
        self.assertEqual(offer.owner, PROGRAM)
        self.assertEqual(seller_before - self.svm.get_balance(self.seller.pubkey()), offer.lamports)
        buyer_before, seller_before = [self.svm.get_balance(k.pubkey()) for k in (self.buyer, self.seller)]
        self.ok(self.buy())
        license = self.svm.get_account(self.license)
        self.assertEqual(license.data, LICENSE + bytes(self.offer) + bytes(self.buyer.pubkey())
                         + struct.pack("<q", NOW + DURATION) + bytes([self.license_bump]))
        self.assertEqual(license.owner, PROGRAM)
        self.assertEqual(buyer_before - self.svm.get_balance(self.buyer.pubkey()), PRICE + license.lamports)
        self.assertEqual(self.svm.get_balance(self.seller.pubkey()) - seller_before, PRICE)
        self.ok(self.deactivate())
        self.assertEqual(self.svm.get_account(self.offer).data, expected[:96] + b"\0" + expected[97:])
        self.assertEqual(self.svm.get_account(self.license), license)
        before = self.capture()
        self.fails(self.buy(), custom=6004)
        self.unchanged(before)

    def test_zero_partial_and_wrong_crypto_signatures_fail_before_program_execution(self):
        cases = [
            ("zero", {"omit": (self.fee_payer.pubkey(), self.seller.pubkey())}),
            ("missing-seller", {"omit": (self.seller.pubkey(),)}),
            ("missing-fee-payer", {"omit": (self.fee_payer.pubkey(),)}),
            ("wrong-seller-key", {"wrong": {self.seller.pubkey(): self.other}}),
            ("wrong-fee-key", {"wrong": {self.fee_payer.pubkey(): self.other}}),
        ]
        for label, options in cases:
            with self.subTest(kind=label):
                self.svm.expire_blockhash()
                transaction = self.transaction(self.create(), **options)
                self.assertFalse(all(transaction.verify_with_results()))
                before = self.capture()
                result = self.svm.send_transaction(transaction)
                self.assertIsInstance(result, FailedTransactionMetadata)
                self.assertEqual(result.err(), TransactionErrorFieldless.SignatureFailure)
                self.unchanged(before)

    def test_invalid_purchase_signatures_cannot_pay_even_with_valid_fee_payer(self):
        self.ok(self.create())
        for label, options in [
            ("zero", {"omit": (self.buyer.pubkey(), self.fee_payer.pubkey())}),
            ("missing-buyer", {"omit": (self.buyer.pubkey(),)}),
            ("missing-fee-payer", {"omit": (self.fee_payer.pubkey(),)}),
            ("wrong-buyer-key", {"wrong": {self.buyer.pubkey(): self.other}}),
        ]:
            with self.subTest(kind=label):
                self.svm.expire_blockhash()
                transaction = self.transaction(self.buy(), **options)
                before = self.capture()
                result = self.svm.send_transaction(transaction)
                self.assertIsInstance(result, FailedTransactionMetadata)
                self.assertEqual(result.err(), TransactionErrorFieldless.SignatureFailure)
                self.unchanged(before)

    def test_mutating_a_signed_message_invalidates_cryptographic_authority(self):
        signed = self.transaction(self.create())
        mutated = Message.new_with_blockhash([self.create(price=PRICE + 1)],
                                             self.fee_payer.pubkey(), signed.message.recent_blockhash)
        tampered = Transaction.populate(mutated, signed.signatures)
        self.assertFalse(all(tampered.verify_with_results()))
        before = self.capture()
        result = self.svm.send_transaction(tampered)
        self.assertIsInstance(result, FailedTransactionMetadata)
        self.assertEqual(result.err(), TransactionErrorFieldless.SignatureFailure)
        self.unchanged(before)

    def test_valid_fee_signature_does_not_replace_required_program_signer_flags(self):
        before = self.capture()
        self.fails(self.create(seller_signer=False), error="MissingRequiredSignature")
        self.unchanged(before)
        self.ok(self.create())
        for instruction in (self.buy(buyer_signer=False), self.deactivate(signer=False)):
            before = self.capture()
            self.fails(instruction, error="MissingRequiredSignature")
            self.unchanged(before)

    def test_wrong_seller_cannot_receive_payment_or_deactivate(self):
        self.ok(self.create())
        for instruction in (self.buy(seller=self.other.pubkey()), self.deactivate(seller=self.other.pubkey())):
            before = self.capture()
            self.fails(instruction, custom=6003)
            self.unchanged(before)
        self.svm.expire_blockhash()
        forged = self.transaction(self.deactivate(), wrong={self.seller.pubkey(): self.other})
        before = self.capture()
        result = self.svm.send_transaction(forged)
        self.assertIsInstance(result, FailedTransactionMetadata)
        self.assertEqual(result.err(), TransactionErrorFieldless.SignatureFailure)
        self.unchanged(before)

    def test_buyer_equals_seller_is_valid_and_costs_only_license_rent(self):
        self.ok(self.create())
        own_license, bump = self.license_address(buyer=self.seller.pubkey())
        before = self.svm.get_balance(self.seller.pubkey())
        self.ok(self.buy(buyer=self.seller.pubkey()))
        license = self.svm.get_account(own_license)
        self.assertEqual(before - self.svm.get_balance(self.seller.pubkey()), license.lamports)
        self.assertEqual(license.data, LICENSE + bytes(self.offer) + bytes(self.seller.pubkey())
                         + struct.pack("<q", NOW + DURATION) + bytes([bump]))
        self.assertIsNone(self.svm.get_account(self.license))

    def test_invalid_alias_targets_do_not_change_payment_or_entitlement(self):
        before = self.capture()
        self.fails(self.create(target=self.seller.pubkey()), custom=6001)
        self.unchanged(before)
        self.ok(self.create())
        for target in (self.offer, self.seller.pubkey(), self.buyer.pubkey()):
            before = self.capture()
            self.fails(self.buy(target=target), custom=6001)
            self.unchanged(before)

    def test_readonly_business_accounts_cannot_gain_implicit_fee_payer_privileges(self):
        for instruction in (self.create(seller_writable=False), self.create(target_writable=False)):
            before = self.capture()
            self.fails(instruction, custom=6007)
            self.unchanged(before)
        self.ok(self.create())
        for instruction in (self.buy(buyer_writable=False), self.buy(seller_writable=False),
                            self.buy(target_writable=False), self.deactivate(writable=False)):
            before = self.capture()
            self.fails(instruction, custom=6007)
            self.unchanged(before)

    def test_prefunded_pdas_initialize_with_exact_rent_topups(self):
        self.svm.set_account(self.offer, Account(1, b"", SYSTEM))
        self.svm.set_account(self.license, Account(1, b"", SYSTEM))
        self.ok(self.create())
        buyer_before = self.svm.get_balance(self.buyer.pubkey())
        seller_before = self.svm.get_balance(self.seller.pubkey())
        self.ok(self.buy())
        rent = self.svm.minimum_balance_for_rent_exemption(81)
        self.assertEqual(self.svm.get_account(self.license).lamports, rent)
        self.assertEqual(buyer_before - self.svm.get_balance(self.buyer.pubkey()), PRICE + rent - 1)
        self.assertEqual(self.svm.get_balance(self.seller.pubkey()) - seller_before, PRICE)

    def test_exact_expiry_repurchase_uses_new_hash_and_no_second_rent(self):
        self.ok(self.create()); self.ok(self.buy())
        before = self.capture()
        self.fails(self.buy(), custom=6005)
        self.unchanged(before)
        self.set_time(NOW + DURATION)
        buyer_before, seller_before = [self.svm.get_balance(k.pubkey()) for k in (self.buyer, self.seller)]
        old = self.svm.get_account(self.license)
        self.ok(self.buy())
        renewed = self.svm.get_account(self.license)
        self.assertEqual(renewed.lamports, old.lamports)
        self.assertEqual(renewed.data[:72], old.data[:72])
        self.assertEqual(struct.unpack_from("<q", renewed.data, 72)[0], NOW + 2 * DURATION)
        self.assertEqual(buyer_before - self.svm.get_balance(self.buyer.pubkey()), PRICE)
        self.assertEqual(self.svm.get_balance(self.seller.pubkey()) - seller_before, PRICE)

    def test_failed_payment_rolls_back_full_business_accounts_but_can_charge_fee_payer(self):
        self.ok(self.create())
        self.replace_account(self.buyer.pubkey(), lamports=self.svm.minimum_balance_for_rent_exemption(81) + PRICE - 1)
        before = self.capture()
        fee_before = self.svm.get_balance(self.fee_payer.pubkey())
        self.fails(self.buy(), error="Custom(1)")
        self.unchanged(before)
        self.assertLess(self.svm.get_balance(self.fee_payer.pubkey()), fee_before)

    def test_negative_clock_and_i64_expiry_overflow_roll_back(self):
        self.ok(self.create())
        for timestamp in (-1, 2**63 - 30):
            self.set_time(timestamp)
            before = self.capture()
            self.fails(self.buy(), custom=6008)
            self.unchanged(before)

    def test_u64_max_price_is_preserved_and_unpayable_purchase_is_atomic(self):
        self.ok(self.create(price=U64_MAX))
        self.assertEqual(struct.unpack_from("<Q", self.svm.get_account(self.offer).data, 48)[0], U64_MAX)
        before = self.capture()
        self.fails(self.buy(), error="Custom(1)")
        self.unchanged(before)

    def test_destination_lamport_overflow_rolls_back_rent_and_payment(self):
        self.ok(self.create())
        self.replace_account(self.seller.pubkey(), lamports=U64_MAX - PRICE + 1)
        before = self.capture()
        self.fails(self.buy(), error="ArithmeticOverflow")
        self.unchanged(before)

    def test_owner_and_runtime_program_namespaces_are_enforced(self):
        self.ok(self.create())
        original = self.svm.get_account(self.offer)
        self.replace_account(self.offer, owner=self.other.pubkey())
        before = self.capture()
        self.fails(self.buy(), custom=6002)
        self.unchanged(before)
        self.svm.set_account(self.offer, original)
        alternate = Pubkey(bytes([8]) * 32)
        self.svm.add_program_from_file(alternate, ARTIFACT)
        instruction = self.buy()
        before = self.capture()
        self.fails(Instruction(alternate, instruction.data, instruction.accounts), custom=6002)
        self.unchanged(before)

    def test_malformed_offer_and_expired_license_cannot_redirect_signed_payment(self):
        self.ok(self.create())
        original = self.svm.get_account(self.offer)
        for data, error in [(original.data[:-1], 6007), (bytes(8) + original.data[8:], 6007),
                            (original.data[:-1] + bytes([original.data[-1] ^ 1]), 6001)]:
            self.replace_account(self.offer, data=data)
            before = self.capture()
            self.fails(self.buy(), custom=error)
            self.unchanged(before)
        self.svm.set_account(self.offer, original)
        self.ok(self.buy()); self.set_time(NOW + DURATION)
        original = self.svm.get_account(self.license)
        variants = [original.data[:-1], bytes(8) + original.data[8:],
                    original.data[:40] + bytes(self.other.pubkey()) + original.data[72:],
                    original.data[:-1] + bytes([original.data[-1] ^ 1])]
        for data in variants:
            self.replace_account(self.license, data=data)
            before = self.capture()
            self.fails(self.buy(), custom=6007)
            self.unchanged(before)

    def test_all_instruction_lengths_and_account_counts_are_exact(self):
        for index, instruction in enumerate((self.create(), self.buy(), self.deactivate())):
            variants = [Instruction(PROGRAM, instruction.data + b"\0", instruction.accounts),
                        Instruction(PROGRAM, instruction.data[:-1], instruction.accounts),
                        Instruction(PROGRAM, instruction.data, instruction.accounts[:-1]),
                        Instruction(PROGRAM, instruction.data, instruction.accounts + [AccountMeta(self.other.pubkey(), False, False)])]
            for malformed in variants:
                before = self.capture()
                self.fails(malformed, error="InvalidInstructionData")
                self.unchanged(before)
            if index == 0:
                self.ok(self.create())

    def test_stale_blockhash_and_duplicate_transaction_cannot_apply_twice(self):
        stale = self.transaction(self.create())
        stale.verify(); self.svm.expire_blockhash()
        before = self.capture()
        rejected = self.svm.send_transaction(stale)
        self.assertIsInstance(rejected, FailedTransactionMetadata)
        self.assertEqual(rejected.err(), TransactionErrorFieldless.BlockhashNotFound)
        self.unchanged(before)
        self.ok(self.create())
        transaction = self.transaction(self.buy()); transaction.verify()
        result = self.svm.send_transaction(transaction)
        self.assertNotIsInstance(result, FailedTransactionMetadata, str(result))
        before = self.capture()
        duplicate = self.svm.send_transaction(transaction)
        self.assertIsInstance(duplicate, FailedTransactionMetadata)
        self.assertEqual(duplicate.err(), TransactionErrorFieldless.AlreadyProcessed)
        self.unchanged(before)

    def test_independent_golden_instruction_bytes_match_runtime_not_a_second_sdk_encoder(self):
        # Node protocol-golden tests separately compare these immutable vectors to
        # actual SDK builders. This local chain lane requires no npm install.
        golden = json.loads((REPOSITORY / "packages/pact-sdk/tests/golden/protocol-v1.json").read_text())
        ordinary = next(vector for vector in golden["vectors"] if vector["name"] == "ordinary")
        self.assertEqual((int(ordinary["nonce"]), int(ordinary["priceLamports"]),
                          int(ordinary["durationSeconds"])), (1, PRICE, DURATION))
        terms = bytes.fromhex(ordinary["metadataKeccak256"][2:])
        expected = create_bytes(int(ordinary["nonce"]), int(ordinary["priceLamports"]),
                                int(ordinary["durationSeconds"]), terms)
        self.assertEqual(bytes.fromhex(ordinary["instructions"]["create"]["dataHex"]), expected)
        self.assertEqual(bytes.fromhex(ordinary["instructions"]["buy"]["dataHex"]), BUY)
        self.assertEqual(bytes.fromhex(ordinary["instructions"]["deactivate"]["dataHex"]), DEACTIVATE)
        self.ok(self.create(terms=terms))
        self.assertEqual(self.svm.get_account(self.offer).data[48:96], struct.pack("<QQ", PRICE, DURATION) + terms)
        before = self.capture()
        encoded = bytearray(create_bytes(nonce=2)); encoded[24:32] = struct.pack(">Q", DURATION)
        target, _ = self.offer_address(nonce=2)
        wrong_endian = Instruction(PROGRAM, bytes(encoded), self.create(nonce=2).accounts)
        self.fails(wrong_endian, custom=6000)
        self.assertIsNone(self.svm.get_account(target)); self.unchanged(before)
        wrong_opcode = Instruction(PROGRAM, bytes([BUY[0] ^ 1]) + BUY[1:], self.buy().accounts)
        self.fails(wrong_opcode, error="InvalidInstructionData"); self.unchanged(before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
