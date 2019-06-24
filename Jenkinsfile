
@Library('kaltura')_

pipeline {

    agent { 
        label 'Ubuntu'
    }
    environment {
        version = sh(script: "cat package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[\",]//g' | sed 's/^ *//;s/ *$//'", returnStdout: true).trim()
        app_version = sh(script: "cat package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[\",]//g' | sed 's/^ *//;s/ *$//' | sed 's/[.]/_/g'", returnStdout: true).trim()
    }

    stages { 
        stage('Build') {
            steps {
                echo "Node name: ${env.NODE_NAME}"
                script {
                    docker.build("push-server:$BUILD_NUMBER", "--build-arg VERSION=$version --build-arg APP_VERSION=$app_version .")
                }
            }
        }
        stage('Deploy') {
            steps {
                deploy('push-server', "$version")
            }
        }
    }
}