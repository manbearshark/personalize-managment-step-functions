import { Stack, App, StackProps, Duration } from "@aws-cdk/core";
import { Role, ServicePrincipal, PolicyStatement, ManagedPolicy } from "@aws-cdk/aws-iam";
import { Bucket } from "@aws-cdk/aws-s3";
import { Function, AssetCode, Runtime } from "@aws-cdk/aws-lambda";
import { Task, Pass, Wait, Chain, Fail, Succeed, Choice, Condition, StateMachine, WaitTime } from "@aws-cdk/aws-stepfunctions";
import { InvokeFunction } from "@aws-cdk/aws-stepfunctions-tasks";

class PersonalizeManagementStack extends Stack {
    constructor(scope: App, id: string, props: StackProps = {}) {
        super(scope, id, props);

        const lambdaFn = new Function(this, 'PersonalizeAPIExecutor', {
            code: new AssetCode('resource/lambda'),
            handler: 'action-executor.handler',
            runtime: Runtime.NODEJS_10_X,
        });

        if(lambdaFn.role) {  // This weirdness is to get around TypeScript 'undefined' rules
            lambdaFn.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonPersonalizeFullAccess'));
            lambdaFn.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'));
        }
 
        let dataBucket = this.createS3BucketAndPermissions();
        this.createPersonalizeRoleAndPolicy(dataBucket);
        this.createPersonalizeDatasetGroupMachine(lambdaFn);
        this.createPersonalizeDatasetMachine(lambdaFn);
        this.createPersonalizeSchemaMachine(lambdaFn);
        this.createSolutionMachine(lambdaFn);
        this.getSolutionStateMachine(lambdaFn);
    }

    createPersonalizeRoleAndPolicy = (dataBucket: Bucket) => {
        let personalizeRole = new Role(this, 'PersonalizeExecutionRole', {
            assumedBy: new ServicePrincipal('personalize.amazonaws.com')
        });

        personalizeRole.addToPolicy(new PolicyStatement({
            actions: [ "s3:GetObject", "s3:ListBucket" ],
            resources: [ dataBucket.bucketArn, dataBucket.bucketArn + '/*' ],
        }));

        personalizeRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonPersonalizeFullAccess'));
        personalizeRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'));

        return personalizeRole;
    }

    createS3BucketAndPermissions = (): Bucket => {
        // TODO:  Add encryption options
        let bucket = new Bucket(this, 'dataBucket', { 
            publicReadAccess: false
        });

        bucket.addToResourcePolicy(new PolicyStatement({
            principals: [ new ServicePrincipal('personalize.amazonaws.com') ],
            actions: [ "s3:GetObject", "s3:ListBucket" ],
            resources: [ bucket.bucketArn, bucket.bucketArn + '/*' ],
        }));

        return bucket;
    }

    createPersonalizeSchemaMachine = (lambdaFn: Function) => {
        const createSchema = new Task(this, 'Create Schema', {
            task: new InvokeFunction(lambdaFn)
        });

        const setCreateSchema = new Pass(this, 'Set Create Schema', {
            parameters: { verb: "createSchema", params: { "name.$": "$.name", "schema.$": "$.schema" } },
            resultPath: "$.action"
        });

        const schemaChain = Chain
            .start(setCreateSchema)
            .next(createSchema);

        return new StateMachine(this, 'Create Personalize Schema', {
            definition: schemaChain
        });
    }
    
    // TODO: Add 'Catch' to states to capture execution errors as per this blog:
    // https://theburningmonk.com/2017/07/applying-the-saga-pattern-with-aws-lambda-and-step-functions/

    createPersonalizeDatasetGroupMachine = (lambdaFn: Function) => {

        const fail = new Fail(this, 'Create Dataset Group Failed');

        const success = new Succeed(this, 'Creeate Dataset Group Success');

        const isDatasetGroupComplete = new Choice(this, 'Dataset Group Create Complete?');
        
        const wait5Seconds = new Wait(this, 'Wait 5 Seconds', { 
            time: WaitTime.duration(Duration.seconds(5))
        });

        const createDatasetGroup = new Task(this, 'Create Dataset Group', {
            task: new InvokeFunction(lambdaFn)
        });

        const describeDatasetGroupStatus = new Task(this, 'Describe Dataset Group', {
            task: new InvokeFunction(lambdaFn),
            outputPath: "$.datasetGroup"
        });

        const setCreateDatasetGroup = new Pass(this, 'Set Create Dataset Group', {
            parameters: { verb: "createDatasetGroup", params: { "name.$": "$.name" } },
            resultPath: "$.action"
        });
        
        const setDescribeDatasetGroup = new Pass(this, 'Set Describe Dataset Group', {
            parameters: { verb: "describeDatasetGroup", params: { "datasetGroupArn.$": "$.datasetGroupArn" } },
            resultPath: "$.action"
        });

        const dsgChain = Chain
            .start(setCreateDatasetGroup)
            .next(createDatasetGroup)
            .next(setDescribeDatasetGroup)
            .next(wait5Seconds)
            .next(describeDatasetGroupStatus)
            .next(isDatasetGroupComplete
                .when(Condition.stringEquals('$.status', 'CREATE PENDING'), setDescribeDatasetGroup)
                .when(Condition.stringEquals('$.status', 'CREATE IN_PROGRESS'), setDescribeDatasetGroup)
                .when(Condition.stringEquals('$.status', 'CREATE FAILED'), fail)
                .when(Condition.stringEquals('$.status', 'ACTIVE'), success));

        return new StateMachine(this, 'Create Personalize Dataset Group', {
            definition: dsgChain
        });
    }

    createPersonalizeDatasetMachine = (lambdaFn: Function) => {
        const createDataset = new Task(this, 'Create Dataset', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.dataset"
        });

        const describeDatasetStatus = new Task(this, 'Describe Dataset', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.dataset"
        });

        const isDatasetComplete = new Choice(this, 'Dataset Create Complete?');
        const isDatasetImportJobComplete = new Choice(this, 'Dataset Import Job Complete?');

        const setCreateDataset = new Pass(this, 'Set Create Dataset', {
            parameters: { 
                verb: "createDataset", 
                params: { 
                    "datasetGroupArn.$": "$.datasetGroupArn", 
                    "datasetType.$": "$.datasetType", 
                    "name.$": "$.name",
                    "schemaArn.$": "$.schemaArn" 
                } },
            resultPath: "$.action"
        });

        const setDescribeDataset = new Pass(this, 'Set Describe Dataset', {
            parameters: { verb: "describeDataset", params: { "datasetArn.$": "$.dataset.datasetArn" } },
            resultPath: "$.action"
        });

        const setCreateDatasetImportJob = new Pass(this, 'Set Create Dataset Import Job', {
            parameters: { 
                verb: "createDatasetImportJob", 
                params: { 
                    "dataSource.$": "$.dataSource", 
                    "datasetArn.$": "$.dataset.datasetArn", 
                    "jobName.$": "$.jobName",
                    "roleArn.$": "$.roleArn" 
                } },
            resultPath: "$.action"
        });

        const setDescribeDatasetImportJob = new Pass(this, 'Set Describe Dataset Import Job', {
            parameters: { verb: "describeDatasetImportJob", params: { "datasetImportJobArn.$": "$.datasetImportJob.datasetImportJobArn" } },
            resultPath: "$.action"
        });
        
        const describeDatasetImportJob = new Task(this, 'Describe Dataset Import Job', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.datasetImportJob"
        });

        const createDatasetImportJob = new Task(this, 'Create Dataset Import Job', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.datasetImportJob"
        });

        const wait10Seconds = new Wait(this, 'Wait 10 Seconds',{
            time: WaitTime.duration(Duration.seconds(10))
        });

        const wait30Seconds = new Wait(this, 'Wait 30 Seconds', { 
            time: WaitTime.duration(Duration.seconds(30))
        });

        const createDatasetFail = new Fail(this, 'Create Dataset Failed');

        const createDatasetSuccess = new Succeed(this, 'Create Dataset Success');

        setCreateDatasetImportJob
            .next(createDatasetImportJob)
            .next(setDescribeDatasetImportJob)
            .next(wait30Seconds)
            .next(describeDatasetImportJob)
            .next(isDatasetImportJobComplete
                .when(Condition.stringEquals('$.datasetImportJob.status', 'CREATE PENDING'), setDescribeDatasetImportJob)
                .when(Condition.stringEquals('$.datasetImportJob.status', 'CREATE IN_PROGRESS'), setDescribeDatasetImportJob)
                .when(Condition.stringEquals('$.datasetImportJob.status', 'CREATE FAILED'), createDatasetFail)
                .when(Condition.stringEquals('$.datasetImportJob.status', 'ACTIVE'), createDatasetSuccess));

        const dsChain = Chain
            .start(setCreateDataset)
            .next(createDataset)
            .next(setDescribeDataset)
            .next(wait10Seconds)
            .next(describeDatasetStatus)
            .next(isDatasetComplete
                .when(Condition.stringEquals('$.dataset.status', 'CREATE PENDING'), setDescribeDataset)
                .when(Condition.stringEquals('$.dataset.status', 'CREATE IN_PROGRESS'), setDescribeDataset)
                .when(Condition.stringEquals('$.dataset.status', 'CREATE FAILED'), createDatasetFail)
                .when(Condition.stringEquals('$.dataset.status', 'ACTIVE'), setCreateDatasetImportJob));

        return new StateMachine(this, 'Create Personalize Dataset', {
            definition: dsChain
        });
    }

    getSolutionStateMachine = (lambdaFn: Function) => {
        const setDescribeSolution = new Pass(this, 'Set Describe Solution Solo', {
            parameters: { verb: "describeSolution", 
                          params: { 
                              "solutionArn.$": "$.solutionArn" 
                          } },
            resultPath: "$.action"
        });

        const describeSolutionStatus = new Task(this, 'Describe Solution Solo', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.solution"
        });

        const solutionCreateChain = Chain
            .start(setDescribeSolution)
            .next(describeSolutionStatus)

    return new StateMachine(this, 'Check Solution', {
        definition: solutionCreateChain
    });
    }


    createSolutionMachine = (lambdaFn: Function) => {
        const fail = new Fail(this, 'Create Solution Failed');

        const success = new Succeed(this, 'Create Solution Success');

        const isSolutionComplete = new Choice(this, 'Solution Create Complete?');
        
        const wait5Minutes = new Wait(this, 'Wait 5 Minutes', { 
            time: WaitTime.duration(Duration.minutes(5))
        });

        const createSolution = new Task(this, 'Create Solution Step', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.solution"
        });

        const describeSolutionStatus = new Task(this, 'Describe Solution', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.solution"
        });

        const setCreateSolution = new Pass(this, 'Set Create Solution', {
            parameters: { verb: "createSolution", 
                          "params.$": "$" },  // This subs in all parameters
            resultPath: "$.action"
        });
        
        const setDescribeSolution = new Pass(this, 'Set Describe Solution', {
            parameters: { verb: "describeSolution", 
                          params: { 
                              "solutionArn.$": "$.solution.solutionArn" 
                          } },
            resultPath: "$.action"
        });

        const solutionCreateChain = Chain
            .start(setCreateSolution)
            .next(createSolution)
            .next(setDescribeSolution)
            .next(wait5Minutes)
            .next(describeSolutionStatus)
            .next(isSolutionComplete
                .when(Condition.stringEquals('$.solution.status', 'CREATE PENDING'), setDescribeSolution)
                .when(Condition.stringEquals('$.solution.status', 'CREATE IN_PROGRESS'), setDescribeSolution)
                .when(Condition.stringEquals('$.solution.status', 'CREATE FAILED'), fail)
                .when(Condition.stringEquals('$.solution.status', 'ACTIVE'), success));

        return new StateMachine(this, 'Create Solution', {
            definition: solutionCreateChain
        });
    }

    createSolutionVersionMachine = (lambdaFn: Function) => {
        const fail = new Fail(this, 'Create Solution Version Failed');

        const success = new Succeed(this, 'Create Solution Version Success');

        const isSolutionComplete = new Choice(this, 'Solution Version Create Complete?');
        
        const wait5Minutes = new Wait(this, 'Wait 5 Minutes', { 
            time: WaitTime.duration(Duration.minutes(5))
        });

        const createSolution = new Task(this, 'Create Solution Version Step', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.solutionVersion"
        });

        const describeSolutionStatus = new Task(this, 'Describe Solution Version', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.solutionVersion"
        });

        const setCreateSolution = new Pass(this, 'Set Create Solution Version', {
            parameters: { verb: "createSolutionVersion", 
                          "params.$": "$" },  // This subs in all parameters
            resultPath: "$.action"
        });
        
        const setDescribeSolution = new Pass(this, 'Set Describe Solution Version', {
            parameters: { verb: "describeSolutionVersion", 
                          params: { 
                              "solutionVersionArn.$": "$.solutionVersion.solutionVersionArn" 
                          } },
            resultPath: "$.action"
        });

        const solutionCreateChain = Chain
            .start(setCreateSolution)
            .next(createSolution)
            .next(setDescribeSolution)
            .next(wait5Minutes)
            .next(describeSolutionStatus)
            .next(isSolutionComplete
                .when(Condition.stringEquals('$.solutionVersion.status', 'CREATE PENDING'), setDescribeSolution)
                .when(Condition.stringEquals('$.solutionVersion.status', 'CREATE IN_PROGRESS'), setDescribeSolution)
                .when(Condition.stringEquals('$.solutionVersion.status', 'CREATE FAILED'), fail)
                .when(Condition.stringEquals('$.solutionVersion.status', 'ACTIVE'), success));

        return new StateMachine(this, 'Create Solution Version', {
            definition: solutionCreateChain
        });
    }
}

const app = new App();
new PersonalizeManagementStack(app, 'personalize-management-app');
app.synth();
