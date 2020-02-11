import cdk = require('@aws-cdk/core');
import iam = require("@aws-cdk/aws-iam");
import sfn = require('@aws-cdk/aws-stepfunctions');
import lambda = require('@aws-cdk/aws-lambda');
import sfn_tasks = require('@aws-cdk/aws-stepfunctions-tasks');

class JobPollerStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props: cdk.StackProps = {}) {
        super(scope, id, props);

        const lambdaFn = new lambda.Function(this, 'PersonalizeAPIExecutor', {
            code: new lambda.AssetCode('resource/lambda'),
            handler: 'action-executor.handler',
            runtime: lambda.Runtime.NODEJS_10_X,
          });

        if(lambdaFn.role) {  // This weirdness is to get around TypeScript 'undefined' rules
            lambdaFn.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonPersonalizeFullAccess'));
            lambdaFn.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'));
        }
        
        const createDatasetGroup = new sfn.Task(this, 'Create Dataset Group', {
            task: new sfn_tasks.InvokeFunction(lambdaFn)
        });

        const describeDatasetGroupStatus = new sfn.Task(this, 'Describe Dataset Group', {
            task: new sfn_tasks.InvokeFunction(lambdaFn)
        });
      
        const setCreateDatasetGroup = new sfn.Pass(this, 'Set Create Dataset Group', {
            parameters: { verb: "createDatasetGroup", params: { "name.$": "$.datasetGroupName" } },
            //result: { value: { verb: "createDatasetGroup", params: { name: "datasetGroupName.$"} } },
            resultPath: "$.action",
            outputPath: "$.action"
        });

        const setDescribeDatasetGroup = new sfn.Pass(this, 'Set Describe Dataset Group', {
            parameters: { verb: "describeDatasetGroup", params: { "datasetGroupArn.$": "$.action.result.datasetGroupArn" } },
            resultPath: "$.action",
            outputPath: "$.action"
        });

        const wait5Seconds = new sfn.Wait(this, 'Wait 5 Seconds', { 
            time: sfn.WaitTime.duration(cdk.Duration.seconds(5))
        });

        const fail = new sfn.Fail(this, 'Create Failed');

        const success = new sfn.Succeed(this, 'Success');

        const isComplete = new sfn.Choice(this, 'Create Complete?');

        const dsgChain = sfn.Chain
            .start(setCreateDatasetGroup)
            .next(createDatasetGroup)
            .next(setDescribeDatasetGroup)
            .next(wait5Seconds)
            .next(describeDatasetGroupStatus)
            .next(isComplete
                .when(sfn.Condition.stringEquals('$.action.result.status', 'CREATE PENDING'), wait5Seconds)
                .when(sfn.Condition.stringEquals('$.action.result.status', 'CREATE IN_PROGRESS'), wait5Seconds)
                .when(sfn.Condition.stringEquals('$.action.result.status', 'CREATE FAILED'), fail)
                .when(sfn.Condition.stringEquals('$.action.result.status', 'ACTIVE'), success));

        new sfn.StateMachine(this, 'Create Dataset Group Machine', {
            definition: dsgChain,
            timeout: cdk.Duration.seconds(30)
        });
    }
}

const app = new cdk.App();
new JobPollerStack(app, 'aws-stepfunctions-integ');
app.synth();
