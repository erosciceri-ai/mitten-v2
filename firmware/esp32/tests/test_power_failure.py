import os
import pytest
from storage.files import write_json_file, read_json_file
from storage.atomic import atomic_write_and_promote, validate_profile_file
from profile.loader import load_active_profile
from sync.transaction import SyncTransactionManager

@pytest.fixture
def fault_patch():
    # Independent from the autouse working-directory fixture.
    with pytest.MonkeyPatch.context() as patch:
        yield patch

OLD = {'version':1,'profileId':'p','profileRevision':'old','gestureCount':0,'gestures':[]}
NEW = dict(OLD, profileRevision='new')

@pytest.mark.parametrize('stage', ['write','backup','promote','validate'])
def test_failed_promotion_preserves_previous_profile(fault_patch, stage):
    write_json_file('gestures.json', OLD)
    rename=os.rename
    if stage=='write': fault_patch.setattr('storage.atomic.write_json_file',lambda *_:False)
    if stage in ('backup','promote'):
        def fail(source,target):
            if (stage=='backup' and source=='gestures.json') or (stage=='promote' and source.endswith('.tmp')):
                raise OSError('injected rename failure')
            return rename(source,target)
        fault_patch.setattr('os.rename',fail)
    if stage=='validate':
        from storage.atomic import validate_profile_file as real_validate
        def validate(path):
            return False if path=='gestures.json' and read_json_file(path)==NEW else real_validate(path)
        fault_patch.setattr('storage.atomic.validate_profile_file',validate)
    assert not atomic_write_and_promote('gestures.json',NEW)
    fault_patch.undo()
    assert load_active_profile()==OLD

class PowerLoss(BaseException): pass

@pytest.mark.parametrize('rename_number', [1,2])
@pytest.mark.parametrize('after', [False,True])
def test_power_loss_around_each_rename_recovers_a_complete_profile(fault_patch,rename_number,after):
    write_json_file('gestures.json',OLD)
    rename=os.rename
    calls=[0]
    def interrupt(source,target):
        calls[0]+=1
        if calls[0]==rename_number and not after: raise PowerLoss()
        rename(source,target)
        if calls[0]==rename_number and after: raise PowerLoss()
    fault_patch.setattr('os.rename',interrupt)
    with pytest.raises(PowerLoss): atomic_write_and_promote('gestures.json',NEW)
    fault_patch.undo()
    recovered=load_active_profile()
    assert recovered==(NEW if rename_number==2 and after else OLD)
    assert validate_profile_file('gestures.json')

def test_failed_rollback_keeps_backup_for_later_reboot(fault_patch):
    write_json_file('gestures.json',OLD)
    rename=os.rename
    def fail(source,target):
        if source.endswith(('.tmp','.bak')): raise OSError('unavailable')
        rename(source,target)
    fault_patch.setattr('os.rename',fail)
    assert not atomic_write_and_promote('gestures.json',NEW)
    assert validate_profile_file('gestures.json.bak')
    # Even when recovery cannot rename, the backup is still usable and retained.
    assert load_active_profile()==OLD
    fault_patch.undo()
    assert load_active_profile()==OLD

def test_commit_failure_rolls_back_and_allows_a_new_transaction(fault_patch):
    write_json_file('gestures.json',OLD)
    manager=SyncTransactionManager()
    assert manager.begin('s','p','new',0)['ok']
    fault_patch.setattr('sync.transaction.atomic_write_and_promote',lambda *_:False)
    assert manager.commit('s')['error']['code']=='STORAGE_ERROR'
    assert manager.get_state()=='IDLE'
    assert manager.profile_manager.current==OLD
    assert load_active_profile()==OLD
    fault_patch.undo()
    assert manager.begin('s2','p','new',0)['ok']
    assert manager.commit('s2')['committed']
    assert manager.begin('s3','p','next',0)['ok']

def test_corrupt_staging_is_revalidated_before_promotion():
    write_json_file('gestures.json',OLD)
    manager=SyncTransactionManager(); manager.begin('s','p','new',0)
    with open('gestures.staging','w') as f: f.write('{"version":1,"profileId":"different"}\n')
    assert manager.commit('s')['error']['code']=='STORAGE_ERROR'
    assert load_active_profile()==OLD
