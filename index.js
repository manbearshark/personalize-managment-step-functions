"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("@aws-cdk/core");
const iam = require("@aws-cdk/aws-iam");
const sfn = require("@aws-cdk/aws-stepfunctions");
const lambda = require("@aws-cdk/aws-lambda");
const sfn_tasks = require("@aws-cdk/aws-stepfunctions-tasks");
class JobPollerStack extends cdk.Stack {
    constructor(scope, id, props = {}) {
        super(scope, id, props);
        const lambdaFn = new lambda.Function(this, 'PersonalizeAPIExecutor', {
            code: new lambda.AssetCode('resource/lambda'),
            handler: 'action-executor.handler',
            runtime: lambda.Runtime.NODEJS_10_X,
        });
        // Set Personalize permissions - this is required per the Personalize execution role
        if (lambdaFn.role) {
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
            result: { value: { verb: "createDatasetGroup", params: { name: "$.datasetGroupName" } } },
            resultPath: "$.action"
        });
        const wait30Seconds = new sfn.Wait(this, 'Wait 30 Seconds', {
            time: sfn.WaitTime.duration(cdk.Duration.seconds(30))
        });
        const fail = new sfn.Fail(this, 'Create Failed');
        const success = new sfn.Succeed(this, 'Success');
        const isComplete = new sfn.Choice(this, 'Create Complete?');
        const chain = sfn.Chain
            .start(setCreateDatasetGroup)
            .next(createDatasetGroup)
            .next(wait30Seconds)
            .next(describeDatasetGroupStatus)
            .next(isComplete
            .when(sfn.Condition.stringEquals('$.action.result.status', 'CREATE PENDING'), wait30Seconds)
            .when(sfn.Condition.stringEquals('$.action.result.status', 'CREATE IN_PROGRESS'), wait30Seconds)
            .when(sfn.Condition.stringEquals('$.action.result.status', 'CREATE FAILED'), fail)
            .when(sfn.Condition.stringEquals('$.action.result.status', 'ACTIVE'), success));
        new sfn.StateMachine(this, 'StateMachine', {
            definition: chain,
            timeout: cdk.Duration.seconds(30)
        });
    }
}
const app = new cdk.App();
new JobPollerStack(app, 'aws-stepfunctions-integ');
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLHFDQUFzQztBQUN0Qyx3Q0FBeUM7QUFDekMsa0RBQW1EO0FBQ25ELDhDQUErQztBQUMvQyw4REFBK0Q7QUFFL0QsTUFBTSxjQUFlLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDbEMsWUFBWSxLQUFjLEVBQUUsRUFBVSxFQUFFLFFBQXdCLEVBQUU7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNqRSxJQUFJLEVBQUUsSUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLGlCQUFpQixDQUFDO1lBQzdDLE9BQU8sRUFBRSx5QkFBeUI7WUFDbEMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztTQUNwQyxDQUFDLENBQUM7UUFFTCxvRkFBb0Y7UUFFcEYsSUFBRyxRQUFRLENBQUMsSUFBSSxFQUFFO1lBQ2QsUUFBUSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLDBDQUEwQyxDQUFDLENBQUMsQ0FBQztZQUN2SCxRQUFRLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1NBQ3RHO1FBRUQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQ2xFLElBQUksRUFBRSxJQUFJLFNBQVMsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDO1NBQy9DLENBQUMsQ0FBQztRQUVILE1BQU0sMEJBQTBCLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUM1RSxJQUFJLEVBQUUsSUFBSSxTQUFTLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQztTQUMvQyxDQUFDLENBQUM7UUFFSCxNQUFNLHFCQUFxQixHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLEVBQUU7WUFDekUsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sRUFBRSxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBRSxFQUFFLEVBQUU7WUFDekYsVUFBVSxFQUFFLFVBQVU7U0FDekIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUN4RCxJQUFJLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDeEQsQ0FBQyxDQUFDO1FBRUgsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxlQUFlLENBQUMsQ0FBQztRQUVqRCxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRWpELE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUU1RCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSzthQUNsQixLQUFLLENBQUMscUJBQXFCLENBQUM7YUFDNUIsSUFBSSxDQUFDLGtCQUFrQixDQUFDO2FBQ3hCLElBQUksQ0FBQyxhQUFhLENBQUM7YUFDbkIsSUFBSSxDQUFDLDBCQUEwQixDQUFDO2FBQ2hDLElBQUksQ0FBQyxVQUFVO2FBQ1gsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLHdCQUF3QixFQUFFLGdCQUFnQixDQUFDLEVBQUUsYUFBYSxDQUFDO2FBQzNGLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLGFBQWEsQ0FBQzthQUMvRixJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsd0JBQXdCLEVBQUUsZUFBZSxDQUFDLEVBQUUsSUFBSSxDQUFDO2FBQ2pGLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsRUFBRSxRQUFRLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBRXhGLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3ZDLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7U0FDcEMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKO0FBRUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFDMUIsSUFBSSxjQUFjLENBQUMsR0FBRyxFQUFFLHlCQUF5QixDQUFDLENBQUM7QUFDbkQsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGNkayA9IHJlcXVpcmUoJ0Bhd3MtY2RrL2NvcmUnKTtcbmltcG9ydCBpYW0gPSByZXF1aXJlKFwiQGF3cy1jZGsvYXdzLWlhbVwiKTtcbmltcG9ydCBzZm4gPSByZXF1aXJlKCdAYXdzLWNkay9hd3Mtc3RlcGZ1bmN0aW9ucycpO1xuaW1wb3J0IGxhbWJkYSA9IHJlcXVpcmUoJ0Bhd3MtY2RrL2F3cy1sYW1iZGEnKTtcbmltcG9ydCBzZm5fdGFza3MgPSByZXF1aXJlKCdAYXdzLWNkay9hd3Mtc3RlcGZ1bmN0aW9ucy10YXNrcycpO1xuXG5jbGFzcyBKb2JQb2xsZXJTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5BcHAsIGlkOiBzdHJpbmcsIHByb3BzOiBjZGsuU3RhY2tQcm9wcyA9IHt9KSB7XG4gICAgICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgICAgIGNvbnN0IGxhbWJkYUZuID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUGVyc29uYWxpemVBUElFeGVjdXRvcicsIHtcbiAgICAgICAgICAgIGNvZGU6IG5ldyBsYW1iZGEuQXNzZXRDb2RlKCdyZXNvdXJjZS9sYW1iZGEnKSxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdhY3Rpb24tZXhlY3V0b3IuaGFuZGxlcicsXG4gICAgICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTBfWCxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAvLyBTZXQgUGVyc29uYWxpemUgcGVybWlzc2lvbnMgLSB0aGlzIGlzIHJlcXVpcmVkIHBlciB0aGUgUGVyc29uYWxpemUgZXhlY3V0aW9uIHJvbGVcblxuICAgICAgICBpZihsYW1iZGFGbi5yb2xlKSB7XG4gICAgICAgICAgICBsYW1iZGFGbi5yb2xlLmFkZE1hbmFnZWRQb2xpY3koaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQW1hem9uUGVyc29uYWxpemVGdWxsQWNjZXNzJykpO1xuICAgICAgICAgICAgbGFtYmRhRm4ucm9sZS5hZGRNYW5hZ2VkUG9saWN5KGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQ2xvdWRXYXRjaEZ1bGxBY2Nlc3MnKSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGNyZWF0ZURhdGFzZXRHcm91cCA9IG5ldyBzZm4uVGFzayh0aGlzLCAnQ3JlYXRlIERhdGFzZXQgR3JvdXAnLCB7XG4gICAgICAgICAgICB0YXNrOiBuZXcgc2ZuX3Rhc2tzLkludm9rZUZ1bmN0aW9uKGxhbWJkYUZuKVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBkZXNjcmliZURhdGFzZXRHcm91cFN0YXR1cyA9IG5ldyBzZm4uVGFzayh0aGlzLCAnRGVzY3JpYmUgRGF0YXNldCBHcm91cCcsIHtcbiAgICAgICAgICAgIHRhc2s6IG5ldyBzZm5fdGFza3MuSW52b2tlRnVuY3Rpb24obGFtYmRhRm4pXG4gICAgICAgIH0pO1xuICAgICAgXG4gICAgICAgIGNvbnN0IHNldENyZWF0ZURhdGFzZXRHcm91cCA9IG5ldyBzZm4uUGFzcyh0aGlzLCAnU2V0IENyZWF0ZSBEYXRhc2V0IEdyb3VwJywge1xuICAgICAgICAgICAgcmVzdWx0OiB7IHZhbHVlOiB7IHZlcmI6IFwiY3JlYXRlRGF0YXNldEdyb3VwXCIsIHBhcmFtczogeyBuYW1lOiBcIiQuZGF0YXNldEdyb3VwTmFtZVwiIH0gfSB9LFxuICAgICAgICAgICAgcmVzdWx0UGF0aDogXCIkLmFjdGlvblwiXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHdhaXQzMFNlY29uZHMgPSBuZXcgc2ZuLldhaXQodGhpcywgJ1dhaXQgMzAgU2Vjb25kcycsIHsgXG4gICAgICAgICAgICB0aW1lOiBzZm4uV2FpdFRpbWUuZHVyYXRpb24oY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApKVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBmYWlsID0gbmV3IHNmbi5GYWlsKHRoaXMsICdDcmVhdGUgRmFpbGVkJyk7XG5cbiAgICAgICAgY29uc3Qgc3VjY2VzcyA9IG5ldyBzZm4uU3VjY2VlZCh0aGlzLCAnU3VjY2VzcycpO1xuXG4gICAgICAgIGNvbnN0IGlzQ29tcGxldGUgPSBuZXcgc2ZuLkNob2ljZSh0aGlzLCAnQ3JlYXRlIENvbXBsZXRlPycpO1xuXG4gICAgICAgIGNvbnN0IGNoYWluID0gc2ZuLkNoYWluXG4gICAgICAgICAgICAuc3RhcnQoc2V0Q3JlYXRlRGF0YXNldEdyb3VwKVxuICAgICAgICAgICAgLm5leHQoY3JlYXRlRGF0YXNldEdyb3VwKVxuICAgICAgICAgICAgLm5leHQod2FpdDMwU2Vjb25kcylcbiAgICAgICAgICAgIC5uZXh0KGRlc2NyaWJlRGF0YXNldEdyb3VwU3RhdHVzKVxuICAgICAgICAgICAgLm5leHQoaXNDb21wbGV0ZVxuICAgICAgICAgICAgICAgIC53aGVuKHNmbi5Db25kaXRpb24uc3RyaW5nRXF1YWxzKCckLmFjdGlvbi5yZXN1bHQuc3RhdHVzJywgJ0NSRUFURSBQRU5ESU5HJyksIHdhaXQzMFNlY29uZHMpXG4gICAgICAgICAgICAgICAgLndoZW4oc2ZuLkNvbmRpdGlvbi5zdHJpbmdFcXVhbHMoJyQuYWN0aW9uLnJlc3VsdC5zdGF0dXMnLCAnQ1JFQVRFIElOX1BST0dSRVNTJyksIHdhaXQzMFNlY29uZHMpXG4gICAgICAgICAgICAgICAgLndoZW4oc2ZuLkNvbmRpdGlvbi5zdHJpbmdFcXVhbHMoJyQuYWN0aW9uLnJlc3VsdC5zdGF0dXMnLCAnQ1JFQVRFIEZBSUxFRCcpLCBmYWlsKVxuICAgICAgICAgICAgICAgIC53aGVuKHNmbi5Db25kaXRpb24uc3RyaW5nRXF1YWxzKCckLmFjdGlvbi5yZXN1bHQuc3RhdHVzJywgJ0FDVElWRScpLCBzdWNjZXNzKSk7XG5cbiAgICAgICAgbmV3IHNmbi5TdGF0ZU1hY2hpbmUodGhpcywgJ1N0YXRlTWFjaGluZScsIHtcbiAgICAgICAgICAgIGRlZmluaXRpb246IGNoYWluLFxuICAgICAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApXG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbm5ldyBKb2JQb2xsZXJTdGFjayhhcHAsICdhd3Mtc3RlcGZ1bmN0aW9ucy1pbnRlZycpO1xuYXBwLnN5bnRoKCk7XG4iXX0=