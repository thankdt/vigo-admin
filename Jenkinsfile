// CI/CD for the admin dev site (mirrors vigo-backend).
//
// Trigger: GitHub webhook on push to `dev`. Reuses the same Jenkins instance.
// Deploy-in-place: the Jenkins container mounts the parent projects dir, so
// `docker compose` here drives the same containers as running it on the host.
//
// IMPORTANT: never run `npm run build` here — for this repo `build` =
// `next build && deploy:prod`, which publishes to the production S3 bucket.
// Dev just (re)starts the `next dev` container; the bind-mount + dev watcher
// pick up source changes with no rebuild.
//
// Prereqs in Jenkins (already set up for the backend, reused here):
//   - Username+password credential `github-creds` (GitHub user + PAT, repo scope)
//   - Secret-text `telegram-bot-token`, `telegram-chat-id`
pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    timeout(time: 20, unit: 'MINUTES')
  }

  environment {
    DEPLOY_DIR = '/home/vigojsc/development/projects/vigo-admin'
    GIT_REPO   = 'github.com/thankdt/vigo-admin.git'
    BRANCH     = 'dev'
  }

  stages {
    stage('Deploy') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'github-creds', usernameVariable: 'GH_USER', passwordVariable: 'GH_TOKEN')]) {
          sh '''
            set -eu
            cd "$DEPLOY_DIR"

            OLD=$(git rev-parse HEAD 2>/dev/null || echo none)
            git fetch "https://${GH_USER}:${GH_TOKEN}@${GIT_REPO}" "$BRANCH"
            git checkout -f -B "$BRANCH" FETCH_HEAD
            NEW=$(git rev-parse HEAD)
            echo "Deploying $OLD -> $NEW"

            # Rebuild the dev image only when deps/build config change; otherwise
            # the running `next dev` watcher reloads source from the bind mount.
            if [ "$OLD" = "none" ] || git diff --name-only "$OLD" "$NEW" \
                 | grep -qE '^(package-lock\\.json|package\\.json|Dockerfile|docker-compose\\.yml)$'; then
              echo ">> deps/build config changed — rebuilding admin image"
              docker compose up -d --build admin
            else
              echo ">> source-only change — recreating admin"
              docker compose up -d admin
            fi

            docker compose ps
          '''
        }
      }
    }
  }

  post {
    always {
      script { env.BUILD_STATUS = currentBuild.currentResult }
      withCredentials([
        string(credentialsId: 'telegram-bot-token', variable: 'TG_TOKEN'),
        string(credentialsId: 'telegram-chat-id',   variable: 'TG_CHAT'),
      ]) {
        sh '''
          set +e
          COMMIT=$(cd "$DEPLOY_DIR" 2>/dev/null && git log -1 --pretty='%h %s' 2>/dev/null || echo n/a)
          if [ "$BUILD_STATUS" = "SUCCESS" ]; then ICON="✅"; else ICON="❌"; fi
          TEXT="${ICON} Vigo ADMIN deploy: ${BUILD_STATUS}
Job: ${JOB_NAME} #${BUILD_NUMBER}
Branch: ${BRANCH}
Commit: ${COMMIT}
URL: https://admin.vigodev.site
Log: ${BUILD_URL}console"
          curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
            --data-urlencode "chat_id=${TG_CHAT}" \
            --data-urlencode "text=${TEXT}" -o /dev/null
        '''
      }
    }
  }
}
