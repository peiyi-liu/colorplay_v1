"""Census integrity through pure boundaries and the actual private snapshot writer."""
import copy
import itertools
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/concurrency'))
sys.path.insert(0,str(Path(__file__).parent))
import local_database_census as D
from test_snapshot_local_evidence import Fixture, C, M

DATABASES=['_supabase','postgres']


def census():
    rows=[{'schema':'public','table':name,'count':index,'sha256':str(index)*64}
          for index,name in enumerate(['alpha','beta','gamma'])]
    return {'clusterRoles':{'count':31,'sha256':'d'*64},'_supabase':[], 'postgres':rows}


class CensusTests(unittest.TestCase):
    def test_all_permutations_preserve_every_value_and_do_not_mutate_input(self):
        before=census();original=copy.deepcopy(before)
        for rows in itertools.permutations(before['postgres']):
            after=copy.deepcopy(before);after['postgres']=list(rows)
            untouched=copy.deepcopy(after);result=D.compare(before,after,DATABASES)
            self.assertTrue(result['equal']);self.assertEqual(result['counts']['tablesBefore'],3)
            self.assertEqual(result['canonicalSha256']['before'],result['canonicalSha256']['after'])
            self.assertEqual(after,untouched)
        self.assertEqual(before,original)
        self.assertEqual(D.compare(before,before,DATABASES)['classification'],'IDENTICAL')

    def test_same_identity_in_two_databases_is_preserved(self):
        value=census();value['_supabase']=[copy.deepcopy(value['postgres'][0])]
        normalized=D.canonicalize(value,DATABASES)
        self.assertEqual(len(normalized['_supabase']),1);self.assertEqual(len(normalized['postgres']),3)
        self.assertEqual(D.compare(value,value,DATABASES)['counts']['tablesBefore'],4)

    def test_actual_values_roles_and_table_sets_never_compare_equal(self):
        for kind in ['count','sha256','roles_count','roles_hash','added','removed']:
            with self.subTest(kind=kind):
                before=census();after=copy.deepcopy(before)
                if kind=='count':after['postgres'][0]['count']+=1
                elif kind=='sha256':after['postgres'][0]['sha256']='a'*64
                elif kind=='roles_count':after['clusterRoles']['count']+=1
                elif kind=='roles_hash':after['clusterRoles']['sha256']='a'*64
                elif kind=='added':after['postgres'].append({'schema':'auth','table':'users','count':0,'sha256':'f'*64})
                else:after['postgres'].pop()
                value=D.compare(before,after,DATABASES)
                self.assertFalse(value['equal']);self.assertEqual(value['classification'],'DATA_CHANGED')
                self.assertNotEqual(value['canonicalSha256']['before'],value['canonicalSha256']['after'])

    def test_invalid_shapes_and_duplicates_never_leak_unvalidated_metadata(self):
        invalid=[]
        for key in ['count','sha256','schema','table']:
            for value in ([True,-1,None,'1',1.0] if key=='count' else
                          [None,1,'SYNTHETIC_PRIVATE_MARKER','A'*64] if key=='sha256' else
                          [None,1,'SYNTHETIC_PRIVATE_MARKER/', 'a'*64,'a.b','1name']):
                row=census();row['postgres'][0][key]=value;invalid.append(row)
        for mutate in [lambda v:v['postgres'].append(copy.deepcopy(v['postgres'][0])),
                       lambda v:v['postgres'][0].update(extra='SYNTHETIC_PRIVATE_MARKER'),
                       lambda v:v['clusterRoles'].update(extra=0),
                       lambda v:v['clusterRoles'].update(count=True),
                       lambda v:v.update(foreign=[]),lambda v:v.pop('_supabase'),
                       lambda v:v.update(postgres=None),
                       lambda v:v.update(postgres=[copy.deepcopy(v['postgres'][0])]*257)]:
            row=census();mutate(row);invalid.append(row)
        invalid.extend([None,[],{'clusterRoles':None}])
        for value in invalid:
            with self.subTest(valueType=type(value).__name__):
                with self.assertRaises(D.CensusInvalid):D.canonicalize(value,DATABASES)
                result=D.compare(census(),value,DATABASES)
                self.assertEqual(result['classification'],'INVALID');self.assertFalse(result['equal'])
                self.assertNotIn('SYNTHETIC_PRIVATE_MARKER',json.dumps(result))
                self.assertIsNone(result['orderSha256']);self.assertEqual(result['changes'],[])

    def test_database_scope_cannot_be_inferred_or_relaxed(self):
        for databases in [[],['foreign'],['postgres','_supabase'],['postgres','postgres'],None,[True]]:
            with self.subTest(databases=databases),self.assertRaises(D.CensusInvalid):
                D.canonicalize(census(),databases)
        one=census();one.pop('_supabase')
        self.assertEqual(D.canonicalize(one,['postgres']),one)

    def test_actual_wrapper_keeps_invalid_after_and_safe_delta_without_db_stop(self):
        for kind in ['duplicate','unknown','count','hash','roles','set']:
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as temp:
                f=Fixture(Path(temp).resolve());original=f.census
                def changed(databases):
                    value=original(databases)
                    if f.census_calls>1:
                        if kind=='duplicate':value['postgres'].append(copy.deepcopy(value['postgres'][0]))
                        elif kind=='unknown':value['postgres'][0]['unsafe']='SYNTHETIC_PRIVATE_MARKER'
                        elif kind=='count':value['postgres'][0]['count']+=1
                        elif kind=='hash':value['postgres'][0]['sha256']='a'*64
                        elif kind=='roles':value['clusterRoles']['count']+=1
                        else:value['postgres'].pop()
                    return value
                f.census=changed;result=f.execute()
                self.assertEqual(result['code'],'SNAPSHOT_DATABASE_CHANGED')
                self.assertNotIn('stop:db',f.events);self.assertNotIn('volume',f.events)
                self.assertTrue((f.output/'database-census-after.json').exists())
                delta=C.decode((f.output/'database-census-diff.json').read_bytes())
                self.assertFalse(delta['equal']);self.assertNotIn('SYNTHETIC_PRIVATE_MARKER',json.dumps(delta))
                self.assertNotIn('SYNTHETIC_PRIVATE_MARKER',json.dumps(result))
                self.assertEqual(f.census_calls,2)
                for name in ['database-census-before.json','database-census-after.json','database-census-diff.json']:
                    self.assertEqual((f.output/name).stat().st_mode&0o777,0o600)

    def test_after_or_delta_writer_failures_cannot_continue_or_publish_success(self):
        for filename in ['database-census-after.json','database-census-diff.json']:
            for failure in ['before','after_close']:
                with self.subTest(filename=filename,failure=failure),tempfile.TemporaryDirectory() as temp:
                    f=Fixture(Path(temp).resolve());write=C.write_once
                    def failed(path,value):
                        if path.name==filename:
                            if failure=='after_close':write(path,value)
                            raise OSError('SYNTHETIC_PRIVATE_MARKER')
                        return write(path,value)
                    with patch.object(C,'write_once',failed):result=f.execute()
                    self.assertEqual(result['result'],'FAILED')
                    self.assertNotIn('stop:db',f.events);self.assertNotIn('volume',f.events)
                    self.assertFalse((f.output/'snapshot-manifest.json').exists())
                    self.assertNotIn('SYNTHETIC_PRIVATE_MARKER',json.dumps(result))
                    self.assertTrue((f.output/'database-census-before.json').exists())
                    if filename.endswith('diff.json'):self.assertTrue((f.output/'database-census-after.json').exists())


if __name__=='__main__':unittest.main()
