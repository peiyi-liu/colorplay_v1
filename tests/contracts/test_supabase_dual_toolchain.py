"""Trusted synthetic vendor archives and real private filesystem; no Linux ELF."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2];DIRECTORY=ROOT/'scripts/concurrency'
sys.path.insert(0,str(DIRECTORY));sys.path.insert(0,str(Path(__file__).parent))
import linux_bootstrap_contracts as C
from test_prepare_linux_runner import archive
spec=importlib.util.spec_from_file_location('dual_setup',DIRECTORY/'prepare-linux-runner.py')
P=importlib.util.module_from_spec(spec);spec.loader.exec_module(P)

class DualBinaryTests(unittest.TestCase):
    def test_actual_installer_no_longer_drops_companion_from_approved_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve();source=root/'colorplay-live-recovery';source.mkdir()
            parent=root/'live-recovery-runtime';tools=parent/'tools'
            node=archive([('node-v24.18.0-linux-x64/bin/node',b'node',tarfile.REGTYPE)])
            dual=archive([('supabase',b'shim',tarfile.REGTYPE),('supabase-go',b'go',tarfile.REGTYPE)])
            def download(url,*_args):
                if 'nodejs.org' in url:return node
                if 'supabase_linux_amd64' in url:return dual
                raise RuntimeError('STOP_AFTER_TOOL_EXTRACTION')
            def command(argv,**_options):
                return b'a'*40 if argv[1:3]==['rev-parse','HEAD'] else b''
            env={'GITHUB_REPOSITORY':'peiyi-liu/colorplay_v1','GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'capacity-linux','GITHUB_SHA':'a'*40}
            vendor={'bytes':len(dual),'sha256':hashlib.sha256(dual).hexdigest(),'members':{
                'supabase':{'bytes':4,'sha256':hashlib.sha256(b'shim').hexdigest()},
                'supabase-go':{'bytes':2,'sha256':hashlib.sha256(b'go').hexdigest()}}}
            mask=os.umask(0o077);os.umask(mask)
            with patch.object(P,'SOURCE',source),patch.object(P,'PARENT',parent),patch.object(P,'TOOLS',tools),\
                    patch.object(P,'download',side_effect=download),patch.object(P,'command',side_effect=command),\
                    patch.dict(os.environ,env,clear=True),patch.object(sys,'argv',['setup','a'*40]),\
                    patch.object(sys,'platform','linux'),patch.object(P.platform,'machine',return_value='x86_64'):
                extra=patch.object(P,'SUPABASE_VENDOR',vendor,create=True)
                with extra:
                    try:
                        with self.assertRaisesRegex(RuntimeError,'STOP_AFTER_TOOL_EXTRACTION'):P.main()
                    finally:os.umask(mask)
            self.assertEqual((tools/'supabase').read_bytes(),b'shim')
            self.assertEqual((tools/'supabase-go').read_bytes(),b'go')


# Pinner uses Source-only public operator imports; no installed/private operator.
sys.path.insert(0,str(DIRECTORY/'linux-operator'))
spec=importlib.util.spec_from_file_location('dual_pinner',DIRECTORY/'linux-operator/pin-execution-profile.py')
Q=importlib.util.module_from_spec(spec);spec.loader.exec_module(Q)
from test_linux_local_bootstrap import Fixture
from test_snapshot_local_evidence import Fixture as SnapshotFixture

class ClosureTests(unittest.TestCase):
    def test_real_pinner_accepts_complete_independently_approved_toolchain(self):
        with tempfile.TemporaryDirectory() as temporary:
            f=SnapshotFixture(Path(temporary).resolve())
            env={**f.environment,'GITHUB_SHA':'a'*40}
            def command(args):
                if args==[f.tools['supabaseGo']['path'],'--version']:return '2.109.1\n'
                if args==[f.tools['supabase']['path'],'start','--help']:return 'Start local development\n'
                raise AssertionError('UNEXPECTED_PROCESS')
            with patch.object(Q,'SOURCE',f.source),patch.object(Q,'RUNTIME',f.runtime),\
                    patch.object(Q,'command',side_effect=command),patch.dict(os.environ,env,clear=True):
                value,tools=Q.approved_inputs('a'*40,C.digest((f.runtime/'bootstrap-input.json').read_bytes()))
            self.assertEqual(tools['supabaseGo'],f.tools['supabaseGo'])
            self.assertEqual(value['sourceRevision'],'a'*40)

class ArchiveAdmissionTests(unittest.TestCase):
    def pins(self,raw,rows):
        return {'bytes':len(raw),'sha256':C.digest(raw),'members':{
            name:{'bytes':len(body),'sha256':C.digest(body)} for name,body in rows.items()}}

    def test_complete_pair_has_exact_bytes_owner_mode_and_no_links(self):
        rows={'supabase':b'shim','supabase-go':b'go'}
        raw=archive([(name,body,tarfile.REGTYPE) for name,body in rows.items()])
        with tempfile.TemporaryDirectory() as temporary:
            tools=Path(temporary).resolve();tools.chmod(0o700)
            with patch.object(P,'TOOLS',tools):P.install_supabase(raw,self.pins(raw,rows))
            for name,body in rows.items():
                path=tools/name;info=path.lstat()
                self.assertEqual(path.read_bytes(),body)
                self.assertEqual((info.st_uid,info.st_nlink,info.st_mode&0o777),(os.getuid(),1,0o700))
            with patch.object(P,'TOOLS',tools),self.assertRaisesRegex(ValueError,'OUTPUT_EXISTS'):
                P.install_supabase(raw,self.pins(raw,rows))
            self.assertEqual((tools/'supabase-go').read_bytes(),b'go')

    def test_invalid_archive_or_member_is_rejected_before_any_output(self):
        valid=[('supabase',b'shim',tarfile.REGTYPE),('supabase-go',b'go',tarfile.REGTYPE)]
        cases=[valid[:1],valid+[valid[1]],valid+[('extra',b'x',tarfile.REGTYPE)],
               [valid[0],('supabase-go',b'/bin/sh',tarfile.SYMTYPE)],
               [valid[0],('supabase-go',b'supabase',tarfile.LNKTYPE)]]
        for case in cases:
            with self.subTest(rows=[r[0:1]+r[2:] for r in case]),tempfile.TemporaryDirectory() as temporary:
                tools=Path(temporary).resolve();tools.chmod(0o700);raw=archive(case)
                pins=self.pins(raw,{'supabase':b'shim','supabase-go':b'go'})
                with patch.object(P,'TOOLS',tools),self.assertRaises(ValueError):P.install_supabase(raw,pins)
                self.assertEqual(list(tools.iterdir()),[])
        for field in ['archive_digest','archive_size','member_digest','member_size']:
            with self.subTest(field=field),tempfile.TemporaryDirectory() as temporary:
                tools=Path(temporary).resolve();tools.chmod(0o700);raw=archive(valid)
                pins=self.pins(raw,{'supabase':b'shim','supabase-go':b'go'})
                if field=='archive_digest':pins['sha256']='0'*64
                if field=='archive_size':pins['bytes']+=1
                if field=='member_digest':pins['members']['supabase-go']['sha256']='0'*64
                if field=='member_size':pins['members']['supabase-go']['bytes']+=1
                with patch.object(P,'TOOLS',tools),self.assertRaises(ValueError):P.install_supabase(raw,pins)
                self.assertEqual(list(tools.iterdir()),[])

    def test_production_default_uses_fixed_vendor_pins(self):
        with tempfile.TemporaryDirectory() as temporary,patch.object(P,'TOOLS',Path(temporary).resolve()):
            with self.assertRaisesRegex(ValueError,'DOWNLOAD_DIGEST_MISMATCH'):
                P.install_supabase(archive([('supabase',b'shim',tarfile.REGTYPE)]))

    def test_actual_synthetic_companion_version_and_shim_forwarding_probe(self):
        # Executable shell fixtures only, never the official Linux ELF or service.
        import subprocess
        with tempfile.TemporaryDirectory() as temporary:
            tools=Path(temporary).resolve();tools.chmod(0o700)
            shim=tools/'supabase'
            shim.write_text('#!/bin/sh\nif [ "$1" = "--version" ]; then printf "2.109.1\\n"; exit 0; fi\nexec "$(dirname "$0")/supabase-go" "$@"\n');shim.chmod(0o700)
            def run(args,**_options):
                result=subprocess.run(args,cwd=tools,capture_output=True,timeout=2,env={'PATH':'/usr/bin:/bin'})
                if result.returncode:raise ValueError('SYNTHETIC_COMMAND_FAILED')
                return result.stdout
            self.assertEqual(run([str(shim),'--version']).strip(),b'2.109.1')
            with patch.object(P,'TOOLS',tools),self.assertRaises(FileNotFoundError):P.probe_supabase(runner=run)
            go=tools/'supabase-go'
            go.write_text('#!/bin/sh\nif [ "$1" = "--version" ]; then printf "2.109.1\\n"; exit 0; fi\nif [ "$1" = "start" ] && [ "$2" = "--help" ]; then printf "Start local stack\\n"; exit 0; fi\nexit 9\n');go.chmod(0o700)
            with patch.object(P,'TOOLS',tools):P.probe_supabase(runner=run)
            go.write_text('#!/bin/sh\nprintf "0.0.0\\n"\n')
            with patch.object(P,'TOOLS',tools),self.assertRaisesRegex(ValueError,'VERSION_MISMATCH'):
                P.probe_supabase(runner=run)

class RejectionTests(unittest.TestCase):
    def mutate(self,f,case):
        path=f.parent/'tools/toolchain.json';value=json.loads(path.read_bytes())
        go=Path(value['supabaseGo']['path'])
        if case=='schema1':value.pop('supabaseGo');value['schemaVersion']=1
        if case=='extra':value['unexpected']=True
        if case=='missing':go.unlink()
        if case=='symlink':go.unlink();go.symlink_to(f.tools['supabase']['path'])
        if case=='hardlink':go.unlink();os.link(f.tools['supabase']['path'],go)
        if case=='hash':go.write_bytes(b'changed')
        if case=='mode':go.chmod(0o755)
        if case=='path':value['supabaseGo']['path']=f.tools['supabase']['path']
        if case=='version':value['supabaseGo']['version']='0.0.0'
        if case=='row_extra':value['supabaseGo']['extra']=True
        path.write_bytes(json.dumps(value,sort_keys=True).encode())
        f.request['toolchainSha256']=C.digest(path.read_bytes())
        (f.runtime/'bootstrap-input.json').write_bytes(json.dumps(f.request).encode())
        return C.digest(path.read_bytes())

    def test_contract_and_pinner_both_reject_incomplete_or_changed_approved_closure(self):
        cases=['schema1','extra','missing','symlink','hardlink','hash','mode','path','version','row_extra']
        for case in cases:
            with self.subTest(case=case),tempfile.TemporaryDirectory() as temporary:
                f=SnapshotFixture(Path(temporary).resolve());sha=self.mutate(f,case)
                with self.assertRaises((C.BootstrapError,OSError)):C.toolchain(f.parent,sha)
                env={**f.environment,'GITHUB_SHA':'a'*40}
                with patch.object(Q,'SOURCE',f.source),patch.object(Q,'RUNTIME',f.runtime),\
                        patch.object(Q,'command',side_effect=AssertionError('NO_PROCESS_BEFORE_ADMISSION')),\
                        patch.dict(os.environ,env,clear=True),self.assertRaises((ValueError,OSError)):
                    Q.approved_inputs('a'*40,C.digest((f.runtime/'bootstrap-input.json').read_bytes()))

    def test_pinner_rejects_actual_wrong_version_or_empty_help(self):
        for failure in ['version','help']:
            with self.subTest(failure=failure),tempfile.TemporaryDirectory() as temporary:
                f=SnapshotFixture(Path(temporary).resolve());calls=[]
                def command(args):
                    calls.append(args)
                    return ('0.0.0' if failure=='version' else '2.109.1') if args[-1]=='--version' else ''
                with patch.object(Q,'SOURCE',f.source),patch.object(Q,'RUNTIME',f.runtime),\
                        patch.object(Q,'command',side_effect=command),\
                        patch.dict(os.environ,{**f.environment,'GITHUB_SHA':'a'*40},clear=True),\
                        self.assertRaises(ValueError):
                    Q.approved_inputs('a'*40,C.digest((f.runtime/'bootstrap-input.json').read_bytes()))
                self.assertEqual(calls[0],[f.tools['supabaseGo']['path'],'--version'])
                self.assertEqual(len(calls),1 if failure=='version' else 2)

    def test_bootstrap_checks_companion_and_help_before_start_without_retry(self):
        for step,operation in [('go','SUPABASE_GO_VERSION'),('help','SUPABASE_START_HELP')]:
            with self.subTest(step=step),tempfile.TemporaryDirectory() as temporary:
                f=Fixture(Path(temporary).resolve())
                target=([f.tools['supabaseGo']['path'],'--version'] if step=='go' else
                        [f.tools['supabase']['path'],'start','--help'])
                f.fail=lambda args:args==target
                result=f.execute()
                self.assertEqual(result['result'],'FAILED');self.assertFalse(f.started)
                self.assertEqual(sum(args==target for args,_ in f.commands),1)
                self.assertEqual(__import__('test_linux_local_bootstrap').M.command_operation(target),operation)
                self.assertFalse(any('--exclude' in args for args,_ in f.commands))

class InstallerRecordTests(unittest.TestCase):
    def test_actual_installer_records_three_independently_hashed_tools_after_probes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve();source=root/'colorplay-live-recovery';source.mkdir()
            parent=root/'live-recovery-runtime';tools=parent/'tools';calls=[]
            rows={'supabase':b'shim','supabase-go':b'go'}
            dual=archive([(name,body,tarfile.REGTYPE) for name,body in rows.items()])
            node=archive([('node-v24.18.0-linux-x64/bin/node',b'node',tarfile.REGTYPE)])
            pnpm=archive([('package/bin/pnpm.cjs',b'pnpm',tarfile.REGTYPE)])
            def download(url,*_args):return node if 'nodejs.org' in url else dual if 'supabase_linux_amd64' in url else pnpm
            def command(argv,**_options):
                calls.append(argv)
                if argv[1:3]==['rev-parse','HEAD']:return b'a'*40
                if '--version' in argv:
                    if argv[0]==str(tools/'node'):return b'11.25.0' if len(argv)==3 else b'v24.18.0'
                    return b'2.109.1'
                if argv[1:]==['start','--help']:return b'Start local stack'
                if 'install' in argv:raise RuntimeError('STOP_BEFORE_DEPENDENCY_INSTALL')
                return b''
            vendor=ArchiveAdmissionTests().pins(dual,rows)
            env={'GITHUB_REPOSITORY':'peiyi-liu/colorplay_v1','GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'capacity-linux','GITHUB_SHA':'a'*40}
            mask=os.umask(0o077);os.umask(mask)
            with patch.object(P,'SOURCE',source),patch.object(P,'PARENT',parent),patch.object(P,'TOOLS',tools),\
                    patch.object(P,'download',side_effect=download),patch.object(P,'command',side_effect=command),\
                    patch.object(P,'SUPABASE_VENDOR',vendor),patch.dict(os.environ,env,clear=True),\
                    patch.object(sys,'argv',['setup','a'*40]),patch.object(sys,'platform','linux'),\
                    patch.object(P.platform,'machine',return_value='x86_64'):
                try:
                    with self.assertRaisesRegex(RuntimeError,'STOP_BEFORE_DEPENDENCY_INSTALL'):P.main()
                finally:os.umask(mask)
            value=C.toolchain(parent,C.digest((tools/'toolchain.json').read_bytes()))
            self.assertEqual(set(value),{'schemaVersion','node','supabase','supabaseGo'})
            self.assertEqual(value['schemaVersion'],2)
            self.assertEqual(value['supabaseGo'],{'path':str(tools/'supabase-go'),'version':'2.109.1','sha256':C.digest(b'go')})
            self.assertEqual(sum(args==[str(tools/'supabase-go'),'--version'] for args in calls),1)
            self.assertEqual(sum(args==[str(tools/'supabase'),'start','--help'] for args in calls),1)
            self.assertFalse(any(args[0]==str(tools/'supabase') and args[1:]!=['--version'] and args[1:]!=['start','--help'] for args in calls))

if __name__=='__main__':unittest.main()
