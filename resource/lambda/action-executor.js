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
    callback(null, { action: { ...result } });
  } catch (e) {
      console.log("ERROR: ", e);
  }
}