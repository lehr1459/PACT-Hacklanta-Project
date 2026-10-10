"""Execute actual compiled SBF in LiteSVM with synthetic public signer flags.
No keypairs/private keys; signature verification intentionally disabled locally.
"""
import struct
import unittest
from pathlib import Path
from solders.account import Account
from solders.clock import Clock
from solders.instruction import Instruction, AccountMeta
from solders.litesvm import LiteSVM
from solders.message import Message
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import Transaction
from solders.transaction_metadata import FailedTransactionMetadata

PROGRAM = Pubkey(bytes([7]) * 32)
SELLER = Pubkey(bytes([11]) * 32)
BUYER = Pubkey(bytes([12]) * 32)
PAYER = Pubkey(bytes([13]) * 32)
SYSTEM = Pubkey.default()
CREATE = bytes.fromhex('ede9c0a8f807f9f1')
BUY = bytes.fromhex('ff518198a9c9e869')
DEACTIVATE = bytes.fromhex('e95f0b2f84316a43')
PRICE = 1_000_000
NOW = 1_000
SO = Path(__file__).resolve().parents[1] / 'artifacts/pact_licensing.so'

def offer_address(seller=SELLER, nonce=1):
    return Pubkey.find_program_address([b'offer', bytes(seller), struct.pack('<Q', nonce)], PROGRAM)[0]
def license_address(offer, buyer=BUYER):
    return Pubkey.find_program_address([b'license', bytes(offer), bytes(buyer)], PROGRAM)[0]
def create_ix(seller=SELLER, nonce=1, price=PRICE, duration=60, terms=bytes([1])*32, offer=None):
    return Instruction(PROGRAM, CREATE + struct.pack('<QQQ', nonce, price, duration) + terms,
                       [AccountMeta(seller, True, True), AccountMeta(offer or offer_address(seller, nonce), False, True), AccountMeta(SYSTEM, False, False)])
def buy_ix(offer, buyer=BUYER, seller=SELLER, license=None, buyer_signer=True):
    return Instruction(PROGRAM, BUY, [AccountMeta(buyer, buyer_signer, True), AccountMeta(offer, False, False), AccountMeta(seller, False, True), AccountMeta(license or license_address(offer, buyer), False, True), AccountMeta(SYSTEM, False, False)])
def deactivate_ix(offer, seller=SELLER):
    return Instruction(PROGRAM, DEACTIVATE, [AccountMeta(seller, True, False), AccountMeta(offer, False, True)])
def transact(svm, ix):
    message = Message.new_with_blockhash([ix], PAYER, svm.latest_blockhash())
    tx = Transaction.populate(message, [Signature.default()] * message.header.num_required_signatures)
    # All dummy signatures are equal: disabling history avoids false duplicate detection.
    return svm.send_transaction(tx)
def environment():
    svm = LiteSVM().with_sigverify(False).with_transaction_history(0)
    svm.add_program_from_file(PROGRAM, SO)
    for key in [PAYER, SELLER, BUYER]:
        svm.set_account(key, Account(100_000_000, b'', SYSTEM))
    svm.set_clock(Clock(1, 0, 0, 0, NOW))
    return svm

class ProgramTests(unittest.TestCase):
    def setUp(self):
        self.svm = environment()
        self.offer = offer_address()
    def ok(self, ix):
        result = transact(self.svm, ix)
        self.assertNotIsInstance(result, FailedTransactionMetadata, str(result))
        return result
    def fails(self, ix, code=None):
        result = transact(self.svm, ix)
        self.assertIsInstance(result, FailedTransactionMetadata, str(result))
        if code is not None: self.assertIn(f'Custom({code})', str(result.err()))
        return result
    def test_atomic_purchase_exact_direct_settlement(self):
        self.ok(create_ix())
        seller_before = self.svm.get_balance(SELLER)
        buyer_before = self.svm.get_balance(BUYER)
        result = self.ok(buy_ix(self.offer))
        license = self.svm.get_account(license_address(self.offer))
        self.assertEqual(self.svm.get_balance(SELLER) - seller_before, PRICE)
        self.assertEqual(buyer_before - self.svm.get_balance(BUYER), PRICE + license.lamports)
        self.assertEqual(license.owner, PROGRAM)
        self.assertEqual(len(license.data), 81)
        self.assertEqual(license.data[8:40], bytes(self.offer))
        self.assertEqual(license.data[40:72], bytes(BUYER))
        self.assertEqual(struct.unpack_from('<q', license.data, 72)[0], 1060)
        self.assertGreater(result.compute_units_consumed(), 0)
    def test_active_duplicate_rejected_and_exact_expiry_repurchase(self):
        self.ok(create_ix()); self.ok(buy_ix(self.offer))
        before = self.svm.get_account(license_address(self.offer))
        seller_before = self.svm.get_balance(SELLER)
        self.fails(buy_ix(self.offer), 6005)
        self.assertEqual(self.svm.get_account(license_address(self.offer)), before)
        self.assertEqual(self.svm.get_balance(SELLER), seller_before)
        self.svm.set_clock(Clock(2, 0, 0, 0, 1060))
        self.ok(buy_ix(self.offer))
        self.assertEqual(struct.unpack_from('<q', self.svm.get_account(license_address(self.offer)).data, 72)[0], 1120)
        self.assertEqual(self.svm.get_balance(SELLER), seller_before + PRICE)
    def test_deactivation_preserves_existing_license(self):
        self.ok(create_ix()); self.ok(buy_ix(self.offer))
        before = self.svm.get_account(license_address(self.offer))
        self.fails(deactivate_ix(self.offer, BUYER), 6003)
        self.ok(deactivate_ix(self.offer))
        self.assertEqual(self.svm.get_account(self.offer).data[96], 0)
        self.assertEqual(self.svm.get_account(license_address(self.offer)), before)
        self.fails(buy_ix(self.offer), 6004)
        self.fails(deactivate_ix(self.offer), 6009)
    def test_invalid_terms(self):
        for price, duration, terms in [(0,60,bytes([1])*32),(PRICE,0,bytes([1])*32),(PRICE,31536001,bytes([1])*32),(PRICE,60,bytes(32))]:
            self.fails(create_ix(price=price,duration=duration,terms=terms),6000)
        self.assertIsNone(self.svm.get_account(self.offer))
    def test_insufficient_payment_rolls_back_license_initialization(self):
        self.ok(create_ix())
        self.svm.set_account(BUYER, Account(self.svm.minimum_balance_for_rent_exemption(81) + PRICE - 1,b'',SYSTEM))
        before = self.svm.get_balance(BUYER); seller_before=self.svm.get_balance(SELLER)
        self.fails(buy_ix(self.offer))
        self.assertIsNone(self.svm.get_account(license_address(self.offer)))
        self.assertEqual(self.svm.get_balance(BUYER),before)
        self.assertEqual(self.svm.get_balance(SELLER),seller_before)
    def test_binding_and_signer_constraints(self):
        self.ok(create_ix())
        self.fails(buy_ix(self.offer, buyer_signer=False))
        self.fails(buy_ix(self.offer,seller=PAYER),6003)
        self.fails(buy_ix(self.offer,license=Pubkey(bytes([21])*32)),6001)
    def test_prefunded_pdas_supported(self):
        self.svm.set_account(self.offer,Account(1,b'',SYSTEM))
        self.ok(create_ix())
        license=license_address(self.offer)
        self.svm.set_account(license,Account(1,b'',SYSTEM))
        self.ok(buy_ix(self.offer))
        self.assertEqual(self.svm.get_account(license).owner,PROGRAM)
    def test_immutable_offer_rejects_reinitialization(self):
        self.ok(create_ix()); before=self.svm.get_account(self.offer)
        self.fails(create_ix(price=PRICE+1),6006)
        self.assertEqual(self.svm.get_account(self.offer),before)
    def test_expiry_overflow_rolls_back(self):
        self.ok(create_ix())
        self.svm.set_clock(Clock(1,0,0,0,2**63-10))
        self.fails(buy_ix(self.offer),6008)
        self.assertIsNone(self.svm.get_account(license_address(self.offer)))

if __name__ == '__main__': unittest.main(verbosity=2)
