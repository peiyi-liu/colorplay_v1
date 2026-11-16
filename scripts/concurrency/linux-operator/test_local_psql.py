"""Admission for the fixed loopback read-only PostgreSQL adapter."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("local_psql", Path(__file__).with_name("local-psql.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class LocalPsqlTests(unittest.TestCase):
    def setUp(self):
        self.owner = {"projectId": "cp-whole-site-261115", "apiUrl": "http://127.0.0.1:58321", "containers": [{"role": "db", "id": "a" * 64, "name": "/supabase_db_cp-whole-site-261115", "imageId": "sha256:" + "b" * 64}]}
        self.state = {"DB_URL": "postgresql://postgres:localpassword@127.0.0.1:58322/postgres"}
        self.actual = {"id": "a" * 64, "imageId": "sha256:" + "b" * 64, "name": "/supabase_db_cp-whole-site-261115", "project": "cp-whole-site-261115", "running": True}
        self.env = {"PGHOST": "127.0.0.1", "PGPORT": "58322", "PGDATABASE": "postgres", "PGUSER": "postgres", "PGPASSWORD": "localpassword", "PGSSLMODE": "disable", "PGCONNECT_TIMEOUT": "5", "PGOPTIONS": "-c default_transaction_read_only=on"}

    def test_actual_pinned_container_only_and_no_password_in_argv(self):
        argv, env = module.approve_command(self.owner, self.state, self.actual, self.env, module.FLAGS)
        self.assertIn("a" * 64, argv)
        self.assertNotIn("localpassword", repr(argv))
        self.assertEqual(env["PGPASSWORD"], "localpassword")
        self.assertIn("PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000", argv)

    def test_wrong_target_secret_identity_or_extra_option_is_rejected(self):
        for key, value in [("PGHOST", "remote.example"), ("PGPASSWORD", "wrong"), ("PGUSER", "other"), ("PGOPTIONS", "-c default_transaction_read_only=off"), ("PGSERVICE", "hidden")]:
            env = {**self.env, key: value}
            with self.subTest(key=key), self.assertRaises(ValueError):
                module.approve_command(self.owner, self.state, self.actual, env, module.FLAGS)
        with self.assertRaises(ValueError):
            module.approve_command(self.owner, self.state, {**self.actual, "id": "c" * 64}, self.env, module.FLAGS)
        with self.assertRaises(ValueError):
            module.approve_command(self.owner, self.state, self.actual, self.env, [*module.FLAGS, "--command=delete from auth.users"])
