import _ from 'lodash'

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

    _.forEach(object, (value, key) => {
      // Ignore type attribute
      if (key === 'type') { return }

      // Match relationship base on key
      if (key.endsWith('Id')) {
        let relationshipKey = _.trimEnd(key, 'Id')
        let type = _.snakeCase(relationshipKey)
        data.relationships[relationshipKey] = { data: { id: value, type: type } }
        return
      }

      // Match relationship base on key & value
      if (key.endsWith('Ids') && _.isArray(value)) {
        let relationshipKey = _.trimEnd(key, 'Ids')
        let type = _.snakeCase(relationshipKey)
        let rioArray = []

        _.forEach(value, item => {
          // If item is an object we assume there is an id attribute
          if (_.isPlainObject(item)) {
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
      if (_.isArray(value) && _.isPlainObject(value[0])) {
        let type = _.snakeCase(key)
        let rioArray = []

        _.forEach(value, item => {
          let resourceIdentifierObject = { id: item.id, type: item.type }
          resourceIdentifierObject.type = resourceIdentifierObject.type || type
          rioArray.push(resourceIdentifierObject)
        })

        data.relationships[key] = { data: rioArray }
        return
      }

      // Match relationship base on value
      if (_.isPlainObject(value) && value.id) {
        let type = _.snakeCase(key)
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
    if (_.isArray(data)) {
      return this._deserializeArrayData(data, included)
    }

    return this._deserializeResourceData(data, included)
  },

  deserializeErrors (errors) {
    let errorObjects = { }

    _.forEach(errors, item => {
      let pointerArray = _.split(item.source.pointer, '/')
      let index = 3
      if (pointerArray.length === 3) { index = 2 }
      errorObjects[pointerArray[index]] = errorObjects[pointerArray[index]] || []
      errorObjects[pointerArray[index]].push({ code: item.code, title: item.title })
    })

    return errorObjects
  },

  _deserializeArrayData (data, included = {}) {
    let objectArray = []
    _.forEach(data, resourceObject => {
      let object = this._deserializeResourceData(resourceObject, included)
      objectArray.push(object)
    })

    return objectArray
  },

  _deserializeResourceData (data, included = {}, deserializationTree = []) {
    let object = {}
    object.id = data.id
    object.type = data.type
    let newTree = _.concat(deserializationTree, { type: data.type, id: object.id })

    if (data.attributes) {
      _.forEach(data.attributes, (value, name) => {
        object[name] = value
      })
    }

    if (data.relationships) {
      _.forEach(data.relationships, (value, name) => {
        if (_.isArray(value.data)) {
          object[name] = []

          _.forEach(value.data, rio => {
            let relationshipData = _.find(included, { type: rio.type, id: rio.id })
            if (relationshipData) {
              let relationshipObject = this._deserializeResourceData(relationshipData, included, newTree)
              object[name].push(relationshipObject)
            }
          })
        }

        if (_.isPlainObject(value.data)) {
          if (_.find(deserializationTree, { type: value.data.type, id: value.data.id })) {
            object[name] = value.data
          } else {
            let rio = value.data
            let relationshipData = _.find(included, { type: rio.type, id: rio.id })
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
  }
}
