import { Stack, App, StackProps, Duration } from "@aws-cdk/core";
import { Role, ServicePrincipal, PolicyStatement, ManagedPolicy } from "@aws-cdk/aws-iam";
import { Bucket } from "@aws-cdk/aws-s3";
import { Function, AssetCode, Runtime } from "@aws-cdk/aws-lambda";
import { Task, Pass, Wait, Chain, Fail, Succeed, Choice, Condition, StateMachine, WaitTime, Map } from "@aws-cdk/aws-stepfunctions";
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
        this.createSolutionVersionMachine(lambdaFn);
        this.deleteDatasetGroupMachine(lambdaFn);
        this.getSolutionStateMachine(lambdaFn);
        this.createCampaignMachine(lambdaFn);
        this.createEventTrackerMachine(lambdaFn);
        this.updateCampaignMachine(lambdaFn);
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

        const success = new Succeed(this, 'Create Dataset Group Success');

        const isDatasetGroupComplete = new Choice(this, 'Dataset Group Create Complete?');
        
        const wait5Seconds = new Wait(this, 'Wait 5 Seconds', { 
            time: WaitTime.duration(Duration.seconds(5))
        });

        const createDatasetGroup = new Task(this, 'Create Dataset Group', {
            task: new InvokeFunction(lambdaFn)
        });

        const datasetExists = new Fail(this, 'Dataset Exists');

        createDatasetGroup.addCatch(datasetExists, {
            errors: ['ResourceAlreadyExistsException']
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

    return new StateMachine(this, 'Check Solution Status', {
        definition: solutionCreateChain
    });
    }

    createSolutionMachine = (lambdaFn: Function) => {
        const fail = new Fail(this, 'Create Solution Failed');

        const success = new Succeed(this, 'Create Solution Success');

        const isSolutionComplete = new Choice(this, 'Solution Create Complete?');
        
        const wait5Minutes = new Wait(this, 'Create Solution Wait 5 Minutes', { 
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

        return new StateMachine(this, 'Create Personalize Solution', {
            definition: solutionCreateChain
        });
    }

    createSolutionVersionMachine = (lambdaFn: Function) => {
        const fail = new Fail(this, 'Create Solution Version Failed');

        const success = new Succeed(this, 'Create Solution Version Success');

        const isSolutionVersionComplete = new Choice(this, 'Solution Version Create Complete?');
        
        const wait5Minutes = new Wait(this, 'Create Solution Version Wait 5 Minutes', { 
            time: WaitTime.duration(Duration.minutes(5))
        });

        const createSolutionVersion = new Task(this, 'Create Solution Version Step', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.solutionVersion"
        });

        const describeSolutionVersionStatus = new Task(this, 'Describe Solution Version', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.solutionVersion"
        });

        /*
            Input Parameters:

            {
                 "solutionArn": "string",
                 "trainingMode": "string"
            }
        */
        const setCreateSolutionVersion = new Pass(this, 'Set Create Solution Version', {
            parameters: { verb: "createSolutionVersion", 
                          "params.$": "$" },  // This subs in all parameters
            resultPath: "$.action"
        });
        
        const setDescribeSolutionVersion = new Pass(this, 'Set Describe Solution Version', {
            parameters: { verb: "describeSolutionVersion", 
                          params: { 
                              "solutionVersionArn.$": "$.solutionVersion.solutionVersionArn" 
                          } },
            resultPath: "$.action"
        });

        const solutionVersionCreateChain = Chain
            .start(setCreateSolutionVersion)
            .next(createSolutionVersion)
            .next(setDescribeSolutionVersion)
            .next(wait5Minutes)
            .next(describeSolutionVersionStatus)
            .next(isSolutionVersionComplete
                .when(Condition.stringEquals('$.solutionVersion.status', 'CREATE PENDING'), setDescribeSolutionVersion)
                .when(Condition.stringEquals('$.solutionVersion.status', 'CREATE IN_PROGRESS'), setDescribeSolutionVersion)
                .when(Condition.stringEquals('$.solutionVersion.status', 'CREATE FAILED'), fail)
                .when(Condition.stringEquals('$.solutionVersion.status', 'ACTIVE'), success));

        return new StateMachine(this, 'Create Solution Version', {
            definition: solutionVersionCreateChain
        });
    }

    createCampaignMachine = (lambdaFn: Function) => {
        const fail = new Fail(this, 'Create Campaign Failed');

        const success = new Succeed(this, 'Create Campaign Success');

        const isCampaignComplete = new Choice(this, 'Create Campaign Complete?');
        
        const wait30Seconds = new Wait(this, 'Create Campaign Wait 30 Seconds', { 
            time: WaitTime.duration(Duration.seconds(30))
        });

        const createCampaign = new Task(this, 'Create Campaign Step', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.campaign"
        });

        const describeCampaignStatus = new Task(this, 'Describe Campaign', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.campaign"
        });

        /*
            Input Parameters:

            {
                "minProvisionedTPS": number,
                "name": "string",
                "solutionVersionArn": "string"
            }
        */
        const setCreateCampaign = new Pass(this, 'Set Create Campaign', {
            parameters: { verb: "createCampaign", 
                          "params.$": "$" },  // This subs in all parameters
            resultPath: "$.action"
        });
        
        const setDescribeCampaign = new Pass(this, 'Set Describe Campaign', {
            parameters: { verb: "describeCampaign", 
                          params: { 
                              "campaignArn.$": "$.campaign.campaignArn" 
                          } },
            resultPath: "$.action"
        });

        const createCampaignChain = Chain
            .start(setCreateCampaign)
            .next(createCampaign)
            .next(setDescribeCampaign)
            .next(wait30Seconds)
            .next(describeCampaignStatus)
            .next(isCampaignComplete
                .when(Condition.stringEquals('$.campaign.status', 'CREATE PENDING'), setDescribeCampaign)
                .when(Condition.stringEquals('$.campaign.status', 'CREATE IN_PROGRESS'), setDescribeCampaign)
                .when(Condition.stringEquals('$.campaign.status', 'CREATE FAILED'), fail)
                .when(Condition.stringEquals('$.campaign.status', 'ACTIVE'), success));

        return new StateMachine(this, 'Create Campaign', {
            definition: createCampaignChain
        });
    }

    updateCampaignMachine = (lambdaFn: Function) => {
        const fail = new Fail(this, 'Update Campaign Failed');

        const success = new Succeed(this, 'Update Campaign Success');

        const isUpdateCampaignComplete = new Choice(this, 'Update Campaign Complete?');
        
        const wait30Seconds = new Wait(this, 'Update Campaign Wait 30 Seconds', { 
            time: WaitTime.duration(Duration.seconds(30))
        });

        const updateCampaign = new Task(this, 'Update Campaign Step', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.campaign"
        });

        const describeUpdateCampaignStatus = new Task(this, 'Describe Update Campaign', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.campaign"
        });

        /*
            Input Parameters:

            {
                "minProvisionedTPS": number,
                "campaignArn": "string",
                "solutionVersionArn": "string"
            }
        */
        const setUpdateCampaign = new Pass(this, 'Set Update Campaign', {
            parameters: { verb: "updateCampaign", 
                          "params.$": "$" },  // This subs in all parameters
            resultPath: "$.action"
        });
        
        const setDescribeUpdateCampaign = new Pass(this, 'Set Describe Update Campaign', {
            parameters: { verb: "describeCampaign", 
                          params: { 
                              "campaignArn.$": "$.campaign.campaignArn" 
                          } },
            resultPath: "$.action"
        });

        const updateCampaignChain = Chain
            .start(setUpdateCampaign)
            .next(updateCampaign)
            .next(setDescribeUpdateCampaign)
            .next(wait30Seconds)
            .next(describeUpdateCampaignStatus)
            .next(isUpdateCampaignComplete
                .when(Condition.stringEquals('$.campaign.status', 'CREATE PENDING'), setDescribeUpdateCampaign)
                .when(Condition.stringEquals('$.campaign.status', 'CREATE IN_PROGRESS'), setDescribeUpdateCampaign)
                .when(Condition.stringEquals('$.campaign.status', 'CREATE FAILED'), fail)
                .when(Condition.stringEquals('$.campaign.status', 'ACTIVE'), success));

        return new StateMachine(this, 'Update Campaign', {
            definition: updateCampaignChain
        });
    }

    createEventTrackerMachine = (lambdaFn: Function) => {
        const fail = new Fail(this, 'Create Event Tracker Failed');

        const success = new Succeed(this, 'Create Event Tracker Success');

        const isEventTrackerComplete = new Choice(this, 'Create Event Tracker Complete?');
        
        const wait30Seconds = new Wait(this, 'Create Event Tracker Wait 30 Seconds', { 
            time: WaitTime.duration(Duration.seconds(30))
        });

        const createEventTracker = new Task(this, 'Create Event Tracker Step', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.eventTracker"
        });

        const describeEventTrackerStatus = new Task(this, 'Describe Event Tracker', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.eventTracker"
        });

        /*
            Input Parameters:

           {
                "datasetGroupArn": "string",
                "name": "string"
           }
        */
        const setCreateEventTracker = new Pass(this, 'Set Create Event Tracker', {
            parameters: { verb: "createEventTracker", 
                          "params.$": "$" },  // This subs in all parameters
            resultPath: "$.action"
        });
        
        const setDescribeEventTracker = new Pass(this, 'Set Describe Event Tracker', {
            parameters: { verb: "describeEventTracker", 
                          params: { 
                              "eventTrackerArn.$": "$.eventTracker.eventTrackerArn" 
                          } },
            resultPath: "$.action"
        });

        const createEventTrackerChain = Chain
            .start(setCreateEventTracker)
            .next(createEventTracker)
            .next(setDescribeEventTracker)
            .next(wait30Seconds)
            .next(describeEventTrackerStatus)
            .next(isEventTrackerComplete
                .when(Condition.stringEquals('$.eventTracker.status', 'CREATE PENDING'), setDescribeEventTracker)
                .when(Condition.stringEquals('$.eventTracker.status', 'CREATE IN_PROGRESS'), setDescribeEventTracker)
                .when(Condition.stringEquals('$.eventTracker.status', 'CREATE FAILED'), fail)
                .when(Condition.stringEquals('$.eventTracker.status', 'ACTIVE'), success));

        return new StateMachine(this, 'Create Event Tracker', {
            definition: createEventTrackerChain
        });
    }

    deleteDatasetMachine = (lambdaFn: Function) => {
        const success = new Succeed(this, 'Delete Dataset Success');

        const isDeleteDatasetComplete = new Choice(this, 'Delete Dataset Complete?');
        
        const wait5Minutes = new Wait(this, 'Delete Dataset Wait 5 Minutes', { 
            time: WaitTime.duration(Duration.minutes(5))
        });

        const deleteDataset = new Task(this, 'Delete Dataset Step', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.dataset"
        });

        const describeDatasetStatus = new Task(this, 'Describe Dataset', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.dataset"
        });

        const setDeleteDataset = new Pass(this, 'Set Delete Dataset', {
            parameters: { verb: "deleteDataset", 
                          "params.$": "$" },  // This subs in all parameters
            resultPath: "$.action"
        });
        
        const setDescribeDataset = new Pass(this, 'Set Describe Dataset', {
            parameters: { verb: "describeDataset", 
                          params: { 
                              "datasetArn.$": "$.dataset.datasetArn" 
                          } },
            resultPath: "$.action"
        });

        const deleteDatasetChain = Chain
            .start(setDeleteDataset)
            .next(deleteDataset)
            .next(setDescribeDataset)
            .next(wait5Minutes)
            .next(describeDatasetStatus)
            .next(isDeleteDatasetComplete
                .when(Condition.stringEquals('$.dataset.status', 'DELETE PENDING'), setDescribeDataset)
                .when(Condition.stringEquals('$.dataset.status', 'DELETE IN_PROGRESS'), setDescribeDataset)
                .otherwise(success));

        return new StateMachine(this, 'Delete Dataset', {
            definition: deleteDatasetChain
        });
    }

    // Delete all dataset group artefacts - this will delete all campaigns, solutions, trackers, and datasets 
    // associated with a given dataset group - may run for for a looong time

    // TODO:  Add wait states for any datasets that are in create mode when this is run

    deleteDatasetGroupMachine = (lambdaFn: Function) => {
        const setListAllSolutions = new Pass(this, "Set List All Solutions", {
            parameters: { verb: "listSolutions",
                          "params.$": "$" },
            resultPath: "$.action"
        });

        const listAllSolutions = new Task(this, 'List All Solutions', {
            task: new InvokeFunction(lambdaFn), 
            resultPath: "$.action",
        });

        const setDeleteSolution = new Pass(this, "Set Delete Solution", {
            parameters: { verb: "deleteSolution", 
                          "params.$": "$.solutionArn"},
            resultPath: "$.action"
        }); 
        
        const deleteSolution = new Task(this, 'Delete Solution', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.action"
        });

        const setDeleteCampaign = new Pass(this, "Set Delete Campaign", {
            parameters: { verb: "deleteCampaign", 
                          "params.$": "$.campaignArn"},
            resultPath: "$.action"
        }); 
        
        const deleteCampaign = new Task(this, 'Delete Campaign', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.action"
        });

        const setListCampaignsForSolution = new Pass(this, "Set List Campaigns", {
            parameters: { verb: "listCampaigns",
                          "params.$": "$.solutionArn" },
            resultPath: "$.action"
        });

        const listCampaignsForSolution = new Task(this, "List Campaigns", {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.action"
        });

        const setListEventTrackers = new Pass(this, "Set List Event Trackers", {
            parameters: { verb: "listEventTrackers",
                          "params.$": "$.datasetGroupArn" },
            resultPath: "$.action"
        });

        const listEventTrackers = new Task(this, "List Event Trackers", {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.action"
        });

        const setDeleteEventTracker = new Pass(this, 'Set Delete Event Tracker', {
            parameters: { verb: 'deleteEventTracker',
                          "params.$": "$.eventTrackerArn" },
            resultPath: "$.action"
        });

        const deleteEventTracker = new Task(this, 'Delete Event Tracker', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.action"
        })

        const mapAndDeleteEventTrackers = new Map(this, 'Map Event Trackers', {
            maxConcurrency: 1,
            itemsPath: "$.action.eventTrackers",
            resultPath: "$.params"
        });

        const setDeleteDatasetGroup = new Pass(this, 'Set Delete Dataset Group', {
            parameters: { verb: 'deleteDatasetGroup',
                          "params.$": "$.datasetGroupArn" },
            resultPath: "$.action"
        });

        const deleteDatasetGroup = new Task(this, 'Delete Dataset Group', {
            task: new InvokeFunction(lambdaFn),
            resultPath: "$.action"
        });

        const deleteEventTrackersChain = Chain
            .start(setDeleteEventTracker)
            .next(deleteEventTracker);
        
        mapAndDeleteEventTrackers.iterator(deleteEventTrackersChain);

        const mapCampaigns = new Map(this, 'Map and Delete all Campaigns for a Solution', {
            maxConcurrency: 1,
            itemsPath: "$.action.campaigns",
            resultPath: "$.params"
        });
       
        const deleteCampaignsChain = Chain
            .start(setDeleteCampaign)
            .next(deleteCampaign);

        mapCampaigns.iterator(deleteCampaignsChain);

        const deleteCampaignsForSolutionChain = Chain
            .start(setListCampaignsForSolution)
            .next(listCampaignsForSolution)
            .next(mapCampaigns)
            .next(setDeleteSolution)
            .next(deleteSolution);

        const mapSolutions = new Map(this, 'Map All Solutions and Delete Campaigns', {
            maxConcurrency: 1,
            itemsPath: "$.action.solutions",
            resultPath: "$.params"
        });

        mapSolutions.iterator(deleteCampaignsForSolutionChain);
        
        const deleteDatasetGroupChain = Chain
            .start(setListEventTrackers)
            .next(listEventTrackers)
            .next(mapAndDeleteEventTrackers)
            .next(setListAllSolutions)
            .next(listAllSolutions)
            .next(mapSolutions)
            .next(setDeleteDatasetGroup)
            .next(deleteDatasetGroup);

        return new StateMachine(this, 'Delete All Dataset Group Resources', {
            definition: deleteDatasetGroupChain
        });
    }
 
}

const app = new App();
new PersonalizeManagementStack(app, 'personalize-management-app');
app.synth();
