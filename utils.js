/**
 * Calls a given function repeatedly until it returns true or at least max
 * times, with delay ms between invocations.
 */
var repeatUntil = function(callback, delay, maxTimes, attempts) {
  if(maxTimes === 0) { return; }
  if(!attempts) { attempts = 1; }

  try {
    if(callback(attempts) === true) {
      return;
    }
  } catch(e) {
    console.error(e);
  }

  setTimeout(function() { repeatUntil(callback, delay, maxTimes - 1, attempts + 1); }, delay);
};

exports.repeatUntil = repeatUntil;
