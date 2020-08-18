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

exports.createSolution = async function (params) {
    return callApi(personalize.createSolution.bind(personalize), { ...params });
};

exports.deleteSolution = async function ({solutionArn}) {
    let params = {solutionArn};
    return callApi(personalize.deleteSolution.bind(personalize), params); 
};

exports.describeSolution = async function (params) {
    try {
        let result = await callApi(personalize.describeSolution.bind(personalize), { ...params });
        return result.solution;
    } catch (e) {
        throw e;
    }
};

exports.listSolutions = async function (params) {
    return callApi(personalize.listSolutions.bind(personalize), { ...params });
}

exports.describeSolutionVersion = async function ({solutionVersionArn}) {
    let params = {solutionVersionArn}
    try {
        let result = await callApi(personalize.describeSolutionVersion.bind(personalize), { ...params });
        return result.solutionVersion;
    } catch (e) {
        throw e;
    }
};

exports.createSolutionVersion = async function (params) {
    return callApi(personalize.createSolutionVersion.bind(personalize), { ...params });
}

exports.createDatasetImportJob = async function ({ dataSource, datasetArn, jobName, roleArn }) {
    let params = {dataSource, datasetArn, jobName, roleArn};
    return callApi(personalize.createDatasetImportJob.bind(personalize), params);
};

exports.describeDatasetImportJob = async function ({datasetImportJobArn}) {
    let params = {datasetImportJobArn};
    try {
        let result = await callApi(personalize.describeDatasetImportJob.bind(personalize), params);
        return result.datasetImportJob;
    } catch (e) {
        throw e;
    }
};

exports.createCampaign = async function (params) {
    return callApi(personalize.createCampaign.bind(personalize), params);
}

exports.deleteCampaign = async function (params) {
    return callApi(personalize.deleteCampaign.bind(personalize), params);
}

exports.updateCampaign = async function (params) {
    return callApi(personalize.updateCampaign.bind(personalize), params);
}

exports.describeCampaign = async function ({campaignArn}) {
    let params = {campaignArn};
    try {
        let result = await callApi(personalize.describeCampaign.bind(personalize), params);
        return result.campaign;
    } catch (e) {
        throw e;
    }
}

exports.listEventTrackers = async function (params) {
    return callApi(personalize.listEventTrackers.bind(personalize), params);
}

exports.createEventTracker = async function (params) {
    return callApi(personalize.createEventTracker.bind(personalize), params);
}

exports.deleteEventTracker = async function (params) {
    return callApi(personalize.deleteEventTracker.bind(personalize), params);
}

exports.describeEventTracker = async function ({eventTrackerArn}) {
    let params = {eventTrackerArn};
    try {
        let result = await callApi(personalize.describeEventTracker.bind(personalize), params);
        return result.eventTracker;
    } catch (e) {
        throw e;
    }
}

exports.listCampaigns = async function (params) {
    return callApi(personalize.listCampaigns.bind(personalize), params);
}

exports.deleteCampaign = async function (params) {
    return callApi(personalize.deleteCampaign.bind(personalize), params);
}

exports.listDatasets = async function (params) {
    return callApi(personalize.listDatasets.bind(personalize), params);
}

exports.deleteDataset = async function (params) {
    return callApi(personalize.deleteDataset.bind(personalize), params);
}