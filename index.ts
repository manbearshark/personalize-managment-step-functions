import cdk = require('@aws-cdk/core');
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
        
        const createDatasetGroupTask = new sfn.Task(this, 'Create Dataset Group', {
            task: new sfn_tasks.InvokeFunction(lambdaFn)
        });

        const describeDatasetGroupStatusTask = new sfn.Task(this, 'Describe Dataset Group', {
            task: new sfn_tasks.InvokeFunction(lambdaFn)
        });
      
        const setCreateDatasetGroup = new sfn.Pass(this, 'Set Create Dataset Group', {
            result: { value: { verb: "createDatasetGroup", params: { name: "$.datasetGroupName" } } },
            resultPath: "$.action"
        });

        //TODO: Add Wait for datasetGroup

        const successJob = new sfn.Succeed(this, 'Success');

        const isComplete = new sfn.Choice(this, 'Job Complete?');

        const chain = sfn.Chain
            .start(setCreateDatasetGroup)
            .next(createDatasetGroupTask)
            .next(describeDatasetGroupStatusTask)
            .next(isComplete
                .when(sfn.Condition.numberEquals('$.count', 5), successJob)
                .when(sfn.Condition.numberLessThan('$.count', 5), submitJob));  //TODO: Add wait loop state

        new sfn.StateMachine(this, 'StateMachine', {
            definition: chain,
            timeout: cdk.Duration.seconds(30)
        });
    }
}

const app = new cdk.App();
new JobPollerStack(app, 'aws-stepfunctions-integ');
app.synth();
