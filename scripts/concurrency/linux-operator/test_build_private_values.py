"""Check the actual build scanner's fresh HMAC and nested JWK secrets."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("activation", Path(__file__).with_name("activate-candidate.py"))
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)

class RuntimeSecretsTests(unittest.TestCase):
    def test_nested_private_jwk_is_scanned_and_public_coordinates_are_not_secrets(self):
        value = {"hmacSecret": "H" * 64, "signingKey": {"kty": "EC", "crv": "P-256", "x": "X" * 43, "y": "Y" * 43, "d": "D" * 43}}
        self.assertEqual(activation.runtime_private_values(value), [b"H" * 64, b"D" * 43])
        self.assertTrue(any(secret in b"bundle:" + b"D" * 43 for secret in activation.runtime_private_values(value)))

    def test_missing_or_short_private_material_fails_closed(self):
        for value in [{}, {"hmacSecret": "H" * 64, "signingKey": {"d": "short"}}, {"hmacSecret": "short", "signingKey": {"d": "D" * 43}}]:
            with self.subTest(value=value):
                with self.assertRaises(AssertionError):
                    activation.runtime_private_values(value)
