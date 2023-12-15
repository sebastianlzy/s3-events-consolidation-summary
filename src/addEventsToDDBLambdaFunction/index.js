const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB();
const {marshall, unmarshall} = AWS.DynamoDB.Converter
const s3PutEventJson = require("./s3-put-event-test.json")
const get = require('lodash/get')

const getS3UniqueFileName = (record) => {
    const s3BucketName = get(record, "s3.bucket.name")
    const s3FileKey = get(record, "s3.object.key")
    return `${s3BucketName}/${s3FileKey}`
}


const generateMockData = () => {
    function generateRandomDate(from, to) {
        return new Date(
            from.getTime() +
            Math.random() * (to.getTime() - from.getTime()),
        );
    }

    const createdAt = generateRandomDate(new Date(2023, 10, 1), new Date());
    const modifiedAt = generateRandomDate(new Date(2023, 11, 14), new Date())

    const params = {
        Item: {
            "eventId": {
                S: `eventId-${Date.now()}`
            },
            "createdDate": {
                S: new Date(createdAt.toISOString()).toLocaleDateString('en-GB')
            },
            "modifiedDate": {
                S: new Date(modifiedAt.toISOString()).toLocaleDateString('en-GB')
            },
            "createdAt": {
                S: createdAt.toISOString()
            },
            "modifiedAt": {
                S: modifiedAt.toISOString()
            },
        },
        ReturnConsumedCapacity: "TOTAL",
        TableName: process.env.DDB_TABLE_NAME
    };

}

const createDDBItem = (record) => {

    const eventTime = new Date(get(record, "eventTime"))

    const item = {
        "eventId": `${getS3UniqueFileName(record)}-${Date.now()}`,
        "createdDate": new Date(eventTime.toISOString()).toLocaleDateString('en-GB'),
        "eventName": get(record, "eventName"),
        ...record
    }

    return marshall(item)

}

const createDDBParams = (items) => {
    const putRequests = items.map((item) => {
        return {
            "PutRequest": {
                "Item": {...item}
            }
        }
    })
    return {
        "RequestItems": {
            [process.env.DDB_TABLE_NAME]: putRequests
        }
    }
}

async function main(event) {
    console.log('event is 👉', JSON.stringify(event, null, 4))

    const records = get(event, "Records", [])
    const items = []
    for (let i = 0; i < records.length; i++) {
        items.push(createDDBItem(records[i]))
    }


    const params = createDDBParams(items)
    // console.log(JSON.stringify(params, null, 4))
    const ddbBatchWriteItemPromise = dynamodb.batchWriteItem(params).promise();
    return ddbBatchWriteItemPromise
        .then((data) => console.log("Success: ", data))
        .catch((err) => console.log(err))
}

exports.main = main


// main(s3PutEventJson)