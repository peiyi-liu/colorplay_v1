"""Status contract at actual bootstrap/Node crypto boundaries, never services."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

DIRECTORY=Path(__file__).resolve().parents[2]/'scripts/concurrency'
sys.path.insert(0,str(DIRECTORY));sys.path.insert(0,str(Path(__file__).parent))
import linux_bootstrap_backend as B
from test_linux_local_bootstrap import Fixture

class StatusRedTests(unittest.TestCase):
    def test_derived_config_declares_the_fresh_secret_binding(self):
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());result=f.execute()
            self.assertEqual(result['result'],'LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE')
            config=B.tomllib.loads((f.runtime/'local-project/supabase/config.toml').read_text())
            self.assertEqual(config['auth'].get('jwt_secret'),'env(SUPABASE_AUTH_JWT_SECRET)')

    def test_rejected_status_retains_safe_proof_before_stopping(self):
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());f.bad_status=True
            result=f.execute()
            self.assertEqual(result['result'],'FAILED')
            self.assertTrue((f.runtime/'bootstrap-status-proof.json').exists())
            self.assertIsInstance(result.get('readback'),dict)


import copy
import hashlib
import os
import shutil
import subprocess
from unittest.mock import patch
import linux_status_contracts as D
import linux_suite_support as S
import linux_bootstrap_contracts as C

NODE=shutil.which('node')
SIGN="const fs=require('node:fs'),c=require('node:crypto');const input=JSON.parse(fs.readFileSync(0,'utf8'));const pair=c.generateKeyPairSync('ec',{namedCurve:'P-256'});const k={...pair.privateKey.export({format:'jwk'}),kid:c.randomUUID(),use:'sig',alg:'ES256',key_ops:['sign','verify']};const foreign=c.generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey;const part=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const tokens={};for(const role of ['anon','service_role']){let header={alg:input.mode==='alg'?'HS256':input.mode==='none'?'none':input.mode==='unknown'?'UNSUPPORTED':'ES256',kid:input.mode==='kid'?c.randomUUID():k.kid};let payload={role:input.mode==='role'?'authenticated':role};const signing=part(header)+'.'+part(payload);let sig=c.sign('sha256',Buffer.from(signing),{key:input.mode==='foreign'?foreign:pair.privateKey,dsaEncoding:'ieee-p1363'});if(input.mode==='tamper')sig[0]^=1;tokens[role]=signing+'.'+sig.toString('base64url');}process.stdout.write(JSON.stringify({key:k,tokens}));"

class NodePort:
    def __init__(self):self.calls=[]
    def run(self,args,**_options):
        self.calls.append(args)
        process=subprocess.run(args,capture_output=True,timeout=15,env={'PATH':'/usr/bin:/bin'})
        if process.returncode:raise ValueError('SYNTHETIC_NODE_FAILED')
        return process.stdout

class CryptoTests(unittest.TestCase):
    def exercise(self,mode):
        made=subprocess.run([NODE,'-e',SIGN],input=json.dumps({'mode':mode}).encode(),capture_output=True,timeout=15,check=True)
        data=json.loads(made.stdout);key=data['key'];port=NodePort()
        with tempfile.TemporaryDirectory() as folder:
            runtime=Path(folder).resolve();runtime.chmod(0o700)
            target=runtime/'local-project/supabase';target.mkdir(parents=True,mode=0o700);target.parent.chmod(0o700)
            state={'API_URL':'http://127.0.0.1:58321','DB_URL':'postgresql://postgres:synthetic@127.0.0.1:58322/postgres',
                   'JWT_SECRET':'SYNTHETIC_FRESH_HMAC','ANON_KEY':data['tokens']['anon'],'SERVICE_ROLE_KEY':data['tokens']['service_role']}
            raw=json.dumps(state).encode();C.write_once(runtime/'status-secret.json',raw);C.write_once(target/'signing-keys.json',[key])
            actual,proof=D.observe_status(raw,state['JWT_SECRET'],key)
            D.verify_signatures(port,runtime,NODE,key,proof)
            self.assertIsNotNone(D.safe_status(proof))
            self.assertEqual(len(port.calls),1)
            self.assertEqual(port.calls[0],[NODE,'-e',D.NODE_TOKEN_VERIFY,str(runtime/'status-secret.json'),str(target/'signing-keys.json')])
            self.assertNotIn(state['ANON_KEY'],' '.join(port.calls[0]))
            if mode=='valid':
                D.require_status(proof);self.assertTrue(actual is not None)
            else:
                with self.assertRaises(C.BootstrapError):D.require_status(proof)
            return proof

    def test_real_node_p1363_fresh_key_and_all_signature_policy_negatives(self):
        self.assertEqual(self.exercise('valid')['tokens']['anon']['signature'],'VALID')
        for mode in ['foreign','tamper','kid','role','alg','none','unknown']:
            with self.subTest(mode=mode):self.exercise(mode)

    def test_offline_status_collects_all_conditions_without_raw_claims_or_values(self):
        key={'kid':'synthetic-owned'}
        raw=json.dumps({'API_URL':'https://foreign.invalid/SECRET_MARKER','JWT_SECRET':'SECRET_MARKER','DB_URL':'postgresql://other:SECRET_MARKER@foreign.invalid:1/foreign?q=SECRET_MARKER#SECRET_MARKER','ANON_KEY':'SECRET_MARKER','SERVICE_ROLE_KEY':'SECRET_MARKER'}).encode()
        _,proof=D.observe_status(raw,'expected',key)
        self.assertIsNotNone(D.safe_status(proof));self.assertNotIn('SECRET_MARKER',json.dumps(proof))
        self.assertFalse(proof['apiExact']);self.assertFalse(proof['hmacMatch']);self.assertFalse(proof['tokensDistinct'])
        self.assertFalse(proof['db']['host']);self.assertFalse(proof['db']['user'])
        self.assertFalse(proof['db']['query']);self.assertFalse(proof['db']['fragment'])
        _,unknown=D.observe_status(b'not-json', 'expected',key)
        self.assertEqual(unknown['shape'],'INVALID');self.assertIsNone(unknown['hmacMatch'])
        self.assertEqual(unknown['fields']['JWT_SECRET'],'UNAVAILABLE')

    def test_proof_strict_schema_and_parent_fail_closed_on_nested_raw_extras(self):
        _,proof=D.observe_status(b'{}','expected',{'kid':'owned'})
        readback=D.empty_readback();readback['status']=proof
        value={'result':'FAILED','code':'BOOTSTRAP_STATUS_INVALID','readback':readback}
        self.assertEqual(S.safe_bootstrap_outcome(value)['readback'],readback)
        for mutate in [lambda p:p.update(raw='SECRET_MARKER'),lambda p:p['tokens']['anon'].update(rawToken='SECRET_MARKER'),lambda p:p['tokens']['anon'].update(partsCount=True),lambda p:p['tokens']['anon'].update(signature='UNKNOWN_SECRET')]:
            changed=copy.deepcopy(value);mutate(changed['readback']['status'])
            self.assertIsNone(S.safe_bootstrap_outcome(changed))

    def test_fixture_status_failure_stops_readbacks_and_exposes_actual_enum_only(self):
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());original=f.run
            def run(args,**options):
                raw=original(args,**options)
                if args[0]==f.tools['supabase']['path'] and args[1]=='status':
                    value=json.loads(raw);value['JWT_SECRET']='UNEXPECTED_PRIVATE';return json.dumps(value).encode()
                return raw
            f.run=run;result=f.execute();self.assertEqual(result['code'],'BOOTSTRAP_STATUS_INVALID')
            proof=result['readback'];self.assertFalse(proof['status']['hmacMatch'])
            self.assertEqual(proof['containers']['state'],'NOT_REACHED')
            self.assertEqual(proof['authJwks']['state'],'NOT_REACHED')
            self.assertEqual(proof['database']['state'],'NOT_REACHED')
            self.assertNotIn('UNEXPECTED_PRIVATE',json.dumps(result))
            self.assertIsNotNone(S.safe_bootstrap_outcome(result))

    def test_later_readbacks_retain_fixed_failures_without_advancing(self):
        for flag,part in [('bad_port','containers'),('bad_jwks','authJwks'),('bad_baseline','database')]:
            with self.subTest(flag=flag),tempfile.TemporaryDirectory() as folder:
                f=Fixture(Path(folder).resolve());setattr(f,flag,True);result=f.execute()
                self.assertEqual(result['result'],'FAILED');self.assertEqual(result['readback'][part]['state'],'FAIL')
                self.assertIsNotNone(S.safe_bootstrap_outcome(result))
                if part!='database':self.assertEqual(result['readback']['database']['state'],'NOT_REACHED')


    def test_parent_database_pass_requires_complete_exact_baseline(self):
        canonical={'migrations':122,'publicTables':71,'publicWithoutRls':0,'auth':0,'profiles':0,'classrooms':0,'xp':0,'wallet':0,'mediaRuns':0,'mediaAssets':0,'questions':259,'publishedQuestions':258,'reviewCards':9,'hints':17,'blooks':20,'quizTemplates':26}
        readback=D.empty_readback();readback['database']={'state':'PASS','counts':canonical}
        value={'result':'FAILED','code':'BOOTSTRAP_BASELINE_INVALID','readback':readback}
        self.assertIsNotNone(S.safe_bootstrap_outcome(value))
        for counts in [dict.fromkeys(canonical),{**canonical,'auth':1},{**canonical,'migrations':True},{**canonical,'migrations':121},{**canonical,'migrations':123}]:
            with self.subTest(case='INVALID_PASS'):
                invalid=copy.deepcopy(value);invalid['readback']['database']['counts']=counts
                self.assertIsNone(S.safe_bootstrap_outcome(invalid))
        for state,counts in [('UNKNOWN',None),('UNKNOWN',dict.fromkeys(canonical)),('FAIL',{**canonical,'auth':1})]:
            with self.subTest(state=state):
                diagnostic=copy.deepcopy(value);diagnostic['readback']['database']={'state':state,'counts':counts}
                self.assertIsNotNone(S.safe_bootstrap_outcome(diagnostic))

if __name__=='__main__':unittest.main()
