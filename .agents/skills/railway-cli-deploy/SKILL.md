---
name: railway-cli-deploy
description: Deploy an explicitly selected project revision to Railway with the CLI, including required ignored runtime assets and production health checks.
---

# Railway CLI Deploy

Use this skill when a user asks to deploy an application to Railway through the CLI. Loading the skill alone does not authorize a production deployment.

## 1. Confirm source and target

From the repository root:

- Inspect `git status --short` and resolve the exact commit with `git rev-parse`. Use the commit named by the user; otherwise use `HEAD`.
- Run `railway status`. Confirm the linked project, environment, service, and URL match the requested target. Pass service and environment explicitly to deployment commands. If the target is missing or ambiguous, stop before linking or creating Railway resources.
- Inspect `.gitignore`, `.railwayignore`, build configuration, and runtime file reads. Identify files the app needs that Git would omit.
- Package source from the selected commit, not from a dirty checkout. Stage ignored runtime assets separately only after establishing they match that commit.

## 2. Stage the exact source and required assets

This repository has a deployment-specific requirement: `generated/` is ignored by Git, but the server reads `generated/content.json`, `generated/world/nodes.json`, and `generated/movies/durations.json` at startup. A normal `railway up` from the checkout can build successfully while omitting these files and then crash with `ENOENT`. The repository's tracked `.railwayignore` excludes tests, tools, caches, and ROM files; preserve it in the staged tree.

For this repository, prepare a clean temporary source tree. Set `requested_commit` to the user's commit hash when it differs from `HEAD`; leave it empty otherwise.

```sh
set -o pipefail
requested_commit=''
deploy_commit="$(git rev-parse "${requested_commit:-HEAD}^{commit}")"
deploy_stage="$(mktemp -d)"
git archive "$deploy_commit" | tar -xf - -C "$deploy_stage"
test -s generated/content.json
test -s generated/world/nodes.json
test -s generated/movies/durations.json
cp -R generated "$deploy_stage/generated"
```

If `generated/` is absent or does not correspond to the selected revision, stop and prepare it using the repository's documented extraction process. Do not deploy an incomplete or mismatched package. For another project, stage its equivalent required ignored assets only after inspecting its runtime.

## 3. Upload and deploy

Use the service and environment confirmed by `railway status`. For this repository they are `web` and `production`.

```sh
railway_service='web'
railway_environment='production'
deployment_message="$deploy_commit: deploy from CLI"
railway up "$deploy_stage" --path-as-root --no-gitignore \
  --service "$railway_service" --environment "$railway_environment" \
  --yes --detach --json --message "$deployment_message"
```

`--no-gitignore` includes the staged runtime assets; `.railwayignore` still controls exclusions. Capture the returned `deploymentId`. If the CLI response is lost or ambiguous, inspect the deployment list before retrying to avoid duplicating a deployment.

## 4. Verify the running release

Do not treat a successful build or a `SUCCESS` deployment-list entry alone as proof that the application serves traffic. This repository has had a deployment marked successful while its container crashed at startup.

1. Poll until the new deployment reaches a terminal status:

   ```sh
   railway deployment list --service "$railway_service" \
     --environment "$railway_environment" --limit 5 --json
   ```

2. If the build or app fails, inspect the exact deployment:

   ```sh
   railway logs --build "$deployment_id" --lines 100 \
     --service "$railway_service" --environment "$railway_environment"
   railway logs "$deployment_id" --deployment --lines 100 \
     --service "$railway_service" --environment "$railway_environment"
   ```

   Diagnose the cause before starting another deployment. Check for missing runtime assets when logs report `ENOENT`.

3. Run `railway status` and confirm the service is `Online` and its active deployment ID matches. Check the public URL shown there with an HTTP request appropriate for the application. For this web app, the root should return HTTP 200:

   ```sh
   service_url='https://super-mario-world-mp.codestorm.tools'  # Confirm against railway status
   curl --connect-timeout 5 --max-time 20 -fsS -L -o /dev/null \
     -w 'HTTP %{http_code} %{url_effective}\n' "$service_url"
   ```

4. Remove only the temporary staging directory created for this deployment after upload has completed. Check `git status --short` to ensure deployment work did not change the source tree.

Do not run a test suite unless the user asks for testing. Railway's configured build runs as part of deployment; report build, runtime, and HTTP results separately.
