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
    this.entitiesIndex = [];
  };

  Scene.prototype = {
    add: function(entity) {
      this.entities[entity.id] = entity;
      this.entitiesIndex.push(entity);
      entity.scene = this;
      entity.onAny(this.onEntityEvent, this);
    },
    remove: function(entity) {
      delete this.entities[entity.id];
      this.entitiesIndex = _(this.entitiesIndex).without(entity);
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
    crossEach: function(cb) {
      for(var i = 0; i < this.entitiesIndex.length; i++) {
        for(var j = i+1 ; j < this.entitiesIndex.length; j++) {
          var one = this.entitiesIndex[i];
          var two = this.entitiesIndex[j];
          cb(one, two);
        }
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
    this.physical = false;
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
    },
    intersectsWith: function(other) {
      if(this.x + this.width < other.x) return false;
      if(this.y + this.height < other.y) return false;
      if(other.x + other.width < this.x) return false;
      if(other.y + other.height < this.y) return false;
      return true;
    }
  };
  _.extend(Quad.prototype, Eventable.prototype);

  IdGenerator = {
    Next: function(prefix) {
      return 'prefix' + Math.floor(Math.random() * 10000000);
    }
  };

  var Planet = function(id, texture, x, y, radius) {
    Quad.call(this);
    this.physical = true;
    this.radius = radius;
    this.id = id;
    this.colour = GlobalResources.getTexture(texture);
    this.height = this.width = (radius * 2.0);
    this.x = x - radius;
    this.y = y - radius;
    this.health = this.maxhealth = 100;
    this.gravity = radius;
  };
  Planet.prototype = {
    placeOnSurface: function(entity, angle) {
      var x = (this.x + this.radius) + (this.radius * Math.cos(angle));
      var y = (this.y + this.radius) + (this.radius * Math.sin(angle));
      entity.x = x;
      entity.y = y - entity.height;
      entity.rotation = angle;
    },
    damage: function(amount) {
      this.health--;
      this.raise('Damaged')
    },
    healthPercentage: function() {
      return (this.health / this.maxhealth) * 100;
    },
    useGravity: function(other) {
      other.applyGravity(this.gravity, this.x, this.y);
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
    this.energy = this.maxenergy = 100;
    this.energyincreaserate = 0.05;
  };
  Player.prototype = {
    tick: function() {
      if(this.dirty)
        this.updateRenderCoords();
      if(this.energy < this.maxenergy) {
        this.energy += this.energyincreaserate;
        this.raise('EnergyIncreased');
      }
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
      if(this.energy <= 0) return;
      this.scene.with('missilecontrol', function(missilecontrol) {
        missilecontrol.fire(self.x, self.y, self.angle, 3.0);
      });
      self.energy -= 2.0;
      self.raise('Fired');
    },
    updateRenderCoords: function() {
      var self = this;
      this.scene.with('centre', function(planet) {
        planet.placeOnSurface(self, self.angle - (Math.PI / 2));
      });
      this.dirty = false;
      this.raise('Updated');
    },
    energyPercentage: function() {
      return (this.energy / this.maxenergy) * 100;
    }
  };
  _.extend(Player.prototype, Quad.prototype);

  var Asteroid = function(id, size, x, y, xvel, yvel) {
    Quad.call(this);
    this.physical = true;
    this.id = id;
    this.x = x;
    this.y = y;
    this.size = size;
    this.xvel = xvel;
    this.yvel = yvel;
    this.width = size;
    this.height = size;
    this.colour = GlobalResources.getTexture('assets/asteroid.png');
  };
  Asteroid.prototype = {
    tick: function() {
      this.x += this.xvel;
      this.y += this.yvel;
      this.rotation += 0.01;
      this.xvel *= 0.68;
      this.yvel *= 0.68;
    },
    notifyCollidedWith: function(other) {
      if(other.id === 'centre')
        other.damage(5);
      this.raise('Destroyed');
    },
    applyGravity: function(amount, x, y) {
      var diffx = x - this.x;
      var diffy = y - this.y;
      var distancesq = (diffx * diffx) + (diffy * diffy);
      var adjustedAmount = amount / distancesq;
      this.xvel += diffx * adjustedAmount;
      this.yvel += diffy * adjustedAmount;
    }
  };
  _.extend(Asteroid.prototype, Quad.prototype);

  var EnemyFactory = function() {
    Eventable.call(this);
    this.id = "enemyfactory";
    this.rate = 90;
    this.ticks = 0;
  };
  EnemyFactory.prototype = {
    tick: function() {
      if(++this.ticks % this.rate === 0)
        this.emit();
    },
    emit: function() {
      var angle = Math.random() * (Math.PI * 2);
      var xdir = Math.cos(angle);
      var ydir = Math.sin(angle);
      var x = 1500 * xdir;
      var y = 1500 * ydir;
      var size = 40 + Math.random() * 50;
      this.emitAt(x, y, size);
    },
    emitAt: function(x, y, size) {
      var speed = 2.0 + Math.random() * 3.0;
      var id = IdGenerator.Next('asteroid-');
      var xvel = speed * (1.0 - (Math.random() * 2.0));
      var yvel = speed * (1.0 - (Math.random() * 2.0));
      var asteroid = new Asteroid(id, size, x, y, xvel, yvel);
      this.scene.add(asteroid);
      asteroid.on('Destroyed', this.onAsteroidDestroyed, this);
    },
    onAsteroidDestroyed: function(data, sender) {
      this.scene.remove(sender);
      sender.off('Destroyed', this.onAsteroidDestroyed, this);
      this.determineAsteroidForking(sender);
    },
    determineAsteroidForking: function(asteroid) {
      if(asteroid.size > 70) {
        this.emitAt(asteroid.x, asteroid.y, asteroid.size / 2);
        this.emitAt(asteroid.x, asteroid.y, asteroid.size / 2);
      }
    }
  };
  _.extend(EnemyFactory.prototype, Eventable.prototype);

  var Missile = function(id, x, y, xvel, yvel) {
    Quad.call(this);
    this.physical = true;
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
    this.id = "missilecontrol";
  };
  MissileControl.prototype = {
    fire: function(x, y, angle, speed) {
      angle -= (Math.PI/2);
      var xvel = Math.cos(angle) * speed;
      var yvel = Math.sin(angle) * speed;
      var id = IdGenerator.Next('missile-');
      var missile = new Missile(id, x, y, xvel, yvel);
      this.scene.add(missile);
    },
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

  var Collision = function() {
    Eventable.call(this);
    this.id = "collision";
  };
  Collision.prototype = {
    tick: function() {
      var self = this;
      this.scene.crossEach(function(one, two) {
        self.evaluate(one, two);
      });
    },
    evaluate: function(one, two) {
      this.evaluateCollision(one, two);
      this.evaluateGravity(one, two);
      this.evaluateGravity(two, one);
    },
    evaluateCollision: function(one, two) {
      if(!one.physical || !two.physical) return;
      if(one.intersectsWith(two)) {
        if(one.notifyCollidedWith) one.notifyCollidedWith(two);
        if(two.notifyCollidedWith) two.notifyCollidedWith(one);
      }
    },
    evaluateGravity: function(one, two) {
      if(one.useGravity && two.applyGravity)
        one.useGravity(two);
    }
  };
  _.extend(Collision.prototype, Eventable.prototype);


  var BasicMap = function() {

  };
  BasicMap.prototype = {
    loadInto: function(scene) {

      // Create the planet we're protecting
      var planet = new Planet('centre', 'assets/basicplanet.png', 0, 0, 512);
      scene.add(planet);

      // Start off above the polar north of the planet
      scene.camera.moveTo(0, -700);
      scene.camera.zoomTo(4000);

      // For testing purposes
      scene.add(new Planet('sat1', 'assets/basicplanet.png', 100, -900, 50));
      scene.add(new Planet('sat2', 'assets/basicplanet.png', 900, 0, 80));
      scene.add(new Planet('sat3', 'assets/basicplanet.png', 100, 900, 90));
      scene.add(new Planet('sat4', 'assets/basicplanet.png', -900, 0, 100));

      scene.add(new EnemyFactory());
    },
    getSurfaceHeight: function() {
      return 512;
    }
  };

  var Hud = function(scene) {
    this.scene = scene;
    this.scene.autoHook(this);
    this.health = $('#health');
    this.energy = $('#energy');
  };
  Hud.prototype = {
    onDamaged: function(data, sender) {
      if(sender.id !== 'centre') return;      
      var perc = sender.healthPercentage();
      this.health.css('width', perc + '%');
    },
    onFired: function(data, sender) {
      if(sender.id !== 'player') return;
      var perc = sender.energyPercentage();
      this.energy.css('width', perc + '%');
    },
    onEnergyIncreased: function(data, sender) {
      if(sender.id !== 'player') return;
      var perc = sender.energyPercentage();
      this.energy.css('width', perc + '%');
    }
  };

  var Game = function() {
    this.canvas = document.getElementById('target');
    this.context = this.canvas.getContext('2d');
    this.camera = new Camera(this.context);
    this.scene = new Scene(this.camera);
    this.controller = new Controller(this.scene);
    this.missiles = new MissileControl();
    this.hud = new Hud(this.scene);
    this.collision = new Collision();
  };

  Game.prototype = {
    start: function() {
      var self = this;
      GlobalResources.load('assets.json', function() {
        self.loadMap(new BasicMap())
        self.scene.add(self.missiles);
        self.scene.add(self.collision);
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