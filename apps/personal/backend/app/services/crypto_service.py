import os
import base64
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

PBKDF2_ITERATIONS = 100_000
SALT_FILE_NAME = "lock.salt"


def _get_or_create_salt(data_dir) -> bytes:
    from pathlib import Path
    salt_path = Path(data_dir) / SALT_FILE_NAME
    if salt_path.exists():
        return salt_path.read_bytes()
    salt = os.urandom(16)
    salt_path.write_bytes(salt)
    return salt


def derive_key(pin: str, data_dir) -> bytes:
    salt = _get_or_create_salt(data_dir)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return kdf.derive(pin.encode("utf-8"))


def hash_pin(pin: str, data_dir) -> str:
    """Store a verifiable hash of the PIN (PBKDF2 with a second salt round)."""
    key = derive_key(pin, data_dir)
    # Double-hash so the stored verifier differs from the encryption key
    return hashlib.sha256(key + b":verify").hexdigest()


def encrypt(plaintext: str, key: bytes) -> str:
    """AES-256-GCM encrypt. Returns base64-encoded nonce+ciphertext."""
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("ascii")


def decrypt(ciphertext_b64: str, key: bytes) -> str:
    """AES-256-GCM decrypt. Raises ValueError on bad key/tampered data."""
    try:
        data = base64.b64decode(ciphertext_b64)
        nonce, ct = data[:12], data[12:]
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ct, None).decode("utf-8")
    except Exception as e:
        raise ValueError("Decryption failed — wrong PIN or corrupted data") from e
