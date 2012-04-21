(function() {

  var EventContainer = function(defaultContext) {
    this.handlers = [];
    this.defaultContext = defaultContext;
  }; 
  
  EventContainer.prototype = {
    raise: function(source, data) {
     var handlerLength = this.handlers.length;
     for(var i = 0; i < handlerLength; i++) {
        var handler = this.handlers[i];
        if(!handler) continue;
        handler.method.call(handler.context || this.defaultContext, data, source);   
     }
    },
    add: function(method, context) {
      this.handlers.push({
        method: method,
        context: context      
      });
    },
    remove: function(method, context) {
      this.handlers = _(this.handlers).filter(function(item) {
        return item.method !== method || item.context !== context;
      });
    }
  };

   var Eventable = function() {
    this.eventListeners = {};
    this.allContainer = new EventContainer(this);
    this.eventDepth = 0;
  };
  
  Eventable.prototype = {
    autoHook: function(container) {
      for(var key in container) { 
        if(key.indexOf('on') === 0) {
          this.on(key.substr(2), container[key], container);
        }   
      }
    },
    autoUnhook: function(container) {
      for(var key in container) { 
        if(key.indexOf('on') === 0) {
          this.off(key.substr(2), container[key], container);
        }   
      }
    },
    once: function(eventName, callback, context) {
      var self = this;
      var wrappedCallback = function(data, sender) {
        callback.call(this, data, sender);
        self.off(eventName, wrappedCallback, context);
      };
      this.on(eventName, wrappedCallback, context);
    },
    
    on: function(eventName, callback, context) {
      this.eventContainerFor(eventName).add(callback, context);
    },
    
    off: function(eventName, callback, context) {
      this.eventContainerFor(eventName).remove(callback, context);
    },

    onAny: function(callback, context) {
      this.allContainer.add(callback, context);
    },

    offAny: function(callback, context) {
      this.allContainer.remove(callback, context);
    },

    raise: function(eventName, data, sender) {
      var container = this.eventListeners[eventName];

      if(container)
        container.raise(sender || this, data);
      
      this.allContainer.raise(sender || this, {
        event: eventName,
        data: data
      });
    },

    eventContainerFor: function(eventName) {
      var container = this.eventListeners[eventName];
      if(!container) {
        container =  new EventContainer(this);
        this.eventListeners[eventName] = container;
      }
      return container;
    }
  };

  var Resources = function() {
    Eventable.call(this);
    this.packages = [];
    this.cachedResources = {};
  };

  Resources.prototype = {
    load: function(file, cb) {
      var self = this;  
      $.getJSON(file, function(data) {
        self.packages.push(data);
        cb();
      })
    },
    getTexture: function(path) {
      var texture = this.fromCacheOrCreate(path, function(data) {
        var image = new Image();
        image.src = "data:image/png;base64," + data;
        return image;
      });
      if(!texture)
        console.warn('Missing texture', path);
      return texture;
    },
    fromCacheOrCreate: function(path, createCallback) {
      var item = this.cachedResources[path];
      if(item) return item;
      var data = this.findData(path);
      if(data) {
        item = createCallback(data);
        this.cachedResources[path] = item;
      } 
      return item;
    },
    findData: function(path) {
      for(var i = 0; i < this.packages.length; i++) {
        var package = this.packages[i];
        var data = package[path];
        if(data) return data;
      }
      return null;
    }
  };
  _.extend(Resources.prototype, Eventable.prototype);
  var GlobalResources = new Resources();

  var Scene = function(camera) {
    Eventable.call(this);
    this.camera = camera;
    this.entities = {};
  };

  Scene.prototype = {
    add: function(entity) {
      this.entities[entity.id] = entity;
    },
    remove: function(entity) {
      delete this.entities[entity.id];
    },
    tick: function() {
      this.each(function(entity) {
        if(entity.tick)
          entity.tick();
      });
    },
    draw: function(context) {
      this.camera.begin();
      this.each(function(entity) {
        if(entity.draw)
          entity.draw(context);
      });
      this.camera.end();
    },
    each: function(cb) {
      for(var i in this.entities) {
        var entity = this.entities[i];
        cb(entity);
      }
    }
  };
  _.extend(Scene.prototype, Eventable.prototype);

  var Quad = function() {
    Eventable.call(this);
    this.colour = '#FFF';
    this.x = -2;
    this.y = -2;
    this.width = 4;
    this.height = 4;
  };
  Quad.prototype = {
    draw: function(context) {
      if(this.colour instanceof Image)
        context.drawImage(this.colour, this.x, this.y, this.width, this.height);
      else {
        context.fillStyle = this.colour;
        context.fillRect(this.x, this.y, this.width, this.height);
      }
    }
  };
  _.extend(Quad.prototype, Eventable.prototype);

  var Planet = function(id, texture, x, y, radius) {
    Quad.call(this);
    this.radius = radius;
    this.id = id;
    this.colour = GlobalResources.getTexture(texture);
    this.height = this.width = (radius * 2.0);
    this.x = x - radius;
    this.y = y - radius;

  };
  Planet.prototype = {

  };
  _.extend(Planet.prototype, Quad.prototype)

  var BasicMap = function() {

  };
  BasicMap.prototype = {
    loadInto: function(scene) {
      var planet = new Planet('centre', 'assets/basicplanet.png', 0, 0, 512);
      scene.add(planet);
      scene.camera.moveTo(0, -700);
      scene.camera.zoomTo(1000);

      // For testing purposes
      scene.add(new Planet('sat1', 'assets/basicplanet.png', 100, -900, 50));
      scene.add(new Planet('sat2', 'assets/basicplanet.png', 900, 0, 80));
      scene.add(new Planet('sat3', 'assets/basicplanet.png', 100, 900, 90));
      scene.add(new Planet('sat4', 'assets/basicplanet.png', -900, 0, 100));
    }
  };

  var Controller = function(scene) {
    this.scene = scene;
    this.hookEvents();
  };

  Controller.prototype = {
    hookEvents: function() {
      var self = this;
      document.onkeyup = function(e) {
        switch(e.keyCode) {
          case 39:
            self.scene.camera.rotate(-0.01);
          break;
          case 37:
            self.scene.camera.rotate(0.01);
          break;
        }
      };
    }
  };

  var Game = function() {
    this.canvas = document.getElementById('target');
    this.context = this.canvas.getContext('2d');
    this.camera = new Camera(this.context);
    this.scene = new Scene(this.camera);
    this.controller = new Controller(this.scene);
  };

  Game.prototype = {
    start: function() {
      var self = this;
      GlobalResources.load('assets.json', function() {
        self.loadMap(new BasicMap())
        self.startTimers();
      });
    },
    startTimers: function() {
      var self = this;
      setInterval(function() {
        self.scene.tick();
        self.canvas.width = self.canvas.width;
        self.scene.draw(self.context);
      }, 100 / 3);
    },
    loadMap: function(map) {
      map.loadInto(this.scene);
    }
  };


  $(document).ready(function() {
    var game = new Game();
    game.start();
  });
})();