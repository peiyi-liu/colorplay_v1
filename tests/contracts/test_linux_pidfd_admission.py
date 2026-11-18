"""Actual inventory with fake proc/pidfd ports only; never launches a child."""
import contextlib
import sys
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
OPERATOR=Path(__file__).resolve().parents[2]/'scripts/concurrency/linux-operator'
sys.path.insert(0,str(OPERATOR))
import linux_owned_process as P


def stat_text(birth='12',state='S',pid=42):
    fields=['0']*19;fields[0]='10';fields[18]=birth
    return '%d (SYNTHETIC) %s %s\n'%(pid,state,' '.join(fields))


class Kernel:
    def __init__(self):
        self.trace=[];self.counts={};self.values={};self.fd=7
        self.images=['/approved/python','/approved/python','/usr/bin/docker'];self.image=self.images[0]
        self.inventory=P.OwnedInventory.__new__(P.OwnedInventory)
        self.inventory.ctx={'generatorCgroupRelativePath':'/owned','binaries':{'browser':[]}}
        self.inventory.diagnostics=None
        self.inventory.group=Path('/synthetic');self.inventory.seen={};self.inventory.saw_browser=False

    def value(self,kind,default,*details):
        index=self.counts.get(kind,0)+1;self.counts[kind]=index
        self.trace.append((kind,index,*details))
        value=self.values.get((kind,index),default)
        if isinstance(value,BaseException):raise value
        return value

    def read(self,path,*_):
        if path.endswith('/stat'):return self.value('stat',stat_text())
        if path.endswith('/status'):return self.value('status','Uid:\t1001\t1001\t1001\t1001\n')
        raise AssertionError('UNEXPECTED_PROC_READ')

    def readlink(self,path):
        index=self.counts.get('image',0)
        self.image=self.value('image',self.images[index]);return self.image

    def run(self):
        with contextlib.ExitStack() as stack:
            patches=[
                patch.object(self.inventory,'unchanged',side_effect=lambda:self.value('group',None)),
                patch.object(P,'read_pid_members',return_value=[42]),
                patch.object(P,'read_text',side_effect=self.read),
                patch.object(P,'proc_cgroup',side_effect=lambda pid:self.value('leaf','/owned',pid)),
                patch.object(P.os,'getuid',return_value=1001),
                patch.object(P.os,'readlink',side_effect=self.readlink),
                patch.object(P.os,'stat',side_effect=lambda _:self.value('fstat',SimpleNamespace(st_dev=1,st_ino=2 if self.image=='/approved/python' else 3))),
                patch.object(P.os,'pidfd_open',side_effect=lambda *args:self.value('open',self.fd,*args),create=True),
                patch.object(P.select,'select',side_effect=lambda *args:self.value('poll',([],[],[]),*args)),
                patch.object(P.os,'close',side_effect=lambda fd:self.trace.append(('close',fd))),
            ]
            for item in patches:stack.enter_context(item)
            return self.inventory.track()

    def closed(self):return [row[1] for row in self.trace if row[0]=='close']


class PidfdAdmissionTests(unittest.TestCase):
    def test_same_lifetime_image_transition_uses_two_fresh_frames_and_live_handle_boundaries(self):
        kernel=Kernel()
        self.assertEqual(kernel.run(),[42])
        self.assertEqual(kernel.inventory.seen,{(42,'12'):7})
        self.assertFalse(kernel.inventory.saw_browser)
        self.assertEqual(kernel.closed(),[])
        kinds=[row[0] for row in kernel.trace]
        self.assertEqual(kinds,['group','stat','status','image','fstat','stat','open','poll',
                                'group','stat','status','leaf','image','fstat','stat',
                                'stat','status','leaf','image','fstat','stat','group','poll'])
        for row in kernel.trace:
            if row[0]=='poll':self.assertEqual(row[2:],([7],[],[],0))

    def test_birth_reuse_at_each_stat_boundary_cannot_be_admitted(self):
        for index in range(1,7):
            with self.subTest(index=index):
                k=Kernel();k.values['stat',index]=stat_text('13')
                with self.assertRaisesRegex(ValueError,'PROCESS_PID_REUSED|PROCESS_CHANGED_WHILE_TRACKING'):k.run()
                self.assertEqual(k.inventory.seen,{})
                self.assertEqual(k.closed(),[] if index<=2 else [7])

    def test_two_coherent_fresh_frames_with_different_birth_are_rejected_at_compare(self):
        k=Kernel();k.values['stat',5]=stat_text('13');k.values['stat',6]=stat_text('13')
        k.inventory.diagnostics=P.ParentStopDiagnostics()
        with self.assertRaisesRegex(ValueError,'PROCESS_CHANGED_WHILE_TRACKING'):k.run()
        self.assertEqual(k.inventory.diagnostics.track['stage'],'COMPARE')
        self.assertEqual(k.inventory.diagnostics.track['fields'],['startTicks','exe','inode'])
        self.assertEqual(k.closed(),[7]);self.assertEqual(k.inventory.seen,{})

    def test_fresh_pid_field_cannot_be_replaced_and_missing_role_never_grants_browser(self):
        for index in [3,4,5,6]:
            with self.subTest(index=index):
                k=Kernel();k.values['stat',index]=stat_text(pid=99)
                with self.assertRaisesRegex(ValueError,'PROCESS_IDENTITY_INVALID|PROCESS_PID_REUSED'):k.run()
                self.assertEqual(k.closed(),[7]);self.assertEqual(k.inventory.seen,{})
        k=Kernel();k.values['image',3]=FileNotFoundError()
        k.inventory.ctx['binaries']['browser']=[{'path':'/approved/python','device':1,'inode':2}]
        k.run();self.assertFalse(k.inventory.saw_browser);self.assertEqual(k.inventory.seen,{})

    def test_all_four_uid_columns_are_checked_in_lookup_and_both_fresh_frames(self):
        for index in range(1,4):
            for column in range(4):
                with self.subTest(index=index,column=column):
                    k=Kernel();uids=['1001']*4;uids[column]='0'
                    k.values['status',index]='Uid:\t'+'\t'.join(uids)+'\n'
                    with self.assertRaisesRegex(ValueError,'PROCESS_OWNER_CHANGED'):k.run()
                    self.assertEqual(k.inventory.seen,{})
                    self.assertEqual(k.closed(),[] if index==1 else [7])

    def test_each_fresh_frame_requires_exact_leaf(self):
        for index in [1,2]:
            with self.subTest(index=index):
                k=Kernel();k.values['leaf',index]='/foreign'
                with self.assertRaisesRegex(ValueError,'OWNED_CGROUP_CHANGED'):k.run()
                self.assertEqual(k.inventory.seen,{});self.assertEqual(k.closed(),[7])

    def test_actual_boot_and_group_pin_comparison_on_all_three_boundaries(self):
        for field in ['boot','group']:
            for index in [1,2,3]:
                with self.subTest(field=field,index=index):
                    k=Kernel();k.inventory.boot='PIN';k.inventory.pin=('PIN',)
                    boots=['PIN']*3;groups=[('PIN',)]*3
                    (boots if field=='boot' else groups)[index-1]='DRIFT'
                    def unchanged():
                        with patch.object(P,'boot_sha',side_effect=boots),patch.object(P,'cgroup_identity',side_effect=groups):
                            return original()
                    # One shared iterator witnesses each actual unchanged invocation.
                    boots=iter(boots);groups=iter(groups)
                    original=lambda:P.OwnedInventory.unchanged(k.inventory)
                    with patch.object(k,'value',wraps=k.value) as values:
                        def value(kind,default,*details):
                            if kind=='group':
                                k.trace.append(('group',));return unchanged()
                            return values(kind,default,*details)
                        with patch.object(k,'value',side_effect=value):
                            with self.assertRaisesRegex(ValueError,'OWNED_CGROUP_CHANGED'):k.run()
                    self.assertEqual(k.inventory.seen,{});self.assertEqual(k.closed(),[] if index==1 else [7])

    def test_process_exit_before_or_after_fresh_frames_closes_once_without_seen(self):
        for index in [1,2]:
            with self.subTest(index=index):
                k=Kernel();k.values['poll',index]=([7],[],[])
                self.assertEqual(k.run(),[42]);self.assertEqual(k.inventory.seen,{})
                self.assertEqual(k.closed(),[7])
                self.assertEqual(k.counts.get('leaf',0),0 if index==1 else 2)

    def test_missing_and_zombie_core_frames_follow_natural_disappearance_without_seen(self):
        for kind,index,value in [('stat',3,FileNotFoundError()),('status',3,ProcessLookupError()),
                                 ('image',2,FileNotFoundError()),('leaf',2,ProcessLookupError()),
                                 ('stat',3,stat_text(state='Z')),('stat',6,stat_text(state='Z'))]:
            with self.subTest(kind=kind,index=index,value=type(value).__name__):
                k=Kernel();k.values[kind,index]=value
                self.assertEqual(k.run(),[42]);self.assertEqual(k.inventory.seen,{})
                self.assertEqual(k.closed(),[7])

    def test_permission_and_unknown_errors_preserve_identity_and_close_untransferred_fd(self):
        for kind,index in [('stat',3),('status',2),('leaf',2),('image',3),('fstat',2),('poll',1),('poll',2)]:
            for error in [PermissionError(13,'PRIVATE'),RuntimeError('PRIVATE')]:
                with self.subTest(kind=kind,index=index,error=type(error).__name__):
                    k=Kernel();k.values[kind,index]=error
                    with self.assertRaises(type(error)) as caught:k.run()
                    self.assertIs(caught.exception,error);self.assertEqual(k.closed(),[7]);self.assertEqual(k.inventory.seen,{})

    def test_open_failure_never_claims_or_closes_an_unreturned_handle(self):
        for error in [ProcessLookupError(),PermissionError(13,'PRIVATE')]:
            with self.subTest(error=type(error).__name__):
                k=Kernel();k.values['open',1]=error
                if isinstance(error,ProcessLookupError):self.assertEqual(k.run(),[42])
                else:
                    with self.assertRaises(PermissionError) as caught:k.run()
                    self.assertIs(caught.exception,error)
                self.assertEqual(k.closed(),[]);self.assertEqual(k.inventory.seen,{})

    def test_unknown_poll_shapes_fail_closed_at_both_boundaries(self):
        for index in [1,2]:
            for result in [None,([],[]),[[],[],[]],([8],[],[]),([7,7],[],[]),([],[7],[]),([],[],[7])]:
                with self.subTest(index=index,result=result):
                    k=Kernel();k.values['poll',index]=result
                    with self.assertRaisesRegex(ValueError,'PROCESS_IDENTITY_INVALID'):k.run()
                    self.assertEqual(k.closed(),[7]);self.assertEqual(k.inventory.seen,{})

    def test_seen_live_keeps_single_identity_no_new_fd_and_dead_or_unknown_is_not_overwritten(self):
        for result,error in [(([],[],[]),None),(([7],[],[]),'PROCESS_PID_REUSED'),(None,'PROCESS_IDENTITY_INVALID')]:
            with self.subTest(result=result):
                k=Kernel();k.inventory.seen={(42,'12'):7};k.values['poll',1]=result
                if error:
                    with self.assertRaisesRegex(ValueError,error):k.run()
                else:self.assertEqual(k.run(),[42])
                self.assertEqual(k.inventory.seen,{(42,'12'):7});self.assertEqual(k.closed(),[])
                self.assertEqual(k.counts.get('open',0),0);self.assertEqual(k.counts['stat'],2)

    def test_fd_zero_transfers_then_original_inventory_close_is_only_owner(self):
        k=Kernel();k.fd=0;k.run();self.assertEqual(k.inventory.seen,{(42,'12'):0});self.assertEqual(k.closed(),[])
        with patch.object(P.os,'close') as close:k.inventory.close()
        close.assert_called_once_with(0);self.assertEqual(k.inventory.seen,{})

    def test_browser_role_requires_matching_both_fresh_images_and_existing_pin(self):
        for images,expected in [(['/approved/python']*3,True),(['/approved/python','/usr/bin/docker','/approved/python'],False),
                                (['/approved/python','/usr/bin/docker','/usr/bin/docker'],False)]:
            with self.subTest(images=images):
                k=Kernel();k.images=images;k.inventory.ctx['binaries']['browser']=[{'path':'/approved/python','device':1,'inode':2}]
                k.run();self.assertEqual(k.inventory.saw_browser,expected)
                self.assertEqual(k.inventory.seen,{(42,'12'):7})


if __name__=='__main__':unittest.main()
