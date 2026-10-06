#!/usr/bin/env bash
# F2 TESTING-only image rollout and synthetic smoke; no user-data operation.
set -euo pipefail
checkpoint="${1:?Pass the exact feature/play-together-notifications checkpoint}"
[[ "$checkpoint" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid checkpoint"; exit 1; }
project_id=gamid-testing
region=asia-southeast1
job_name=gamid-intro-worker-testing
work_dir=$(mktemp -d /tmp/gamid-f2-deploy-XXXXXX)
git clone --quiet --no-checkout --depth 1 --single-branch --branch feature/play-together-notifications https://github.com/jeddawe11-eng/gamid-testing.git "$work_dir/source"
cd "$work_dir/source"
git fetch --quiet --depth 1 origin "$checkpoint"
git checkout --quiet --detach FETCH_HEAD
test "$(git rev-parse HEAD)" = "$checkpoint"
gcloud run jobs describe "$job_name" --project="$project_id" --region="$region" --format=json > "$work_dir/before.json"
python3 - "$work_dir/before.json" "$work_dir/args.txt" <<'PY'
import json,sys
j=json.load(open(sys.argv[1]))
c=j['spec']['template']['spec']['template']['spec']['containers'][0]
assert 'gamid-testing/gamid-workers/intro-processing' in c['image'], 'Unexpected existing image'
cmd=c.get('command',[])
assert cmd in ([],['node']), 'Unexpected command: stop before deployment'
args='intro-worker.mjs,f2-smoke' if cmd else 'node,intro-worker.mjs,f2-smoke'
open(sys.argv[2],'w').write(args)
print('F2 baseline image:',c['image'])
print('F2 baseline command verified; no real job will be claimed')
PY
build_id=$(gcloud builds submit . --project="$project_id" --config=worker/cloud-run/cloudbuild-usage-testing.yaml --ignore-file=worker/cloud-run/usage-testing.gcloudignore --substitutions=_CHECKPOINT=f2-${checkpoint:0:7} --async --format='value(id)')
echo "F2_BUILD_ID=$build_id"
for attempt in $(seq 1 60); do
  status=$(gcloud builds describe "$build_id" --project="$project_id" --format='value(status)')
  echo "F2_BUILD_STATUS=$status"
  case "$status" in SUCCESS) break;; FAILURE|CANCELLED|EXPIRED|TIMEOUT) exit 1;; esac
  sleep 10
done
test "$status" = SUCCESS
digest=$(gcloud builds describe "$build_id" --project="$project_id" --format='value(results.images[0].digest)')
test -n "$digest"
image="asia-southeast1-docker.pkg.dev/gamid-testing/gamid-workers/intro-processing@$digest"
gcloud run jobs update "$job_name" --project="$project_id" --region="$region" --image="$image" --quiet
gcloud run jobs describe "$job_name" --project="$project_id" --region="$region" --format=json > "$work_dir/after.json"
python3 - "$work_dir/before.json" "$work_dir/after.json" "$image" <<'PY'
import json,sys
a=json.load(open(sys.argv[1]))['spec']['template']['spec']['template']['spec']
b=json.load(open(sys.argv[2]))['spec']['template']['spec']['template']['spec']
assert b['containers'][0]['image']==sys.argv[3]
a['containers'][0].pop('image');b['containers'][0].pop('image')
assert a==b,'Unexpected job configuration drift'
print('F2_IMAGE_ONLY_UPDATE_VERIFIED')
PY
echo "F2_IMAGE=$image"
gcloud run jobs execute "$job_name" --project="$project_id" --region="$region" --args="$(cat "$work_dir/args.txt")" --wait --format=json > "$work_dir/execution.json"
execution=$(python3 - "$work_dir/execution.json" <<'PY'
import json,sys
v=json.load(open(sys.argv[1]))
assert v.get('kind')=='Execution' or '/executions/' in v.get('name',''), 'Unexpected execution response: inspect, do not execute again'
print(v.get('metadata',{}).get('name') or v['name'].split('/')[-1])
PY
)
echo "F2_EXECUTION=$execution"
gcloud logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$job_name\" AND labels.\"run.googleapis.com/execution_name\"=\"$execution\"" --project="$project_id" --limit=50 --format=json > "$work_dir/logs.json"
python3 - "$work_dir/logs.json" <<'PY'
import json,sys
for row in json.load(open(sys.argv[1])):
 p=row.get('jsonPayload')
 if not p:
  try:p=json.loads(row.get('textPayload',''))
  except Exception:continue
 if isinstance(p,dict) and 'workerSha256' in p:
  assert p['ok'] is True
  assert p['workerSha256']=='ef897fc0cefb915e26b5b1aa1fd3785876f161e15a84880342bf74807bdfb807'
  assert p['smokeSha256']=='fe0506e2c0c253794401079d059ab7dd1d12650942a7c221d2441acde57acf38'
  print('F2_DEPLOYED_NATIVE_VERIFICATION='+json.dumps(p))
  break
else:raise RuntimeError('Smoke log not visible yet: read this execution logs again, do not rerun the job')
PY
echo "F2_TESTING_WORKER_DEPLOYMENT_COMPLETE"
