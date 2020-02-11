const personalize = require('./personalize-async');

exports.handler = async function(event, context, callback) {
  context.callbackWaitsForEmptyEventLoop = false;

  // Pass in:
  //
  // {
  //    action: { verb: [one of the personalize functions], params: [valid params for the function] },
  //    ...
  // }

  try {
    console.log(event);
    if(!(event.action.verb in personalize)) {
        callback("Unsupported action specified: ", event.action.verb);
    }

    let result = await personalize[event.action.verb](event.action.params);
    let merge = { ...event };
    merge.action.result = { ...result };
    console.log("Result: ", merge);
    callback(null, merge);
  } catch (e) {
      console.log("ERROR: ", e);
      // Check if this is a case of the resource already existing
      if(e.code && e.code === 'ResourceAlreadyExistsException') {
        callback("Resource Exists");
      }
  }
}