# Lambda / serverless deploy detail

Use when the repo has `serverless.yml` (Serverless Framework) or `template.yaml` (AWS SAM).

## General rules
- Deploy through the framework, never by uploading zips by hand to the console.
- Stage/environment is a first-class concept: `--stage dev|staging|prod`. Never share state across stages.
- Secrets via SSM/Secrets Manager referenced in config, resolved at deploy or runtime — not in the repo.
- IAM per-function least privilege (`iamRoleStatements` / SAM policies), not a shared broad role.
- Mind cold starts, the 15-min max duration, payload limits, and `/tmp` size for heavy workloads.

## Serverless Framework
```bash
npx serverless deploy --stage prod          # full deploy
npx serverless deploy function -f myFn --stage prod   # fast single-function update
npx serverless logs -f myFn --stage prod --tail       # logs
npx serverless rollback --timestamp <ts> --stage prod # rollback
```

## AWS SAM
```bash
sam build
sam deploy --config-env prod   # uses samconfig.toml; --guided first time
sam logs -n MyFunction --stack-name <stack> --tail
```

## Verify
- Invoke the function / hit the API Gateway URL with a smoke test.
- Check CloudWatch logs + metrics (errors, throttles, duration) for the new version.
- Rollback path: redeploy the previous version/alias or use the framework's rollback command.
