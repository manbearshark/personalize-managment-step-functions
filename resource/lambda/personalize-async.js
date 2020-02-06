const AWS = require('aws-sdk');
const personalize = new AWS.Personalize();

function callAPI(fn, params) {
    return new Promise(function(resolve, reject) {
        fn(params, function(err, data) {
            if(err != null) reject(err);
            else resolve(data);
        });
    });
}

export async function createDatasetGroup({name, kmsArn, roleArn}) {
    let params = { name, kmsArn, roleArn };
    return callAPI(personalize.describeDatasetGroup, params);
}

export async function createDataset({datasetGroupArn, datasetType, name, schemaArn}) {
    let params = {datasetGroupArn, datasetType, name, schemaArn};
    return callApi(personalize.createDataset, params);
}

export async function describeDatasetGroup({datasetGroupArn}) {
    let params = {datasetGroupArn};
    return callApi(personalize.describeDatasetGroup, params);
}

export async function createSchema({name, schema}) {
    let params = {name, schema};
    return callApi(personalize.createSchema, params);
}