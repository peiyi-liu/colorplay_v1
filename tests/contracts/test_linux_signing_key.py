"""Actual Node-generated ephemeral keys and bootstrap admission; no real runtime."""
import copy
import json
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile
import unittest

DIRECTORY=Path(__file__).resolve().parents[2]/'scripts/concurrency'
sys.path.insert(0,str(DIRECTORY));sys.path.insert(0,str(Path(__file__).parent))
import linux_bootstrap_backend as B
from test_linux_local_bootstrap import Fixture

NODE=shutil.which('node')


def generated():
    process=subprocess.run([NODE,'-e',B.NODE_JWK],capture_output=True,timeout=15,check=True)
    return json.loads(process.stdout)


class SigningKeyTests(unittest.TestCase):
    def test_actual_node_generator_declares_both_operations(self):
        values=generated();self.assertEqual(len(values),1)
        key=values[0]
        self.assertEqual(key.get('key_ops'),['sign','verify'])
        self.assertEqual(set(key),{'kty','crv','x','y','d','kid','alg','use','key_ops'})
        self.assertEqual((key['kty'],key['crv'],key['alg'],key['use']),('EC','P-256','ES256','sig'))

    def test_actual_node_material_signs_and_verifies_and_each_call_is_fresh(self):
        script="const c=require('node:crypto');const key=c.createPrivateKey({key:JSON.parse(require('node:fs').readFileSync(0,'utf8')),format:'jwk'});const data=Buffer.from('synthetic-key-contract');const sig=c.sign('sha256',data,key);process.stdout.write(JSON.stringify({valid:c.verify('sha256',data,c.createPublicKey(key),sig)}));"
        first,second=generated()[0],generated()[0]
        self.assertTrue(first['kid']!=second['kid'])
        self.assertTrue(first['d']!=second['d'])
        result=subprocess.run([NODE,'-e',script],input=json.dumps(first).encode(),capture_output=True,timeout=15,check=True)
        self.assertEqual(json.loads(result.stdout),{'valid':True})

    def test_actual_node_output_is_admitted_before_single_start_and_private_key_publication(self):
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());f.key=generated()[0]
            result=f.execute()
            self.assertEqual(result['result'],'LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE')
            self.assertTrue(f.started)
            self.assertEqual((f.runtime/'runtime-secret.json').stat().st_mode&0o777,0o600)
            calls=[a for a,_ in f.commands if a[:2]==[f.tools['node']['path'],'-e']]
            self.assertEqual(len(calls),1)

    def test_invalid_operation_declarations_never_start_or_publish_secret(self):
        for ops in [None,[],['verify'],['sign'],['sign','sign','verify'],['sign','verify','unknown'],['verify','sign'],'sign']:
            with self.subTest(operations=ops),tempfile.TemporaryDirectory() as folder:
                f=Fixture(Path(folder).resolve())
                if ops is None:f.key.pop('key_ops',None)
                else:f.key['key_ops']=ops
                result=f.execute()
                self.assertEqual((result['result'],result.get('code')),('FAILED','BOOTSTRAP_JWKS_INVALID'))
                self.assertFalse(f.started);self.assertFalse((f.runtime/'cli-start-intent.json').exists())
                self.assertFalse((f.runtime/'runtime-secret.json').exists())
                self.assertFalse((f.runtime/'local-project/supabase/signing-keys.json').exists())

    def test_wrong_key_shape_never_reaches_service_start(self):
        controls=[('use','enc'),('alg','HS256'),('crv','P-384'),('kty','oct'),('kid',''),('d',''),('x','not-base64'),('y','not-base64'),('extra',True)]
        for field,value in controls:
            with self.subTest(field=field),tempfile.TemporaryDirectory() as folder:
                f=Fixture(Path(folder).resolve());f.key[field]=value;result=f.execute()
                self.assertEqual((result['result'],result.get('code')),('FAILED','BOOTSTRAP_JWKS_INVALID'))
                self.assertFalse(f.started);self.assertFalse((f.runtime/'runtime-secret.json').exists())

    def test_non_single_array_is_rejected_before_any_secret_is_published(self):
        for shape in ['object','none','empty','multiple']:
            with self.subTest(shape=shape),tempfile.TemporaryDirectory() as folder:
                f=Fixture(Path(folder).resolve());original=f.run
                def run(args,**options):
                    if args[:2]==[f.tools['node']['path'],'-e']:
                        values={'object':f.key,'none':None,'empty':[],'multiple':[f.key,copy.deepcopy(f.key)]}
                        return json.dumps(values[shape]).encode()
                    return original(args,**options)
                f.run=run;result=f.execute()
                self.assertEqual((result['result'],result.get('code')),('FAILED','BOOTSTRAP_JWKS_INVALID'))
                self.assertFalse(f.started);self.assertFalse((f.runtime/'runtime-secret.json').exists())

if __name__=='__main__':unittest.main()
