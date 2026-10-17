"""Regenerate public protocol vectors with independent Rust/Python tooling.

Generation only: run with the pinned solana Python environment and Foundry cast.
Ordinary SDK tests read the checked-in JSON and do not run this script.
No keys, network requests, signing, or transactions are used.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess

import solders
from solders.compute_budget import set_compute_unit_limit, set_compute_unit_price
from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.message import MessageV0
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import VersionedTransaction

ROOT = Path(__file__).resolve().parents[4]
PROGRAM = Pubkey.from_string('EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy')
SELLER, BUYER = Pubkey(bytes([1]) * 32), Pubkey(bytes([2]) * 32)
BLOCKHASH, SYSTEM = Hash(bytes([3]) * 32), Pubkey.default()


def discriminator(namespace, name):
    return hashlib.sha256(f'{namespace}:{name}'.encode()).digest()[:8]


def unsigned(payer, instruction):
    message = MessageV0.try_compile(
        payer, [set_compute_unit_limit(200000), set_compute_unit_price(0), instruction], [], BLOCKHASH)
    return base64.b64encode(bytes(VersionedTransaction.populate(message, [Signature.default()]))).decode()


def describe(instruction):
    return {'dataHex': bytes(instruction.data).hex(), 'accounts': [
        {'address': str(meta.pubkey), 'signer': meta.is_signer, 'writable': meta.is_writable}
        for meta in instruction.accounts]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    local_cast = ROOT / 'contracts/.tools/foundry-v1.8.5/cast.exe'
    parser.add_argument('--cast', default=str(local_cast) if local_cast.exists() else shutil.which('cast'))
    parser.add_argument('--output', type=Path, default=Path(__file__).with_name('protocol-v1.json'))
    args = parser.parse_args()
    if not args.cast:
        parser.error('Provide the reviewed Foundry cast executable with --cast.')

    def keccak(data):
        # Stdin also supports the 64 KiB boundary without shell/argument-size limits.
        return subprocess.check_output([args.cast, 'keccak'], input='0x' + data.hex(), text=True).strip()

    # Published Keccak-256 empty-message vector also guards against accidental SHA3 use.
    assert keccak(b'') == '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    create_tag = discriminator('global', 'create_offer')
    buy_tag = discriminator('global', 'buy_license')
    deactivate_tag = discriminator('global', 'deactivate_offer')
    offer_tag, license_tag = discriminator('account', 'Offer'), discriminator('account', 'License')
    vectors = []
    for name, nonce, price, duration, title, terms in [
        ('ordinary', 1, 1000000, 60, 'Golden terms', 'Public test fixture only.'),
        ('minimum', 0, 1, 1, 'Minimum', 'One second.'),
        ('maximum', 2**64 - 1, 2**64 - 1, 31536000, 'Unicode café 🎨', 'Exact UTF-8.\nPreserve whitespace.'),
    ]:
        metadata = json.dumps({'schema': 'pact-solana-license-v1', 'title': title, 'terms': terms,
                               'priceLamports': str(price), 'durationSeconds': str(duration)},
                              ensure_ascii=False, separators=(',', ':'))
        raw = metadata.encode('utf-8')
        terms_hash = keccak(raw)
        offer, offer_bump = Pubkey.find_program_address([b'offer', bytes(SELLER), struct.pack('<Q', nonce)], PROGRAM)
        license_address, license_bump = Pubkey.find_program_address([b'license', bytes(offer), bytes(BUYER)], PROGRAM)
        offer_data = offer_tag + bytes(SELLER) + struct.pack('<QQQ', nonce, price, duration) + bytes.fromhex(terms_hash[2:]) + bytes([1, offer_bump])
        licenses = {state: (license_tag + bytes(offer) + bytes(BUYER) + struct.pack('<qB', expiry, license_bump)).hex()
                    for state, expiry in [('active', 1060), ('equal', 1000), ('expired', 999), ('maximum', 2**63 - 1)]}
        create = Instruction(PROGRAM, create_tag + struct.pack('<QQQ', nonce, price, duration) + bytes.fromhex(terms_hash[2:]),
                             [AccountMeta(SELLER, True, True), AccountMeta(offer, False, True), AccountMeta(SYSTEM, False, False)])
        buy = Instruction(PROGRAM, buy_tag, [AccountMeta(BUYER, True, True), AccountMeta(offer, False, False),
                          AccountMeta(SELLER, False, True), AccountMeta(license_address, False, True), AccountMeta(SYSTEM, False, False)])
        deactivate = Instruction(PROGRAM, deactivate_tag, [AccountMeta(SELLER, True, False), AccountMeta(offer, False, True)])
        assert len(offer_data) == 98 and all(len(bytes.fromhex(value)) == 81 for value in licenses.values())
        vectors.append({'name': name, 'nonce': str(nonce), 'priceLamports': str(price), 'durationSeconds': str(duration),
                        'metadataJson': metadata, 'metadataUtf8Hex': raw.hex(), 'metadataKeccak256': terms_hash,
                        'metadataWithTrailingSpaceKeccak256': keccak(raw + b' '),
                        'offer': str(offer), 'offerBump': offer_bump, 'license': str(license_address), 'licenseBump': license_bump,
                        'offerDataHex': offer_data.hex(), 'licenseDataHex': licenses,
                        'instructions': {'create': describe(create), 'buy': describe(buy), 'deactivate': describe(deactivate)},
                        'unsignedCreateBase64': unsigned(SELLER, create), 'unsignedBuyBase64': unsigned(BUYER, buy)})
    boundary_base = {'schema': 'pact-solana-license-v1', 'title': 'Byte boundary', 'terms': '',
                     'priceLamports': '1', 'durationSeconds': '1'}
    padding = 65536 - len(json.dumps(boundary_base, ensure_ascii=False, separators=(',', ':')).encode())
    boundary = {**boundary_base, 'terms': 'é' * (padding // 2) + 'x' * (padding % 2)}
    boundary_bytes = json.dumps(boundary, ensure_ascii=False, separators=(',', ':')).encode()
    assert len(boundary_bytes) == 65536
    output = {'format': 'pact-independent-protocol-v1', 'provenance': {
        'pdaAndMessageCompiler': f'solders {solders.__version__} (Rust Solana SDK bindings)',
        'binaryEncoding': 'Python struct little-endian; discriminators Python hashlib SHA-256 namespace:name[:8]',
        'metadataHashing': subprocess.check_output([args.cast, '--version'], text=True).splitlines()[0],
        'generation': 'Offline public fixtures; no PACT JavaScript implementation imported; no signatures or broadcasts'},
        'program': str(PROGRAM), 'genesis': 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
        'seller': str(SELLER), 'buyer': str(BUYER), 'blockhash': str(BLOCKHASH), 'lastValidBlockHeight': 200,
        'clock': {'slot': 100, 'timestamp': '1000', 'dataHex': struct.pack('<QqQQq', 100, 0, 0, 0, 1000).hex()},
        'metadataBoundary': {'base': boundary_base, 'fillCharacter': 'é', 'fillCount': padding // 2,
                             'asciiSuffix': 'x' * (padding % 2), 'utf8Bytes': 65536, 'keccak256': keccak(boundary_bytes)},
        'vectors': vectors}
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(args.output)


if __name__ == '__main__':
    main()
