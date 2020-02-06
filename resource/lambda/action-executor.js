const AWS = require('aws-sdk');

exports.handler = async function(event, context, callback) {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    let countInput = event.count;
    let result = { count: countInput + 1 } 
    callback(null, result);
  } catch (e) {
      console.log("ERROR: ", e.message());
  }
}