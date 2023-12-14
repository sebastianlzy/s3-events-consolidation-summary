const { Stack, CfnOutput, RemovalPolicy } = require('aws-cdk-lib');
// const sqs = require('aws-cdk-lib/aws-sqs');
const s3 = require('aws-cdk-lib/aws-s3')
const dynamodb = require('aws-cdk-lib/aws-dynamodb')
const s3n = require('aws-cdk-lib/aws-s3-notifications')
const lambda = require('aws-cdk-lib/aws-lambda')
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

    const ddbS3EventsTable = new dynamodb.TableV2(this, 'ddbS3EventsTable', {
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdDate', type: dynamodb.AttributeType.STRING },
      globalSecondaryIndexes: [
        {
          indexName: 'globalSecondaryIndex',
          partitionKey: { name: 'createdDate', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'modifiedDate', type: dynamodb.AttributeType.STRING },
        },
      ],
    });

    const addS3EventsToDDBLambdaFunction = new lambda.Function(this, 'addS3EventsToDDBLambdaFunction', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.main',
      code: lambda.Code.fromAsset(path.join(__dirname, '/../../src/addEventsToDDBLambdaFunction')),
    });

    const s3EventTargetBucket = new s3.Bucket(this, 's3EventTargetBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    s3EventTargetBucket.addEventNotification(
        s3.EventType.OBJECT_CREATED,
        new s3n.LambdaDestination(addS3EventsToDDBLambdaFunction),
        // 👇 only invoke lambda if object matches the filter
        // {prefix: 'test/', suffix: '.yaml'},
    );

    
    const createOutput = () => {
      new CfnOutput(this, 's3EventTargetBucketCFNOutput', {
        value: s3EventTargetBucket.bucketName,
      });
    }
    
    
    createOutput()
  }
}

module.exports = { CdkStack }
