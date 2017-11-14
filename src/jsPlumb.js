/*
 * jsPlumb
 * 
 * Title:jsPlumb 2.3.0
 * 
 * Provides a way to visually connect elements on an HTML page, using SVG.
 * 
 * This file contains the core code.
 *
 * Copyright (c) 2010 - 2017 jsPlumb (hello@jsplumbtoolkit.com)
 * 
 * http://jsplumbtoolkit.com
 * http://github.com/sporritt/jsplumb
 * 
 * Dual licensed under the MIT and GPL2 licenses.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([
      "./util", "./jsPlumbInstance"
    ], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    factory();
  }
}(this, function (jsPlumbUtil, jsPlumbInstance) {

  "use strict";

  var root = typeof window !== 'undefined' ? window : this;

  var _ju = root.jsPlumbUtil;

  /**
   * creates a timestamp, using milliseconds since 1970, but as a string.
   */

  var _timestamp = function () {
      return "" + (new Date()).getTime();
    },

    // helper method to update the hover style whenever it, or paintStyle, changes.
    // we use paintStyle as the foundation and merge hoverPaintStyle over the
    // top.
    _updateHoverStyle = function (component) {
      if (component._jsPlumb.paintStyle && component._jsPlumb.hoverPaintStyle) {
        var mergedHoverStyle = {};
        jsPlumb.extend(mergedHoverStyle, component._jsPlumb.paintStyle);
        jsPlumb.extend(mergedHoverStyle, component._jsPlumb.hoverPaintStyle);
        delete component._jsPlumb.hoverPaintStyle;
        // we want the fill of paintStyle to override a gradient, if possible.
        if (mergedHoverStyle.gradient && component._jsPlumb.paintStyle.fill) {
          delete mergedHoverStyle.gradient;
        }
        component._jsPlumb.hoverPaintStyle = mergedHoverStyle;
      }
    },
    _updateAttachedElements = function (component, state, timestamp, sourceElement) {
      var affectedElements = component.getAttachedElements();
      if (affectedElements) {
        for (var i = 0, j = affectedElements.length; i < j; i++) {
          if (!sourceElement || sourceElement !== affectedElements[i]) {
            affectedElements[i].setHover(state, true, timestamp);			// tell the attached elements not to inform their own attached elements.
          }
        }
      }
    },
    _splitType = function (t) {
      return t == null ? null : t.split(" ");
    },
    _mapType = function(map, obj, typeId) {
      for (var i in obj) {
        map[i] = typeId;
      }
    },
    _applyTypes = function (component, params, doNotRepaint) {
      if (component.getDefaultType) {
        var td = component.getTypeDescriptor(), map = {};
        var defType = component.getDefaultType();
        var o = _ju.merge({}, defType);
        _mapType(map, defType, "__default");
        for (var i = 0, j = component._jsPlumb.types.length; i < j; i++) {
          var tid = component._jsPlumb.types[i];
          if (tid !== "__default") {
            var _t = component._jsPlumb.instance.getType(tid, td);
            if (_t != null) {
              o = _ju.merge(o, _t, [ "cssClass" ]);
              _mapType(map, _t, tid);
            }
          }
        }

        if (params) {
          o = _ju.populate(o, params, "_");
        }

        component.applyType(o, doNotRepaint, map);
        if (!doNotRepaint) {
          component.repaint();
        }
      }
    },

// ------------------------------ BEGIN jsPlumbUIComponent --------------------------------------------

    jsPlumbUIComponent = root.jsPlumbUIComponent = function (params) {

      _ju.EventGenerator.apply(this, arguments);

      var self = this,
        a = arguments,
        idPrefix = self.idPrefix,
        id = idPrefix + (new Date()).getTime();

      this._jsPlumb = {
        instance: params._jsPlumb,
        parameters: params.parameters || {},
        paintStyle: null,
        hoverPaintStyle: null,
        paintStyleInUse: null,
        hover: false,
        beforeDetach: params.beforeDetach,
        beforeDrop: params.beforeDrop,
        overlayPlacements: [],
        hoverClass: params.hoverClass || params._jsPlumb.Defaults.HoverClass,
        types: [],
        typeCache:{}
      };

      this.cacheTypeItem = function(key, item, typeId) {
        this._jsPlumb.typeCache[typeId] = this._jsPlumb.typeCache[typeId] || {};
        this._jsPlumb.typeCache[typeId][key] = item;
      };
      this.getCachedTypeItem = function(key, typeId) {
        return this._jsPlumb.typeCache[typeId] ? this._jsPlumb.typeCache[typeId][key] : null;
      };

      this.getId = function () {
        return id;
      };

// ----------------------------- default type --------------------------------------------


      var o = params.overlays || [], oo = {};
      if (this.defaultOverlayKeys) {
        for (var i = 0; i < this.defaultOverlayKeys.length; i++) {
          Array.prototype.push.apply(o, this._jsPlumb.instance.Defaults[this.defaultOverlayKeys[i]] || []);
        }

        for (i = 0; i < o.length; i++) {
          // if a string, convert to object representation so that we can store the typeid on it.
          // also assign an id.
          var fo = jsPlumb.convertToFullOverlaySpec(o[i]);
          oo[fo[1].id] = fo;
        }
      }

      var _defaultType = {
        overlays:oo,
        parameters: params.parameters || {},
        scope: params.scope || this._jsPlumb.instance.getDefaultScope()
      };
      this.getDefaultType = function() {
        return _defaultType;
      };
      this.appendToDefaultType = function(obj) {
        for (var i in obj) {
          _defaultType[i] = obj[i];
        }
      };

// ----------------------------- end default type --------------------------------------------

      // all components can generate events

      if (params.events) {
        for (var evtName in params.events) {
          self.bind(evtName, params.events[evtName]);
        }
      }

      // all components get this clone function.
      // TODO issue 116 showed a problem with this - it seems 'a' that is in
      // the clone function's scope is shared by all invocations of it, the classic
      // JS closure problem.  for now, jsPlumb does a version of this inline where
      // it used to call clone.  but it would be nice to find some time to look
      // further at this.
      this.clone = function () {
        var o = Object.create(this.constructor.prototype);
        this.constructor.apply(o, a);
        return o;
      }.bind(this);

      // user can supply a beforeDetach callback, which will be executed before a detach
      // is performed; returning false prevents the detach.
      this.isDetachAllowed = function (connection) {
        var r = true;
        if (this._jsPlumb.beforeDetach) {
          try {
            r = this._jsPlumb.beforeDetach(connection);
          }
          catch (e) {
            _ju.log("jsPlumb: beforeDetach callback failed", e);
          }
        }
        return r;
      };

      // user can supply a beforeDrop callback, which will be executed before a dropped
      // connection is confirmed. user can return false to reject connection.
      this.isDropAllowed = function (sourceId, targetId, scope, connection, dropEndpoint, source, target) {
        var r = this._jsPlumb.instance.checkCondition("beforeDrop", {
          sourceId: sourceId,
          targetId: targetId,
          scope: scope,
          connection: connection,
          dropEndpoint: dropEndpoint,
          source: source, target: target
        });
        if (this._jsPlumb.beforeDrop) {
          try {
            r = this._jsPlumb.beforeDrop({
              sourceId: sourceId,
              targetId: targetId,
              scope: scope,
              connection: connection,
              dropEndpoint: dropEndpoint,
              source: source, target: target
            });
          }
          catch (e) {
            _ju.log("jsPlumb: beforeDrop callback failed", e);
          }
        }
        return r;
      };

      var domListeners = [];

      // sets the component associated with listener events. for instance, an overlay delegates
      // its events back to a connector. but if the connector is swapped on the underlying connection,
      // then this component must be changed. This is called by setConnector in the Connection class.
      this.setListenerComponent = function (c) {
        for (var i = 0; i < domListeners.length; i++) {
          domListeners[i][3] = c;
        }
      };


    };

  var _removeTypeCssHelper = function (component, typeIndex) {
    var typeId = component._jsPlumb.types[typeIndex],
      type = component._jsPlumb.instance.getType(typeId, component.getTypeDescriptor());

    if (type != null && type.cssClass && component.canvas) {
      component._jsPlumb.instance.removeClass(component.canvas, type.cssClass);
    }
  };

  _ju.extend(root.jsPlumbUIComponent, _ju.EventGenerator, {

    getParameter: function (name) {
      return this._jsPlumb.parameters[name];
    },

    setParameter: function (name, value) {
      this._jsPlumb.parameters[name] = value;
    },

    getParameters: function () {
      return this._jsPlumb.parameters;
    },

    setParameters: function (p) {
      this._jsPlumb.parameters = p;
    },

    getClass:function() {
      return jsPlumb.getClass(this.canvas);
    },

    hasClass:function(clazz) {
      return jsPlumb.hasClass(this.canvas, clazz);
    },

    addClass: function (clazz) {
      jsPlumb.addClass(this.canvas, clazz);
    },

    removeClass: function (clazz) {
      jsPlumb.removeClass(this.canvas, clazz);
    },

    updateClasses: function (classesToAdd, classesToRemove) {
      jsPlumb.updateClasses(this.canvas, classesToAdd, classesToRemove);
    },

    setType: function (typeId, params, doNotRepaint) {
      this.clearTypes();
      this._jsPlumb.types = _splitType(typeId) || [];
      _applyTypes(this, params, doNotRepaint);
    },

    getType: function () {
      return this._jsPlumb.types;
    },

    reapplyTypes: function (params, doNotRepaint) {
      _applyTypes(this, params, doNotRepaint);
    },

    hasType: function (typeId) {
      return this._jsPlumb.types.indexOf(typeId) !== -1;
    },

    addType: function (typeId, params, doNotRepaint) {
      var t = _splitType(typeId), _cont = false;
      if (t != null) {
        for (var i = 0, j = t.length; i < j; i++) {
          if (!this.hasType(t[i])) {
            this._jsPlumb.types.push(t[i]);
            _cont = true;
          }
        }
        if (_cont) {
          _applyTypes(this, params, doNotRepaint);
        }
      }
    },

    removeType: function (typeId, params, doNotRepaint) {
      var t = _splitType(typeId), _cont = false, _one = function (tt) {
        var idx = this._jsPlumb.types.indexOf(tt);
        if (idx !== -1) {
          // remove css class if necessary
          _removeTypeCssHelper(this, idx);
          this._jsPlumb.types.splice(idx, 1);
          return true;
        }
        return false;
      }.bind(this);

      if (t != null) {
        for (var i = 0, j = t.length; i < j; i++) {
          _cont = _one(t[i]) || _cont;
        }
        if (_cont) {
          _applyTypes(this, params, doNotRepaint);
        }
      }
    },
    clearTypes: function (params, doNotRepaint) {
      var i = this._jsPlumb.types.length;
      for (var j = 0; j < i; j++) {
        _removeTypeCssHelper(this, 0);
        this._jsPlumb.types.splice(0, 1);
      }
      _applyTypes(this, params, doNotRepaint);
    },

    toggleType: function (typeId, params, doNotRepaint) {
      var t = _splitType(typeId);
      if (t != null) {
        for (var i = 0, j = t.length; i < j; i++) {
          var idx = this._jsPlumb.types.indexOf(t[i]);
          if (idx !== -1) {
            _removeTypeCssHelper(this, idx);
            this._jsPlumb.types.splice(idx, 1);
          }
          else {
            this._jsPlumb.types.push(t[i]);
          }
        }

        _applyTypes(this, params, doNotRepaint);
      }
    },
    applyType: function (t, doNotRepaint) {
      this.setPaintStyle(t.paintStyle, doNotRepaint);
      this.setHoverPaintStyle(t.hoverPaintStyle, doNotRepaint);
      if (t.parameters) {
        for (var i in t.parameters) {
          this.setParameter(i, t.parameters[i]);
        }
      }
      this._jsPlumb.paintStyleInUse = this.getPaintStyle();
    },
    setPaintStyle: function (style, doNotRepaint) {
      // this._jsPlumb.paintStyle = jsPlumb.extend({}, style);
      // TODO figure out if we want components to clone paintStyle so as not to share it.
      this._jsPlumb.paintStyle = style;
      this._jsPlumb.paintStyleInUse = this._jsPlumb.paintStyle;
      _updateHoverStyle(this);
      if (!doNotRepaint) {
        this.repaint();
      }
    },
    getPaintStyle: function () {
      return this._jsPlumb.paintStyle;
    },
    setHoverPaintStyle: function (style, doNotRepaint) {
      //this._jsPlumb.hoverPaintStyle = jsPlumb.extend({}, style);
      // TODO figure out if we want components to clone paintStyle so as not to share it.
      this._jsPlumb.hoverPaintStyle = style;
      _updateHoverStyle(this);
      if (!doNotRepaint) {
        this.repaint();
      }
    },
    getHoverPaintStyle: function () {
      return this._jsPlumb.hoverPaintStyle;
    },
    destroy: function (force) {
      if (force || this.typeId == null) {
        this.cleanupListeners(); // this is on EventGenerator
        this.clone = null;
        this._jsPlumb = null;
      }
    },

    isHover: function () {
      return this._jsPlumb.hover;
    },

    setHover: function (hover, ignoreAttachedElements, timestamp) {
      // while dragging, we ignore these events.  this keeps the UI from flashing and
      // swishing and whatevering.
      if (this._jsPlumb && !this._jsPlumb.instance.currentlyDragging && !this._jsPlumb.instance.isHoverSuspended()) {

        this._jsPlumb.hover = hover;
        var method = hover ? "addClass" : "removeClass";

        if (this.canvas != null) {
          if (this._jsPlumb.instance.hoverClass != null) {
            this._jsPlumb.instance[method](this.canvas, this._jsPlumb.instance.hoverClass);
          }
          if (this._jsPlumb.hoverClass != null) {
            this._jsPlumb.instance[method](this.canvas, this._jsPlumb.hoverClass);
          }
        }
        if (this._jsPlumb.hoverPaintStyle != null) {
          this._jsPlumb.paintStyleInUse = hover ? this._jsPlumb.hoverPaintStyle : this._jsPlumb.paintStyle;
          if (!this._jsPlumb.instance.isSuspendDrawing()) {
            timestamp = timestamp || _timestamp();
            this.repaint({timestamp: timestamp, recalc: false});
          }
        }
        // get the list of other affected elements, if supported by this component.
        // for a connection, its the endpoints.  for an endpoint, its the connections! surprise.
        if (this.getAttachedElements && !ignoreAttachedElements) {
          _updateAttachedElements(this, hover, _timestamp(), this);
        }
      }
    }
  });

// ------------------------------ END jsPlumbUIComponent --------------------------------------------


// --------------------- static instance + module registration -------------------------------------------

// create static instance and assign to window if window exists.	
  var jsPlumb = new jsPlumbInstance();
  // register on 'root' (lets us run on server or browser)
  root.jsPlumb = jsPlumb;
  // add 'getInstance' method to static instance
  jsPlumb.getInstance = function (_defaults, overrideFns) {
    var j = new jsPlumbInstance(_defaults);
    if (overrideFns) {
      for (var ovf in overrideFns) {
        j[ovf] = overrideFns[ovf];
      }
    }
    j.init();
    return j;
  };
  jsPlumb.each = function (spec, fn) {
    if (spec == null) {
      return;
    }
    if (typeof spec === "string") {
      fn(jsPlumb.getElement(spec));
    }
    else if (spec.length != null) {
      for (var i = 0; i < spec.length; i++) {
        fn(jsPlumb.getElement(spec[i]));
      }
    }
    else {
      fn(spec);
    } // assume it's an element.
  };

  if (typeof define === 'function' && define.amd) {
    /*"esri/core/libs/jsplumb/connection",
      "esri/core/libs/jsplumb/connectors-straight", */
    require({}, [
      "esri/core/libs/jsplumb/anchors", "esri/core/libs/jsplumb/base-library-adapter",
      "esri/core/libs/jsplumb/browser-util", "esri/core/libs/jsplumb/connection",
      "esri/core/libs/jsplumb/connectors-straight", "esri/core/libs/jsplumb/defaults",
      "esri/core/libs/jsplumb/dom-adapter", "esri/core/libs/jsplumb/endpoint",
      "esri/core/libs/jsplumb/group", "esri/core/libs/jsplumb/overlay-component",
      "esri/core/libs/jsplumb/renderers-svg"
    ], function() {
      require({}, ["esri/core/libs/jsplumb/dom.jsPlumb"], function() {

      });
    });
  }

  return jsPlumb;

// --------------------- end static instance + AMD registration -------------------------------------------		

}));
