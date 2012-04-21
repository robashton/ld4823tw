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
      entity.scene = this;
      entity.onAny(this.onEntityEvent, this);
    },
    remove: function(entity) {
      delete this.entities[entity.id];
      entity.scene = null;
      entity.offAny(this.onEntityEvent, this);
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
    with: function(id, cb) {
      var entity = this.entities[id];
      if(entity) cb(entity);
    },
    each: function(cb) {
      for(var i in this.entities) {
        var entity = this.entities[i];
        cb(entity);
      }
    },
    onEntityEvent: function(e, sender) {
      this.raise(e.event, e.data, sender);
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
    this.rotation = 0;
  };
  Quad.prototype = {
    draw: function(context) {
      context.save();
      context.translate(this.x + this.width / 2.0, this.y + this.height / 2.0);
      context.rotate(this.rotation);
      context.translate(-this.width / 2.0, -this.height / 2.0);
      if(this.colour instanceof Image)
        context.drawImage(this.colour, 0, 0, this.width, this.height);
      else {
        context.fillStyle = this.colour;
        context.fillRect(0, 0, this.width, this.height);
      }
      context.restore();
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
    placeOnSurface: function(entity, angle) {
      var x = (this.x + this.radius) + (this.radius * Math.cos(angle));
      var y = (this.y + this.radius) + (this.radius * Math.sin(angle));
      entity.x = x;
      entity.y = y - entity.height;
      entity.rotation = angle;
    }
  };
  _.extend(Planet.prototype, Quad.prototype);

  var Player = function() {
    Quad.call(this);
    this.id = 'player';
    this.angle = 0;
    this.colour = '#FFF';
    this.width = 20;
    this.height = 10;
    this.x = 0;
    this.y = -530;
    this.dirty = true;
  };
  Player.prototype = {
    tick: function() {
      if(this.dirty)
        this.updateRenderCoords();
    },
    moveLeft: function() {
      this.angle -= 0.02;
      this.dirty = true;
    },
    moveRight: function() {
      this.angle += 0.02;
      this.dirty = true;
    },
    fireMissile: function() {
      var self = this;
      this.scene.with('missilecontrol', function(missilecontrol) {
        missilecontrol.fire(self.x, self.y, self.angle, 3.0);
      });
    },
    updateRenderCoords: function() {
      var self = this;
      this.scene.with('centre', function(planet) {
        planet.placeOnSurface(self, self.angle - (Math.PI / 2));
      });
      this.dirty = false;
      this.raise('Updated');
    }
  };
  _.extend(Player.prototype, Quad.prototype);

  var BasicMap = function() {

  };
  BasicMap.prototype = {
    loadInto: function(scene) {

      // Create the planet we're protecting
      var planet = new Planet('centre', 'assets/basicplanet.png', 0, 0, 512);
      scene.add(planet);

      // Start off above the polar north of the planet
      scene.camera.moveTo(0, -700);
      scene.camera.zoomTo(1000);

      // For testing purposes
      scene.add(new Planet('sat1', 'assets/basicplanet.png', 100, -900, 50));
      scene.add(new Planet('sat2', 'assets/basicplanet.png', 900, 0, 80));
      scene.add(new Planet('sat3', 'assets/basicplanet.png', 100, 900, 90));
      scene.add(new Planet('sat4', 'assets/basicplanet.png', -900, 0, 100));
    },
    getSurfaceHeight: function() {
      return 512;
    }
  };

  var Missile = function(id, x, y, xvel, yvel) {
    Quad.call(this);
    this.id = id;
    this.x = x;
    this.y = y;
    this.xvel = xvel;
    this.yvel = yvel;
    this.colour = '#F00';
    this.width = 10;
    this.height = 10;
  };
  Missile.prototype = {
    tick: function() {
      this.x = this.x + this.xvel;
      this.y = this.y + this.yvel;
    }
  };
  _.extend(Missile.prototype, Quad.prototype);

  var MissileControl = function() {
    Eventable.call(this);
    this.activeMissiles = {};
    this.id = "missilecontrol";
  };
  MissileControl.prototype = {
    fire: function(x, y, angle, speed) {
      angle -= (Math.PI/2);
      var xvel = Math.cos(angle) * speed;
      var yvel = Math.sin(angle) * speed;
      var id = 'missile-' + Math.floor(Math.random() * 10000000);
      var missile = new Missile(id, x, y, xvel, yvel);
      this.activeMissiles[id] = missile;
      this.scene.add(missile);
    },
    tick: function() {
      // Check for dead missiles
    }
  };
  _.extend(MissileControl.prototype, Eventable.prototype);

  var Controller = function(scene) {
    this.scene = scene;
    this.hookEvents();
  };

  Controller.prototype = {
    hookEvents: function() {
      this.scene.on('Updated', this.onEntityUpdated, this);
      
      var self = this;
      document.onkeydown = function(e) {
        self.onKeyDown(e);
      };   
      document.onkeyup = function(e) {
        self.onKeyUp(e);
      };

    },
    onKeyDown: function(e) {
      switch(e.keyCode) {
        case 37:
          this.movingLeft = true;
        break;
        case 39:
          this.movingRight = true;
        break;
        case 17:
          this.fireMissile();
        break;
      }
    },
    onKeyUp: function(e){
      switch(e.keyCode) {
        case 37:
          this.movingLeft = false;
        break;
        case 39:
          this.movingRight = false;
        break;
      }
    },
    onEntityUpdated: function(data, sender) {
      if(sender.id !== 'player') return;
      this.scene.camera.rotateTo(-sender.angle);
    },
    fireMissile: function() {
      this.scene.with('player', function(player) {
        player.fireMissile();
      });
    },
    tick: function() {
      var self = this;
      this.scene.with('player', function(player) {
        if(self.movingLeft)
          player.moveLeft();
        else if(self.movingRight)
          player.moveRight();
      });
    }
  };

  var Game = function() {
    this.canvas = document.getElementById('target');
    this.context = this.canvas.getContext('2d');
    this.camera = new Camera(this.context);
    this.scene = new Scene(this.camera);
    this.controller = new Controller(this.scene);
    this.missiles = new MissileControl();
  };

  Game.prototype = {
    start: function() {
      var self = this;
      GlobalResources.load('assets.json', function() {
        self.loadMap(new BasicMap())
        self.scene.add(self.missiles);
        self.createPlayer();
        self.startTimers();
      });
    },
    startTimers: function() {
      var self = this;
      setInterval(function() {
        self.controller.tick();
        self.scene.tick();
        self.canvas.width = self.canvas.width;
        self.scene.draw(self.context);
      }, 100 / 3);
    },
    loadMap: function(map) {
      map.loadInto(this.scene);
    },
    createPlayer: function() {
      var player = new Player();
      this.scene.add(player);
    }
  };




  $(document).ready(function() {
    var game = new Game();
    game.start();
  });
})();