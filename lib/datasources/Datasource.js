/*! @license ©2014 Ruben Verborgh - Multimedia Lab / iMinds / Ghent University */

/** A Datasource provides base functionality for queryable access to a source of triples. */

var fs = require('fs'),
    _ = require('lodash'),
    Readable = require('stream').Readable;

// Creates a new Datasource
function Datasource(options) {
  if (!(this instanceof Datasource))
    return new Datasource();
  options = options || {};
  this._request = options.request || require('request');
  this._blankNodePrefix = options.blankNodePrefix || 'genid:';
  this._blankNodePrefixLength = this._blankNodePrefix.length;
}

// Makes Datasource the prototype of the given class
Datasource.extend = function extend(child, supportedFeatureList) {
  child.prototype = new this();
  child.extend = extend;

  // Expose the supported query features
  if (supportedFeatureList && supportedFeatureList.length) {
    var supportedFeatures = {};
    for (var i = 0; i < supportedFeatureList.length; i++)
      supportedFeatures[supportedFeatureList[i]] = true;
    Object.defineProperty(child.prototype, 'supportedFeatures', {
      enumerable: true,
      value: Object.freeze(supportedFeatures),
    });
  }
};

// The query features supported by this data source
Object.defineProperty(Datasource.prototype, 'supportedFeatures', {
  enumerable: true,
  value: Object.freeze({}),
});

// Checks whether the data source can evaluate the given query
Datasource.prototype.supportsQuery = function (query) {
  // A query is supported if the data source supports all of its features
  var features = query.features, supportedFeatures = this.supportedFeatures, feature;
  if (features) {
    for (feature in features)
      if (features[feature] && !supportedFeatures[feature])
        return false;
    return true;
  }
  // A query without features is supported if this data source has at least one feature
  else {
    for (feature in supportedFeatures)
      if (supportedFeatures[feature])
        return true;
    return false;
  }
};

// Selects the triples that match the given query, returning a triple stream
Datasource.prototype.select = function (query, onError) {
  if (!this.supportsQuery(query))
    return onError && onError(new Error('The datasource does not support the given query'));

  // Translate blank nodes IRIs in the query to blank nodes
  var blankNodePrefix = this._blankNodePrefix, blankNodePrefixLength = this._blankNodePrefixLength;
  if (query.subject && query.subject.indexOf(blankNodePrefix) === 0)
    (query = _.clone(query)).subject = '_:' + query.subject.substr(blankNodePrefixLength);
  if (query.object  && query.object.indexOf(blankNodePrefix) === 0)
    (query = _.clone(query)).object  = '_:' + query.object.substr(blankNodePrefixLength);

  // Create the triple stream and execute the query
  var tripleStream = new Readable({ objectMode: true });
  tripleStream._read = noop;
  tripleStream._push = tripleStream.push;
  tripleStream.push = function (triple) {
    // Translate blank nodes to IRIs
    if (triple) {
      if (triple.subject[0] === '_') triple.subject = blankNodePrefix + triple.subject.substr(2);
      if (triple.object[0]  === '_') triple.object  = blankNodePrefix + triple.object.substr(2);
    }
    this._push(triple);
  };
  onError && tripleStream.on('error', onError);
  this._executeQuery(query, tripleStream, function (metadata) {
    setImmediate(function () { tripleStream.emit('metadata', metadata); });
  });
  return tripleStream;
};

// Writes the results of the query to the given triple stream
Datasource.prototype._executeQuery = function (query, tripleStream, metadataCallback) {
  throw new Error('_executeQuery has not been implemented');
};

// Gets mementos for this data
Datasource.prototype.getMementoMap = function () {
  //throw new Error('getMementoMap has not been implemented');
  return {};
};

// Retrieves a stream through HTTP or the local file system
Datasource.prototype._fetch = function (options) {
  var stream, url = options.url, protocolMatch = /^([a-z]+):\/\//.exec(url);
  switch (protocolMatch ? protocolMatch[1] : '') {
  // Fetch a representation through HTTP(S)
  case 'http':
  case 'https':
    stream = this._request(options);
    stream.on('response', function (response) {
      if (response.statusCode >= 300)
        setImmediate(function () {
          stream.emit('error', new Error(url + ' returned ' + response.statusCode));
        });
    });
    break;
  // Read a file from the local filesystem
  case 'file':
    stream = fs.createReadStream(url.substr(protocolMatch[0].length), { encoding: 'utf8' });
    break;
  default:
    throw new Error('Unknown protocol: ' + url);
  }
  return stream;
};

// Closes the data source, freeing possible resources used
Datasource.prototype.close = function (callback) {
  callback && callback();
};

// The empty function
function noop() {}

module.exports = Datasource;
