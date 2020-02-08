const AWS = require('aws-sdk');
const personalize = new AWS.Personalize();

const callApi = function (fn, params) {
    return new Promise(function(resolve, reject) {
        fn(params, function(err, data) {
            if(err != null) reject(err);
            else resolve(data);
        });
    });
};

exports.createDatasetGroup = async function ({name}) {
    let params = { name };
    return callApi(personalize.createDatasetGroup.bind(personalize), params);
};

exports.deleteDatasetGroup = async function ({ datasetGroupArn }) {
    let params = { datasetGroupArn };
    return callApi(personalize.deleteDatasetGroup.bind(personalize), params);
};

exports.createDataset = async function ({datasetGroupArn, datasetType, name, schemaArn}) {
    let params = {datasetGroupArn, datasetType, name, schemaArn};
    return callApi(personalize.createDataset.bind(personalize), params);
};

exports.describeDatasetGroup = async function ({datasetGroupArn}) {
    let params = {datasetGroupArn};
    return callApi(personalize.describeDatasetGroup.bind(personalize), params);
};

exports.createSchema = async function ({name, schema}) {
    let params = {name, schema};
    return callApi(personalize.createSchema.bind(personalize), params);
};