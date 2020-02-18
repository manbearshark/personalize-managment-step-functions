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

exports.describeDatasetGroup = async function ({datasetGroupArn}) {
    let params = {datasetGroupArn};
    return callApi(personalize.describeDatasetGroup.bind(personalize), params);
};

exports.createDataset = async function ({datasetGroupArn, datasetType, name, schemaArn}) {
    let params = {datasetGroupArn, datasetType, name, schemaArn};
    return callApi(personalize.createDataset.bind(personalize), params);
};

exports.deleteDataset = async function({datasetArn}) {
    let params = {datasetArn};
    return callApi(personalize.deleteDataset.bind(personalize), params);
};

exports.describeDataset = async function({datasetArn}) {
    let params = {datasetArn};
    try {
        let result = await callApi(personalize.describeDataset.bind(personalize), params);
        return result.dataset;
    } catch (e) {
        throw e;
    }
};

exports.createSchema = async function ({name, schema}) {
    let params = {name, schema};
    return callApi(personalize.createSchema.bind(personalize), params);
};

exports.describeSchema = async function ({schemaArn}) {
    let params = {schemaArn};
    return callApi(personalize.describeSchema.bind(personalize), params); 
};

exports.deleteSchema = async function ({schemaArn}) {
    let params = {schemaArn};
    return callApi(personalize.deleteSchema.bind(personalize), params); 
};

exports.createSolution = async function ({datasetGroupArn, name}) {
    let params = {datasetGroupArn, name};
    return callApi(personalize.createSolution.bind(personalize), params);
};

exports.describeSolution = async function ({solutionArn}) {
    let params = {solutionArn};
    return callApi(personalize.describeSolution.bind(personalize), params);
};

exports.deleteSolution = async function ({solutionArn}) {
    let params = {solutionArn};
    return callApi(personalize.deleteSolution.bind(personalize), params); 
};

exports.createDatasetImportJob = async function ({ dataSource, datasetArn, jobName, roleArn }) {
    let params = {dataSource, datasetArn, jobName, roleArn};
    return callApi(personalize.createDatasetImportJob.bind(personalize), params);
};

exports.describeDatasetImportJob = async function ({datasetImportJobArn}) {
    let params ={datasetImportJobArn};
    try {
        let result = await callApi(personalize.describeDatasetImportJob.bind(personalize), params);
        return result.datasetImportJob;
    } catch (e) {
        throw e;
    }
};