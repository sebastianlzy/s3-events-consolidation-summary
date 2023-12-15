const AWS = require('aws-sdk')
const dynamodb = new AWS.DynamoDB();
const {marshall, unmarshall} = AWS.DynamoDB.Converter

const get = require('lodash/get')
const set = require('lodash/set')


const sns = new AWS.SNS()

const getSummarizedReport = (data) => {
    const items = get(data, 'Items')
    const report = items.reduce((acc, item) => {
        const event = unmarshall(item)
        const createdDate = get(event, "createdDate")
        const eventName = get(event, "eventName")
        const eventId = get(event, "eventId")

        if (get(acc, `${createdDate}-${eventName}`) === undefined) {
            set(acc, `${createdDate}-${eventName}`, [eventId])
            return acc
        }

        acc[`${createdDate}-${eventName}`].push(eventId)
        return acc
    }, {})

    return report
}

const sendReportToSNS = (report) => {
    const params = {
        Message: JSON.stringify(report, null, 4),
        TopicArn: process.env.SNS_TOPIC_ARN
    }
    
    return sns.publish(params).promise()
}

async function main(event) {
    console.log('event is 👉', JSON.stringify(event, null, 4))
    const todayDate = new Date();

    const params = {
        ExpressionAttributeValues: {
            ":v1": {
                S: new Date(todayDate.toISOString()).toLocaleDateString('en-GB')
            }
        },
        IndexName: process.env.DDB_CREATED_DATE_INDEX_NAME,
        KeyConditionExpression: "createdDate = :v1",
        TableName: process.env.DDB_TABLE_NAME
    };

    console.log(params)

    const ddbQueryPromise = dynamodb.query(params).promise();
    return ddbQueryPromise
        .then((data) => {
            // console.log("Success: ", JSON.stringify(data, null, 4))
            const summarizedReport = getSummarizedReport(data)
            console.log("Success: ", JSON.stringify(summarizedReport, null, 4))
            return sendReportToSNS(summarizedReport)

        }).then((res) => {
            console.log(res)
        })
        .catch((err) => console.log(err))


}

exports.main = main

main()