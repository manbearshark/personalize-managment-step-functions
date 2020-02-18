const personalize = require('./personalize-async');

exports.handler = async function(event, context) {
  //context.callbackWaitsForEmptyEventLoop = false;

  // Pass in:
  //
  // {
  //    action: { verb: [one of the personalize functions], 
  //    params: [valid params for the function] },
  //    ...
  // }

  try {
    console.log(event);
    if(event.action.verb === "noop") {
      return { };
    } else if(!(event.action.verb in personalize)) {
      throw new TypeError("Unsupported action specified: " + event.action.verb);
    }

    let result = await personalize[event.action.verb](event.action.params);
    let merge = { ...result };
    console.log("Result: ", merge);
    return merge;
  } catch (e) {
      console.log("ERROR: ", e);
      // Check if this is a case of the resource already existing
      if(e.code && e.code === 'ResourceAlreadyExistsException') {
        throw new Error("Resource Exists");
      }
      throw e;
  }
}