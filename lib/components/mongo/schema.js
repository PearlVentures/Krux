var mongoose = require('mongoose'),
  promise = require('bloody-promise');
/*
* This is a schema file that is used by mongo schemas to register themselvs to mongo.
* */
var schema = function MongoSchema(name, _collection, _DEBUG) {
  this.__name = name;
  this.collection_name = (_.isString(_collection) ? _collection : name);
  this.fields = {};
  this.methods = {};
  this.statics = {};
  this.indexes = [];
  this.virtuals = {};
  this.hasFields = false;
  this.__hasMany = {};  // schemaTarget:options has many (array of objectId)
  this.__belongsTo = {}// schemaTarget:options belongs to (objectId reference)
  this.__debug = _DEBUG;
};

/*
* Sets the collection's name.
* */
schema.prototype.collection = function SetCollection(name) {
  if(typeof name !== 'string' || !name) {
    throw new Error('Krux.mongo: failed to set collection name to ' + this.collection_name);
  }
  this.collection_name = name;
  return this;
};

/*
* Sets the schema's name
* */
schema.prototype.name = function SetName(name) {
  if(typeof name !== 'string' || !name) {
    throw new Error('Krux.mongo: failed to set schema name to ' + this.name);
  }
  this.__name = name;
  return this;
};

/*
* Registers a schema field.
* */
schema.prototype.field = function SetField(name, type, _opt) {
  if(!_.isString(name)) {
    throw new Error('Field name ' + name + ' is invalid.');
  }
  var opt = (typeof _opt === 'object' && _opt !== null ? _opt : {});
  if(typeof this.fields[name] !== 'undefined') {
    throw new Error('Field ' + name + ' already exists.');
  }
  this.fields[name] = {
    type: (_.isFunction(type) ? type() : type),
    defaultValue: null
  }
  if(typeof opt.defaultValue !== 'undefined') {
    this.fields[name].defaultValue = opt.defaultValue;
    delete opt.defaultValue;
  }
  this.hasFields = true;
  this.fields[name].options = opt;
  return this;
};

/*
* The hasMany relation is actuall a field with an [Schema.Types.ObjectId] type
* */
schema.prototype.hasMany = function HasMany(schemaName, _opt) {
  var opt = (_.isObject(_opt) ? _opt : {});
  var targetName;
  if(_.isString(opt['as'])) {
    targetName = opt['as'];
    delete opt['as'];
  } else {
    targetName = schemaName;
    var lastChar = targetName.charAt(targetName.length-1);
    if(lastChar !== 's') {
      if(lastChar in ['a','e','i','o','u','h']) {
        targetName += 's'
      }
      if(lastChar === 'y') {
        targetName += 's';
      }
      if(lastChar === 'h') {
        targetName += 'es';
      }
    }
  }
  opt['type'] = mongoose.Schema.Types.ObjectId;
  opt['ref'] = schemaName;
  this.__hasMany[targetName] = opt;
  return this;
};

/*
* The belongsTo relation is actual a field with Schema.Types.ObjectId type.
* */
schema.prototype.belongsTo = function BelongsTo(schemaName, _opt) {
  var opt = (_.isObject(_opt) ? _opt : {});
  opt['type'] = mongoose.Schema.Types.ObjectId;
  opt['ref'] = schemaName;
  this.__belongsTo[schemaName] = opt;
  return this;
};

/*
* Registers schema methods.
* */
schema.prototype.method = function RegisterMethod(name, callback) {
  this.methods[name] = callback;
  return this;
};

/*
* Registers schema static methods.
* */
schema.prototype.static = function RegisterStatig(name, callback) {
  this.statics[name] = callback;
  return this;
};

/*
* Registers a virtual data field.
* */
schema.prototype.data = function VirtualDataField(name, obj) {
  // TODO
  return this;
};

/*
* ToJSON override method.
* */
schema.prototype.json = function ToJsonOverride(cb) {
  // TODO
  return this;
};

/*
* Marks the given fields as indexes.
* */
schema.prototype.index = function SetIndexes() {
  _.forEach(arguments, function(idxName) {
    this.indexes.push(idxName);
  }.bind(this));
  return this;
};

/*
* Checks if the schema has an index.
* */
schema.prototype.isIndex = function IsFieldIndex(name) {
  return (this.indexes.indexOf(name) !== -1);
}

/*
* This is where we call mongoose.model().
* */
schema.prototype.toMongoose = function ToMongoose(mongoose) {
  var data = this.getSchema(),
    _schema = this;
  var schemaObj = mongoose.Schema(data);

  _.forEach(this.methods, function(cb, name) {
    schemaObj.methods[name] = cb;
  });
  _.forEach(this.statics, function(cb, name) {
    schemaObj.statics[name] = cb;
  });
  schemaObj.statics['build'] = function CreateInstance(data) {
    var bObj = new modelObj(data);
    var _save = bObj.save;
    bObj.save = function SaveInstance() {
      var thenCb = null,
        errCb = null;
      var chain = {
        then: function(cb) {
          thenCb = cb;
          return chain;
        },
        error: function(cb) {
          errCb = cb;
          return chain;
        }
      };
      if(_schema.__debug) {
        log.trace('Mongo save %s with: ', _schema.__name, JSON.stringify(this.toJSON()));
      }
      _save.call(this, function(err, res) {
        if(err) {
          if(typeof errCb !== 'function') {
            log.warn('No error() callback registered for save() %s while error occurred.', _schema.__name);
            log.debug(err);
            return;
          }
          return errCb(err);
        }
        if(typeof thenCb !== 'function') return;
        try {
          return thenCb(res);
        } catch(e) {
          log.warn('Encountered an error in then() callback while saving schema %s', _schema.__name);
          try {
            return errCb(e);
          } catch(cbE) {
            log.warn('Encountered an error in error() callback while saving schema %s', _schema.__name);
            log.debug(e);
            return;
          }
        }
      });
      return chain;
    };
    _schema.wrapJson(bObj);
    return bObj;
  };

  var modelObj = mongoose.model(this.__name, schemaObj, this.collection_name);
  // Promisify over the find() method
  var self = this,
    _find = modelObj.find,
    _findOne = modelObj.findOne;
  modelObj.find = function FindWithPromise(query) {
    var promiseObj = promise.create(function(resolve, reject) {
      if(typeof query !== 'object' || query === null) {
        return reject(new Error('Invalid mongodb query for ' + self.__name));
      }
      var queryArgs = [],
        queryCb = null;
      /* We have a find() */
      if(typeof query['where'] === 'object' && query['where'] !== null) {
        queryArgs.push(query.where);
        queryCb = _find;
      } else {
        queryCb = _findOne;
        queryArgs.push(query);
      }
      if(query['attributes'] instanceof Array) {
        queryArgs.push(query.attributes.join(' '));
      }
      queryArgs.push(function onResults(err, result) {
        if(err) {
          if(err.name === 'CastError') {
            return resolve(null);
          }
          return reject(err);
        }
        if(result !== null) {
          if(result instanceof Array) {
            for(var q=0; q < result.length; q++) {
              _schema.wrapJson(result[q]);
            }
          } else {
            _schema.wrapJson(result);
          }
        }
        return resolve(result);
      });
      if(_schema.__debug) {
        if(queryCb == _find) {
          log.trace('Mongo select `%s` where: %s', _schema.__name, JSON.stringify(query.where));
        } else {
          log.trace('Mongo find `%s` by: %s', _schema.__name, JSON.stringify(query));
        }
      }
      return queryCb.apply(this, queryArgs);
    }.bind(this));
    return promiseObj;
  };

  return modelObj;
};

/*
* Wraps the toJSON method over the given object, to remove _id and __v
* */
schema.prototype.wrapJson = function WrapJSON(obj) {
  var _json = obj.toJSON;
  obj.toJSON = function ToJsonWrapper() {
    var data = _json.call(this);
    if(typeof data['_id'] !== 'undefined') {
      data['id'] = data['_id'].toString();
      delete data['_id']
    }
    if(typeof data['__v'] !== 'undefined') {
      delete data['__v'];
    }
    return data;
  };
};


/*
* Returns the mongoose-parsed schema.
* */
schema.prototype.getSchema = function GetSchema() {
  var d = {};
  _.forEach(this.fields, function(data, name) {
    var mongoOpt = {
      type: data.type,
      default: data.defaultValue
    };
    if(typeof data.type === 'object' && data.type !== null) {
      mongoOpt = data.type;
    }
    if(this.isIndex(name)) {
      mongoOpt['index'] = true;
    }
    d[name] = mongoOpt;
  }.bind(this));
  /* We set our HasMany relationships */
  _.forEach(this.__hasMany, function(data, name) {
    d[name] = [data];
  });
  /* We set our BelongsTo relationship */
  _.forEach(this.__belongsTo, function(data, name) {
    d[name] = data;
  });
  return d;
};

module.exports = schema;