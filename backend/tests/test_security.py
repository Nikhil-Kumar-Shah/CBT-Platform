from backend.app.core.security import (
    hash_password,
    verify_password,
    generate_session_token,
    hash_session_token,
)


def test_password_hashing_and_verification():
    raw_password = "SecurePassword2026!"
    hashed = hash_password(raw_password)

    assert hashed != raw_password
    assert hashed.startswith("$argon2id$")
    assert verify_password(raw_password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password("", hashed) is False


def test_session_token_generation_and_hashing():
    token1 = generate_session_token()
    token2 = generate_session_token()

    assert token1 != token2
    assert len(token1) >= 32

    hash1 = hash_session_token(token1)
    hash2 = hash_session_token(token2)

    assert hash1 != hash2
    # SHA-256 in hex is exactly 64 characters
    assert len(hash1) == 64
    assert len(hash2) == 64
    # Deterministic hashing
    assert hash_session_token(token1) == hash1
