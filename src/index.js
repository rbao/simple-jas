export default {
  serialize (dataObject, other = {}) {
    return Object.assign({}, { data: this.serializeData(dataObject) }, other)
  },

  serializeData (object) {
    let data = {
      type: object.type,
      attributes: {},
      relationships: {}
    }

    if (object.id) {
      data.id = object.id
    }

    Object.keys(object).forEach(key => {
      let value = object[key]

      // Ignore type attribute
      if (key === 'type') { return }

      // Match relationship base on key
      if (_endsWith(key, 'Id')) {
        let relationshipKey = key.slice(0, -2)
        let type = relationshipKey
        data.relationships[relationshipKey] = { data: { id: value, type: type } }
        return
      }

      // Match relationship base on key & value
      if (_endsWith(key, 'Ids') && Array.isArray(value)) {
        let relationshipKey = key.slice(0, -3)
        let type = relationshipKey
        let rioArray = []

        value.forEach(item => {
          // If item is an object we assume there is an id attribute
          if (this._isObject(item)) {
            let resourceIdentifierObject = { id: item.id, type: item.type }
            resourceIdentifierObject.type = resourceIdentifierObject.type || type
            rioArray.push(resourceIdentifierObject)
          // If item is not an object we assume it is an id
          } else {
            rioArray.push({ id: item, type: type })
          }
        })

        data.relationships[relationshipKey] = { data: rioArray }
        return
      }

      // Match relationship base on value
      if (Array.isArray(value) && this._isObject(value[0])) {
        let type = key
        let rioArray = []

        value.forEach(item => {
          let resourceIdentifierObject = { id: item.id, type: item.type }
          resourceIdentifierObject.type = resourceIdentifierObject.type || type
          rioArray.push(resourceIdentifierObject)
        })

        data.relationships[key] = { data: rioArray }
        return
      }

      // Match relationship base on value
      if (this._isObject(value) && value.id) {
        let type = key
        let rio = { id: value.id, type: value.type }

        rio.type = rio.type || type
        data.relationships[key] = { data: rio }
        return
      }

      // Match attributes
      data.attributes[key] = value
    })

    return data
  },

  deserialize (payload) {
    let deserializedData = this.deserializeData(payload.data, payload.included || [])
    if (!payload.meta) {
      return { data: deserializedData }
    }

    return { data: deserializedData, meta: payload.meta }
  },

  deserializeData (data, included = []) {
    if (Array.isArray(data)) {
      return this._deserializeArrayData(data, included)
    }

    return this._deserializeResourceData(data, included)
  },

  deserializeErrors (errors) {
    let errorObjects = { }

    errors.forEach(item => {
      let pointerArray = item.source.pointer.split('/')
      let index = 3
      if (pointerArray.length === 3) { index = 2 }
      errorObjects[pointerArray[index]] = errorObjects[pointerArray[index]] || []
      errorObjects[pointerArray[index]].push({ code: item.code, title: item.title })
    })

    return errorObjects
  },

  _deserializeArrayData (data, included = {}) {
    let objectArray = []
    data.forEach(resourceObject => {
      let object = this._deserializeResourceData(resourceObject, included)
      objectArray.push(object)
    })

    return objectArray
  },

  _deserializeResourceData (data, included = {}, deserializationTree = []) {
    let object = {}
    object.id = data.id
    object.type = data.type
    let newTree = deserializationTree.concat([{ type: data.type, id: object.id }])

    if (data.attributes) {
      Object.keys(data.attributes).forEach(name => {
        object[name] = data.attributes[name]
      })
    }

    if (data.relationships) {
      Object.keys(data.relationships).forEach(name => {
        let value = data.relationships[name]

        if (Array.isArray(value.data)) {
          object[name] = []

          value.data.forEach(rio => {
            let relationshipData = this._find(included, { type: rio.type, id: rio.id })
            if (relationshipData) {
              let relationshipObject = this._deserializeResourceData(relationshipData, included, newTree)
              object[name].push(relationshipObject)
            }
          })
        }

        if (this._isObject(value.data)) {
          if (this._find(deserializationTree, { type: value.data.type, id: value.data.id })) {
            object[name] = value.data
          } else {
            let rio = value.data
            let relationshipData = this._find(included, { type: rio.type, id: rio.id })
            if (relationshipData) {
              object[name] = this._deserializeResourceData(relationshipData, included, newTree)
            } else {
              object[name] = rio
            }
          }
        }

        if (value.data === null) {
          object[name] = null
        }
      })
    }

    return object
  },

  _find (collection, target) {
    for (var i = 0; i < collection.length; i++) {
      if (collection[i].id === target.id && collection[i].type === target.type) {
        return collection[i]
      }
    }
  },

  _isObject (target) {
    return target && !Array.isArray(target) && typeof target === 'object'
  },

  _endsWith(str, search) {
    if (!String.prototype.endsWith) {
      return str.substring(str.length - search.length, str.length) === search;
    }

    return str.endsWith(search)
  }
}
