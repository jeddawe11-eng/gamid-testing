#!/usr/bin/env bash
# F8-B1 TESTING-only image rollout (worker Job + dispatcher service, same image), then two synthetic in-image smokes: the rendition gate with the VMAF-only
# binary, and the accepted Intro F2 encoder (unchanged Debian FFmpeg). No user-data operation; run by someone with GamID TESTING Google Cloud access.
# Usage: worker/cloud-run/deploy-f8b1-testing.sh <exact feature/f8b1-video-renditions commit>
set -euo pipefail
checkpoint="${1:?Pass the exact feature/f8b1-video-renditions checkpoint}"
[[ "$checkpoint" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid checkpoint"; exit 1; }
project_id=gamid-testing
region=asia-southeast1
job_name=gamid-intro-worker-testing
service_name=gamid-intro-dispatcher-testing
work_dir=$(mktemp -d /tmp/gamid-f8b1-deploy-XXXXXX)
git clone --quiet --no-checkout --depth 1 --single-branch --branch feature/f8b1-video-renditions https://github.com/jeddawe11-eng/gamid-testing.git "$work_dir/source"
cd "$work_dir/source"
git fetch --quiet --depth 1 origin "$checkpoint"
git checkout --quiet --detach FETCH_HEAD
test "$(git rev-parse HEAD)" = "$checkpoint"
gcloud run jobs describe "$job_name" --project="$project_id" --region="$region" --format=json > "$work_dir/job-before.json"
gcloud run services describe "$service_name" --project="$project_id" --region="$region" --format=json > "$work_dir/service-before.json"
python3 - "$work_dir/job-before.json" "$work_dir/service-before.json" "$work_dir/args-prefix.txt" <<'PY'
import json,sys
c=json.load(open(sys.argv[1]))['spec']['template']['spec']['template']['spec']['containers'][0]
assert 'gamid-testing/gamid-workers/intro-processing' in c['image'], 'Unexpected existing job image'
assert c.get('command',[]) in ([],['node']), 'Unexpected job command: stop before deployment'
open(sys.argv[3],'w').write('intro-worker.mjs' if c.get('command') else 'node,intro-worker.mjs')
s=json.load(open(sys.argv[2]))['spec']['template']['spec']['containers'][0]
assert 'gamid-testing/gamid-workers/intro-processing' in s['image'], 'Unexpected existing dispatcher image'
print('ROLLBACK_JOB_IMAGE='+c['image']); print('ROLLBACK_DISPATCHER_IMAGE='+s['image'])
PY
build_id=$(gcloud builds submit . --project="$project_id" --config=worker/cloud-run/cloudbuild-usage-testing.yaml --ignore-file=worker/cloud-run/usage-testing.gcloudignore --substitutions=_CHECKPOINT=f8b1-${checkpoint:0:7} --async --format='value(id)')
echo "F8B1_BUILD_ID=$build_id"
for attempt in $(seq 1 90); do
  status=$(gcloud builds describe "$build_id" --project="$project_id" --format='value(status)')
  echo "F8B1_BUILD_STATUS=$status"
  case "$status" in SUCCESS) break;; FAILURE|CANCELLED|EXPIRED|TIMEOUT) exit 1;; esac
  sleep 10
done
test "$status" = SUCCESS
digest=$(gcloud builds describe "$build_id" --project="$project_id" --format='value(results.images[0].digest)')
test -n "$digest"
image="asia-southeast1-docker.pkg.dev/gamid-testing/gamid-workers/intro-processing@$digest"
gcloud run jobs update "$job_name" --project="$project_id" --region="$region" --image="$image" --quiet
gcloud run services update "$service_name" --project="$project_id" --region="$region" --image="$image" --quiet
gcloud run jobs describe "$job_name" --project="$project_id" --region="$region" --format=json > "$work_dir/job-after.json"
gcloud run services describe "$service_name" --project="$project_id" --region="$region" --format=json > "$work_dir/service-after.json"
python3 - "$work_dir/job-before.json" "$work_dir/job-after.json" "$work_dir/service-before.json" "$work_dir/service-after.json" "$image" <<'PY'
import json,sys
a=json.load(open(sys.argv[1]))['spec']['template']['spec']['template']['spec']; b=json.load(open(sys.argv[2]))['spec']['template']['spec']['template']['spec']
assert b['containers'][0]['image']==sys.argv[5]; a['containers'][0].pop('image'); b['containers'][0].pop('image')
assert a==b,'Unexpected job configuration drift'
s=json.load(open(sys.argv[3]))['spec']['template']['spec']; t=json.load(open(sys.argv[4]))['spec']['template']['spec']
assert t['containers'][0]['image']==sys.argv[5]; s['containers'][0].pop('image'); t['containers'][0].pop('image')
assert s['containers']==t['containers'],'Unexpected dispatcher configuration drift'
print('F8B1_IMAGE_ONLY_UPDATES_VERIFIED')
PY
echo "F8B1_IMAGE=$image"
for smoke in rendition-smoke f2-smoke; do
  gcloud run jobs execute "$job_name" --project="$project_id" --region="$region" --args="$(cat "$work_dir/args-prefix.txt"),$smoke" --wait --format=json > "$work_dir/$smoke.json"
  execution=$(python3 -c "import json,sys;v=json.load(open(sys.argv[1]));print(v.get('metadata',{}).get('name') or v['name'].split('/')[-1])" "$work_dir/$smoke.json")
  echo "F8B1_${smoke}_EXECUTION=$execution"
  # log ingestion can lag the finished execution: read THIS execution's logs again (never re-run the job), up to 9 times, 10 s apart
  found=""
  for read_attempt in $(seq 1 9); do
    gcloud logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$job_name\" AND labels.\"run.googleapis.com/execution_name\"=\"$execution\"" --project="$project_id" --limit=50 --format=json > "$work_dir/$smoke-logs.json"
    if python3 - "$work_dir/$smoke-logs.json" "$smoke" <<'PY'
import json,sys
for row in json.load(open(sys.argv[1])):
  p=row.get('jsonPayload')
  if not p:
    try: p=json.loads(row.get('textPayload',''))
    except Exception: continue
  if isinstance(p,dict) and 'ok' in p:
    assert p['ok'] is True, 'smoke failed: '+json.dumps(p)
    if sys.argv[2]=='rendition-smoke': assert p.get('vmafAvailable') is True and p.get('audioIdentical') is True
    print('F8B1_'+sys.argv[2].upper().replace('-','_')+'='+json.dumps(p)); sys.exit(0)
sys.exit(3)
PY
    then found=yes; break; else code=$?; [ "$code" -eq 3 ] || exit "$code"; fi
    sleep 10
  done
  [ -n "$found" ] || { echo "Smoke log for $execution not visible yet: read this execution's logs in the console; do NOT re-run the job"; exit 1; }
done
echo "F8B1_TESTING_WORKER_AND_DISPATCHER_DEPLOYED"
