import copy
import os
from pathlib import Path
import tempfile
import unittest
from linux_runtime_common import validate_context, private_read, require_linux, PROJECT

def fixture():
    roles=sorted(["db","auth","rest","realtime","storage","edge_runtime","kong","inbucket"])
    nonce="d"*32;suffix=nonce[:12]
    binaries={"node":{"path":"/synthetic/bin/node","sha256":"b"*64,"device":1,"inode":2},"browser":[{"path":"/synthetic/cache/chrome","sha256":"c"*64,"device":1,"inode":3}]}
    return {"binaries":binaries,"schemaVersion":1,"sourceRevision":"a"*40,"projectId":PROJECT,"job":{"repository":"peiyi-liu/colorplay_v1","runId":"123456789","runAttempt":1,"jobName":"capacity-linux"},"instanceNonce":nonce,"generatorCgroupRelativePath":"/colorplaygenerator"+suffix+".slice/workload","backendCgroupRelativePath":"/colorplaybackend"+suffix+".slice","containers":[{"role":role,"id":format(i+1,"064x"),"name":"/supabase_"+role+"_"+PROJECT,"imageId":"sha256:"+format(i+100,"064x")} for i,role in enumerate(roles)]}

class LinuxRuntimeCommonTests(unittest.TestCase):
    def test_exact_local_job_context_is_admitted_without_io(self):
        value=fixture();self.assertEqual(validate_context(value),value)
    def test_unknown_profile_fields_and_mixed_nonlocal_targets_are_denied(self):
        for variant in ("extra","project","attempt","path","container","role"):
            value=fixture()
            if variant=="extra":value["executionAuthority"]="HOSTED"
            if variant=="project":value["projectId"]="production"
            if variant=="attempt":value["job"]["runAttempt"]=2
            if variant=="path":value["backendCgroupRelativePath"]="/system.slice"
            if variant=="container":value["containers"][0]["name"]="/supabase_db_OTHER"
            if variant=="role":value["containers"][1]=copy.deepcopy(value["containers"][0])
            with self.subTest(variant=variant),self.assertRaises(ValueError):validate_context(value)
    def test_context_binding_rejects_scope_path_from_another_instance_nonce(self):
        value=fixture();value["instanceNonce"]="e"*32
        with self.assertRaises(ValueError):validate_context(value)
    def test_private_data_requires_owner_only_single_link_regular_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();target=root/"data.json";target.write_bytes(b"synthetic");target.chmod(0o600)
            self.assertEqual(private_read(target),b"synthetic")
            target.chmod(0o644)
            with self.assertRaises(ValueError):private_read(target)
            target.chmod(0o600);linked=root/"link.json";os.link(target,linked)
            with self.assertRaises(ValueError):private_read(target)
    def test_symlink_and_overflow_never_read_as_private_authority(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();target=root/"data.json";target.write_bytes(b"synthetic");target.chmod(0o600)
            linked=root/"link.json";linked.symlink_to(target)
            with self.assertRaises(ValueError):private_read(linked)
            with self.assertRaises(ValueError):private_read(target,1)
    def test_darwin_cannot_claim_live_linux(self):
        if os.uname().sysname=="Darwin":
            with self.assertRaisesRegex(ValueError,"LINUX_REQUIRED"):require_linux()

if __name__=="__main__":unittest.main()
