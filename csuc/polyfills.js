// Globals the AWS SDK expects that React Native / Hermes doesn't provide.
// This file must be imported before anything else in index.js.

// TextEncoder / TextDecoder
import 'fast-text-encoding';

// crypto.getRandomValues
import 'react-native-get-random-values';

// React Native's Blob has no arrayBuffer(); the AWS SDK uses it to read
// HTTP response bodies.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
