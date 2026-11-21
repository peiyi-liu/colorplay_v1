"""Config-backed project closure at actual bootstrap and private FS seams."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

DIRECTORY=Path(__file__).resolve().parents[2]/'scripts/concurrency'
sys.path.insert(0,str(DIRECTORY));sys.path.insert(0,str(Path(__file__).parent))
from test_linux_local_bootstrap import Fixture

class ProjectInputTests(unittest.TestCase):
    def test_actual_bootstrap_copies_tracked_config_template_exactly(self):
        with tempfile.TemporaryDirectory() as temporary:
            f=Fixture(Path(temporary).resolve())
            name='supabase/templates/email-otp.html';target=f.source/name
            target.parent.mkdir(mode=0o700,exist_ok=True);target.write_bytes(b'<p>synthetic OTP template</p>\n')
            result=f.execute()
            self.assertEqual(result['result'],'LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE')
            copied=f.runtime/'local-project'/name
            self.assertTrue(copied.is_file())
            self.assertEqual(copied.read_bytes(),target.read_bytes())


import copy
import subprocess
from unittest.mock import patch
import linux_project_inputs as I
import linux_bootstrap_contracts as C
import linux_suite_support as S

class ClosureTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory();self.addCleanup(self.folder.cleanup)
        self.f=Fixture(Path(self.folder.name).resolve())

    def proof(self):return I.capture_project_inputs(self.f.source,self.f.tracked)

    def rejected_before_mutation(self):
        f=self.f;result=f.execute()
        self.assertEqual((result['result'],result['code']),('FAILED',I.CODE))
        self.assertEqual(f.writes,[]);self.assertFalse(f.runtime.exists());self.assertFalse(f.started)
        self.assertFalse(any(a[0]=='/usr/bin/sudo' for a,_ in f.commands))
        return result

    def test_actual_source_config_readonly_closure_has_all_exact_anchors_and_hashes(self):
        source=DIRECTORY.parents[1]
        tracked=subprocess.check_output(['/usr/bin/git','ls-files','-z','--','supabase'],cwd=source).decode().split('\0')
        proof=I.capture_project_inputs(source,[p for p in tracked if p])
        self.assertEqual(len(proof['dependencies']),5)
        row=next(p for p in proof['dependencies'] if p['path']=='supabase/templates/email-otp.html')
        self.assertEqual([r['key'] for r in row['references']],['auth.email.template.confirmation.content_path','auth.email.template.magic_link.content_path'])
        self.assertEqual({r['anchor'] for r in row['references']},{'PROJECT_ROOT'})
        self.assertEqual(row['sha256'],C.digest((source/row['path']).read_bytes()))
        self.assertEqual(sum(r['anchor']=='SUPABASE_DIR' for p in proof['dependencies'] for r in p['references']),4)
        self.assertEqual(proof['generated'],[{'key':'auth.signing_keys_path','anchor':'SUPABASE_DIR','value':'./signing-keys.json','path':'supabase/signing-keys.json'}])
        self.assertEqual({p['kind'] for p in proof['nonFileReferences']},{'URL_ROUTE','DB_SCHEMA_SEARCH_PATH'})

    def test_pin_binds_config_deduplicated_template_and_private_exact_runtime(self):
        f=self.f;proof=self.proof();result=f.execute()
        self.assertEqual(result['result'],'LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE')
        self.assertEqual(json.loads((f.runtime/'dependency-proof.json').read_bytes()),proof)
        admission=json.loads((f.runtime/'bootstrap-admission.json').read_bytes())
        self.assertEqual(admission['projectInputsSha256'],I.proof_sha256(proof))
        bindings=json.loads((f.runtime/'source-bindings.json').read_bytes())
        for p in [proof['config'],*proof['dependencies']]:self.assertEqual(bindings[p['path']],p['sha256'])
        for p in proof['dependencies']:
            target=f.runtime/'local-project'/p['path']
            self.assertEqual(target.read_bytes(),(f.source/p['path']).read_bytes())
            self.assertEqual(target.stat().st_mode&0o777,0o444 if p['path']=='supabase/templates/email-otp.html' else 0o600)
            self.assertEqual(target.parent.stat().st_mode&0o777,0o700)
        self.assertEqual(len(next(p['references'] for p in proof['dependencies'] if p['path'].endswith('.html'))),2)

    def test_copied_public_mode_is_exact_and_other_inputs_must_remain_private(self):
        f=self.f;proof=self.proof();self.assertEqual(f.execute()['services'],8)
        for name,mode in [('supabase/templates/email-otp.html',0o644),('supabase/seed.sql',0o444)]:
            target=f.runtime/'local-project'/name;original=target.stat().st_mode&0o777
            target.chmod(mode)
            with self.assertRaises(C.BootstrapError):I.verify_copied_inputs(f.runtime/'local-project',proof)
            target.chmod(original)
        row=copy.deepcopy(next(r for r in proof['dependencies'] if r['path']==I.PUBLIC_TEMPLATE))
        row['references'][0]['anchor']='SUPABASE_DIR'
        with self.assertRaises(C.BootstrapError):I.public_template(row)
        copied=f.runtime/'local-project'/I.PUBLIC_TEMPLATE
        os.link(copied,f.parent/'extra-link')
        with self.assertRaises(C.BootstrapError):I.verify_copied_inputs(f.runtime/'local-project',proof)

    def test_public_fd_projection_rejects_path_replacement_even_with_identical_bytes(self):
        f=self.f;row=next(r for r in self.proof()['dependencies'] if r['path']==I.PUBLIC_TEMPLATE)
        target=f.parent/'public-copy.html';body=(f.source/I.PUBLIC_TEMPLATE).read_bytes()
        C.write_once(target,body);fchmod=os.fchmod
        def replace(fd,mode):
            fchmod(fd,mode);target.unlink();target.write_bytes(body);target.chmod(0o444)
        with patch.object(I.os,'fchmod',side_effect=replace),self.assertRaises(C.BootstrapError):
            I.publish_template(target,row)

    def test_missing_untracked_symlink_hardlink_and_nonregular_inputs_are_preflight_failures(self):
        cases=['missing','untracked','symlink','hardlink','directory','config_untracked','config_symlink']
        for case in cases:
            with self.subTest(case=case),tempfile.TemporaryDirectory() as temporary:
                self.f=Fixture(Path(temporary).resolve());f=self.f;name='supabase/templates/email-otp.html';p=f.source/name
                if case=='missing':p.unlink()
                elif case=='untracked':f.tracked.remove(name)
                elif case=='symlink':p.unlink();p.symlink_to(f.source/'supabase/seed.sql')
                elif case=='hardlink':p.unlink();os.link(f.source/'supabase/seed.sql',p)
                elif case=='directory':p.unlink();p.mkdir()
                elif case=='config_untracked':f.tracked.remove('supabase/config.toml')
                else:
                    p=f.source/'supabase/config.toml';raw=p.read_bytes();p.unlink();other=f.source/'copy.toml';other.write_bytes(raw);p.symlink_to(other)
                self.rejected_before_mutation()

    def test_unknown_active_paths_and_wrong_relative_anchor_never_mutate(self):
        additions=['\n[functions.extra]\nimport_map="./supabase/import-map.json"\n',
                   '\n[functions.extra]\nentrypoint="./supabase/index.ts"\n',
                   '\n[functions.extra]\nstatic_files=["./images/*"]\n',
                   '\n[experimental.extra]\nunknown_path="./whatever"\n',
                   '\n[storage.buckets.extra]\nobjects_path="./images"\n']
        mutations=[lambda s,a=a:s+a for a in additions]
        for replacement in ['./templates/email-otp.html','../supabase/templates/email-otp.html','/tmp/template.html','env(EXTERNAL_TEMPLATE)','./supabase/templates/../templates/email-otp.html']:
            mutations.append(lambda s,r=replacement:s.replace('./supabase/templates/email-otp.html',r))
        mutations.append(lambda s:s.replace('schema_paths = []','schema_paths = ["./schemas/*.sql"]'))
        mutations.append(lambda s:s.replace('# signing_keys_path =','signing_keys_path ='))
        for index,change in enumerate(mutations):
            with self.subTest(index=index),tempfile.TemporaryDirectory() as temporary:
                self.f=Fixture(Path(temporary).resolve());p=self.f.source/'supabase/config.toml';p.write_text(change(p.read_text()))
                self.rejected_before_mutation()

    def test_mutated_proof_anchor_or_source_cannot_be_reapproved_during_copy(self):
        f=self.f;proof=self.proof();sha=I.proof_sha256(proof)
        bad=copy.deepcopy(proof);row=next(p for p in bad['dependencies'] if p['path'].endswith('.html'));row['references'][0]['anchor']='SUPABASE_DIR'
        for value,approved in [(bad,sha),(bad,I.proof_sha256(bad))]:
            with self.assertRaises(C.BootstrapError):I.copy_project_inputs(f.source,f.parent/'unused',f.tracked,value,approved)
            self.assertFalse((f.parent/'unused').exists())
        (f.source/'supabase/templates/email-otp.html').write_bytes(b'changed')
        with self.assertRaises(C.BootstrapError):I.copy_project_inputs(f.source,f.parent/'unused',f.tracked,proof,sha)
        self.assertFalse((f.parent/'unused').exists())

    def test_source_change_after_admission_before_runtime_writes_is_rejected(self):
        f=self.f;original=f.system_read
        def read(path):
            if path=='/etc/docker/daemon.json':(f.source/'supabase/templates/email-otp.html').write_bytes(b'changed')
            return original(path)
        f.system_read=read
        self.rejected_before_mutation()

    def test_runtime_copy_mismatch_is_rejected_before_any_service_start(self):
        f=self.f;original=f.run
        def run(args,**options):
            if args[:2]==[f.tools['node']['path'],'-e']:
                target=f.runtime/'local-project/supabase/templates/email-otp.html'
                target.chmod(0o600)  # Simulate an owner changing the approved projection.
                target.write_bytes(b'wrong-copied-bytes')
            return original(args,**options)
        f.run=run
        result=f.execute();self.assertEqual((result['result'],result['code']),('FAILED',I.CODE))
        self.assertFalse(f.started);self.assertFalse((f.runtime/'cli-start-intent.json').exists())

    def test_unreadable_or_unknown_owner_fail_closed_and_error_remains_safe(self):
        with patch.object(I,'read_file',side_effect=PermissionError('SYNTHETIC_PRIVATE_SECRET')):
            result=self.rejected_before_mutation()
        self.assertNotIn('SYNTHETIC_PRIVATE_SECRET',json.dumps(result))
        self.assertEqual(S.safe_bootstrap_outcome(result)['code'],I.CODE)
        uid=os.getuid()
        with patch.object(C.os,'getuid',return_value=uid+1),self.assertRaises(C.BootstrapError):
            self.proof()

if __name__=='__main__':unittest.main()
