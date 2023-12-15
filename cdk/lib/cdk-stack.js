const {Stack, CfnOutput, RemovalPolicy, CfnParameter} = require('aws-cdk-lib');
// const sqs = require('aws-cdk-lib/aws-sqs');
const s3 = require('aws-cdk-lib/aws-s3')
const dynamodb = require('aws-cdk-lib/aws-dynamodb')
const s3n = require('aws-cdk-lib/aws-s3-notifications')
const lambda = require('aws-cdk-lib/aws-lambda')
const sns = require('aws-cdk-lib/aws-sns')
const snsSubscriptions = require('aws-cdk-lib/aws-sns-subscriptions')
const path = require('path');

class CdkStack extends Stack {
    /**
     *
     * @param {Construct} scope
     * @param {string} id
     * @param {StackProps=} props
     */
    constructor(scope, id, props) {
        super(scope, id, props);


        const createEventsDDBTable = (ddbCreatedDateGlobalIndexName) => {

            return new dynamodb.TableV2(this, 'ddbS3EventsTable', {
                partitionKey: {name: 'eventId', type: dynamodb.AttributeType.STRING},
                sortKey: {name: 'createdDate', type: dynamodb.AttributeType.STRING},
                globalSecondaryIndexes: [
                    {
                        indexName: ddbCreatedDateGlobalIndexName,
                        partitionKey: {name: 'createdDate', type: dynamodb.AttributeType.STRING},
                        sortKey: {name: 'eventName', type: dynamodb.AttributeType.STRING},
                    },
                ],
            })
        }
        
        const createSNSTopicToSendSummarizedReports = (topicName) => {
            const emailAddress = new CfnParameter(this, "subscriptionEmail");

            const topic = new sns.Topic(this, topicName)
            topic.addSubscription(
                new snsSubscriptions.EmailSubscription(
                    emailAddress.value.toString()
                )
            );
            
            return topic
        }

        const createEventsTargetS3Bucket = (lambdaFunction) => {
            return new s3.Bucket(this, 's3EventTargetBucket', {
                removalPolicy: RemovalPolicy.DESTROY,
                autoDeleteObjects: true,
            })
        }

        const sendS3EventsToLambdaFunction = (eventTypes, s3Bucket, lambdaFunction) => {
            eventTypes.map((s3EventType) => {
                s3Bucket.addEventNotification(
                    s3EventType,
                    new s3n.LambdaDestination(lambdaFunction),
                );
            })
        }

        const createLambdaFunctionsToAddS3EventsToDDB = (ddbS3EventsTable, ddbCreatedDateGlobalIndexName) => {
            return new lambda.Function(this, 'addS3EventsToDDBLambdaFunction', {
                runtime: lambda.Runtime.NODEJS_16_X,
                handler: 'index.main',
                code: lambda.Code.fromAsset(path.join(__dirname, '/../../src/addEventsToDDBLambdaFunction')),
                environment: {
                    DDB_TABLE_NAME: ddbS3EventsTable.tableName,
                    DDB_CREATED_DATE_INDEX_NAME: ddbCreatedDateGlobalIndexName
                }
            })
        }

        const createLambdaFunctionsToSummarizeEventsInDDB = (ddbS3EventsTable, ddbCreatedDateGlobalIndexName, summarizedReportSNSTopic) => {
            return new lambda.Function(this, 'getSummaryOfS3EventsLambdaFunction', {
                runtime: lambda.Runtime.NODEJS_16_X,
                handler: 'index.main',
                code: lambda.Code.fromAsset(path.join(__dirname, '/../../src/getSummaryOfS3EventsLambdaFunction')),
                environment: {
                    DDB_TABLE_NAME: ddbS3EventsTable.tableName,
                    DDB_CREATED_DATE_INDEX_NAME: ddbCreatedDateGlobalIndexName,
                    SNS_TOPIC_ARN: summarizedReportSNSTopic.topicArn
                }
            })
        }


        const grantLambdaFunctionsAccessToDDB = (ddbS3EventsTable, lambdaFunctions) => {
            lambdaFunctions.forEach((lambdaFunction) => {
                ddbS3EventsTable.grantWriteData(lambdaFunction)
                ddbS3EventsTable.grantReadData(lambdaFunction)
            })

        }


        const createOutput = (eventsTargetS3Bucket, summarizedReportSNSTopic) => {
            new CfnOutput(this, 's3EventTargetBucketCFNOutput', {
                value: eventsTargetS3Bucket.bucketName,
            });
            new CfnOutput(this, 'summarizedReportSNSTopicCFNoutput', {
                value: summarizedReportSNSTopic.topicName
            });
        }

        const ddbCreatedDateGlobalIndexName = "createdDateGlobalIndexName"
        const eventsDdbTable = createEventsDDBTable(ddbCreatedDateGlobalIndexName)

        const summarizeReportSNSTopicName = 's3EventSummaryReport'
        const summarizedReportSNSTopic = createSNSTopicToSendSummarizedReports(summarizeReportSNSTopicName)
        
        const addS3EventsLambda = createLambdaFunctionsToAddS3EventsToDDB(eventsDdbTable, ddbCreatedDateGlobalIndexName)
        const summarizeEventLambda = createLambdaFunctionsToSummarizeEventsInDDB(eventsDdbTable, ddbCreatedDateGlobalIndexName, summarizedReportSNSTopic)
        
        grantLambdaFunctionsAccessToDDB(eventsDdbTable,[addS3EventsLambda, summarizeEventLambda])

        const eventsTargetS3Bucket = createEventsTargetS3Bucket(addS3EventsLambda)
        sendS3EventsToLambdaFunction([s3.EventType.OBJECT_CREATED, s3.EventType.OBJECT_REMOVED], eventsTargetS3Bucket, addS3EventsLambda)


        
        // const reportSchedulingEventBridgeRule = createSchedulingInEventBridgeRuleToSendReports()
        createOutput(eventsTargetS3Bucket, summarizedReportSNSTopic)
    }
}

module.exports = {CdkStack}
