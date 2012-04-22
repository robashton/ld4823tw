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
    playSound: function(path) {
      var player = new Audio();
      if(player.canPlayType("audio/mpeg")) {
        player.src = "data:audio/mpeg;base64," + this.findData(path + '.mp3');
      } else {
        player.src = "data:audio/ogg;base64," + this.findData(path + '.ogg');
      }
      player.volume = 0.5;
      player.play();
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
      if(entity.onAddedToScene) entity.onAddedToScene();
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
    withEntity: function(id, cb) {
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
    this.x = -2;
    this.y = -2;
    this.width = 4;
    this.height = 4;
    this.rotation = 0;
    this.physical = false;
  };
  Quad.prototype = {
    intersectsWith: function(other) {
      var myradius = (this.width + this.height) / 4.0;
      var oradius = (other.width + other.height) / 4.0;
      var diffx = this.x - other.x;
      var diffy =  this.y - other.y;
      var diff = Math.sqrt(diffx * diffx + diffy * diffy);
      return (diff < myradius + oradius);
    }
  };
  _.extend(Quad.prototype, Eventable.prototype);

  var RenderQuad = function() {
    Quad.call(this);
    this.colour = '#FFF';
  };
  RenderQuad.prototype = {
    draw: function(context) {
      context.save();
      context.translate(this.x, this.y);
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
  _.extend(RenderQuad.prototype, Quad.prototype);

  IdGenerator = {
    Next: function(prefix) {
      return prefix + Math.floor(Math.random() * 10000000);
    }
  };

  var Planet = function(id, texture, x, y, radius) {
    RenderQuad.call(this);
    this.physical = true;
    this.radius = radius;
    this.id = id;
    this.colour = GlobalResources.getTexture(texture);
    this.height = this.width = (radius * 2.0);
    this.x = x;
    this.y = y;
    this.health = this.maxhealth = 100;
    this.gravity = radius;
  };
  Planet.prototype = {
    onAddedToScene: function() {
      this.scene.on('LevelChanged', this.onLevelChanged, this);
    },
    onLevelChanged: function(level) {
      this.gravity = this.radius * (level * 4.0);
    },
    placeOnSurface: function(entity, angle, height) {
      height = height || 0;
      var x = this.x + (this.radius + height) * Math.cos(angle);
      var y = this.y + (this.radius + height) * Math.sin(angle);
      entity.x = x;
      entity.y = y - (entity.height / 2.0);
      entity.rotation = angle + (Math.PI / 2);
    },
    damage: function(amount) {
      this.health -= amount;
      this.raise('Damaged')
      if(this.health <= 0)
        this.raise('Destroyed');
    },
    tick: function() {
      if(this.health < this.maxhealth) {
        this.health += 0.01;
        this.raise('Healed', this.health);
      }
    },
    increaseHealth: function(amount) {
      this.health = Math.min(amount + this.health, this.maxhealth);
      this.raise('Healed', this.health);
    },
    healthPercentage: function() {
      return (this.health / this.maxhealth) * 100;
    },
    useGravity: function(other) {
      other.applyGravity(this.gravity, this.x, this.y);
    }
  };
  _.extend(Planet.prototype, RenderQuad.prototype);

  var Player = function() {
    RenderQuad.call(this);
    this.id = 'player';
    this.angle = 0;
    this.colour = GlobalResources.getTexture('assets/ship.png');
    this.width = 10;
    this.height = 20;
    this.x = 0;
    this.y = -530;
    this.dirty = true;
    this.energy = this.maxenergy = 100;
    this.energyincreaserate = 0.05;
    this.speed = 0.04;
    this.firingrate = 10;
    this.ticks = 0;
    this.energyFreeze = 0;
  };
  Player.prototype = {
    onAddedToScene: function() {
      this.scene.on('LevelChanged', this.onLevelChanged, this);
    },
    onLevelChanged: function(level) {
      this.speed = 0.04 + (0.0025 * level);
      this.firingrate = Math.max(10 - Math.floor(level * 0.5), 5);
    },
    tick: function() {
      if(this.dirty)
        this.updateRenderCoords();
      if(this.energy < this.maxenergy) {
        this.energy += this.energyincreaserate;
        this.raise('EnergyIncreased');
      }
      if(this.ticks !== 0) {
        if(this.ticks++ >= this.firingrate) {
          this.ticks = 0;
        }
      }
    },
    moveLeft: function() {
      this.angle -= this.speed;
      this.dirty = true;
    },
    moveRight: function() {
      this.angle += this.speed;
      this.dirty = true;
    },
    increaseEnergy: function(amount) {
      this.energy = Math.min(this.energy + amount, this.maxenergy);
      this.raise('EnergyIncreased');
    },
    freezeEnergy: function(duration) {
      this.energyFreeze = duration;
      this.raise('EnergyFreezeStart');
    },
    fireMissile: function() {
      var self = this;
      if(this.energy <= 0) return;
      if(this.ticks++ !== 0) return;

      this.scene.withEntity('missilecontrol', function(missilecontrol) {
        missilecontrol.fire(self.x, self.y, self.angle, 5.0);
      });

      if(this.energyFreeze > 0) {
        this.energyFreeze--;
        if(this.energyFreeze <= 0)
          this.raise('EnergyFreezeEnd');
      } else {
        self.energy -= 2.0;
      } 
      self.raise('Fired');
      GlobalResources.playSound('assets/shoot');
    },
    updateRenderCoords: function() {
      var self = this;
      this.scene.withEntity('centre', function(planet) {
        planet.placeOnSurface(self, self.angle - (Math.PI / 2), 20);
      });
      this.dirty = false;
      this.raise('Updated');
    },
    energyPercentage: function() {
      return (this.energy / this.maxenergy) * 100;
    }
  };
  _.extend(Player.prototype, RenderQuad.prototype);

  var HasMass = function() {

  };
  HasMass.prototype = {
    applyGravity: function(amount, x, y) {
      var diffx = x - (this.x + this.size/2);
      var diffy = y - (this.y + this.size/2);
      var distancesq = (diffx * diffx) + (diffy * diffy);
      var adjustedAmount = (amount / distancesq) * 0.01;
      this.xvel += diffx * adjustedAmount;
      this.yvel += diffy * adjustedAmount;
    },
  };


  var Asteroid = function(id, size, x, y, xvel, yvel) {
    RenderQuad.call(this);
    HasMass.call(this);
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
      this.rotation += 0.1;
    },
    notifyCollidedWith: function(other) {
      if(other.id === 'centre') {
        this.scene.add(new Message(this.x, this.y, -10, 30, '#F00'));
        other.damage(10);
      }
      if(other instanceof Asteroid) return;
      this.raise('Destroyed');
    },
    destroy: function() {
      this.raise('Destroyed');
    },
    getPoints: function() {
      return Math.floor(this.size);
    }
  };
  _.extend(Asteroid.prototype, RenderQuad.prototype, HasMass.prototype);

  var EnemyFactory = function() {
    Eventable.call(this);
    this.id = "enemyfactory";
    this.rate = 90;
    this.ticks = 0;
    this.level = 1;
    this.speedseed = 1.0;
    this.powerups = [];
    this.populatePowerups();
  };

  EnemyFactory.prototype = {
    onAddedToScene: function() {
      this.scene.on('LevelChanged', this.onLevelChanged, this);
    },
    onLevelChanged: function(level) {
      this.level = level;
      this.rate = Math.max(90 - (level * 10), 30);
      this.speedseed = 1.0 + (level * 0.01);
    },
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

      var speed = 1.0 + Math.random() * this.speedseed;
      var accuracy = 2.0 - Math.random() * 4.0;
      var xvel = speed * ((-xdir) + accuracy);
      var yvel = speed * ((-ydir) - accuracy);
      var size = 40 + Math.random() * 50;
      this.emitAt(x, y, size, xvel, yvel);
    },
    emitAt: function(x, y, size, xvel, yvel) {
      var id = IdGenerator.Next('asteroid-');
      var asteroid = new Asteroid(id, size, x, y, xvel, yvel);
      this.scene.add(asteroid);
      asteroid.on('Destroyed', this.onAsteroidDestroyed, this);
    },
    onAsteroidDestroyed: function(data, sender) {
      this.scene.remove(sender);
      sender.off('Destroyed', this.onAsteroidDestroyed, this);
      this.createAsteroidExplosion(sender.x, sender.y);
    },
    createAsteroidExplosion: function(x, y) {
      var explosion = new Explosion(IdGenerator.Next('explosion-'), x, y, {
        r: 1.0,
        g: 0.5,
        b: 0.01,
        lifetime: 120       
      });
      this.scene.add(explosion);
      if(Math.random() * 10 > 7.0)
        this.createPowerup(x, y);
      GlobalResources.playSound('assets/explosion');
    },
    populatePowerups: function() {
      var self = this;
      var energyBoost = function(x, y) {
        var powerup = new EnergyBoost(x, y, 1200);
        self.scene.add(powerup);
      };
      var healthBoost = function(x, y) {
        var powerup = new HealthBoost(x, y, 1200);
        self.scene.add(powerup);
      };
      var field = function(x, y) {
        var powerup = new DestructionFieldGenerator(x, y, 1200);
        self.scene.add(powerup);
      };
      var infiniteEnergy = function(x, y) {
        var powerup = new InfiniteEnergyPowerup(x,  y, 1200);
        self.scene.add(powerup);
      };
      for(var i = 0 ; i < 10; i++) {
        this.powerups.push(energyBoost);
        this.powerups.push(healthBoost);
        if(i % 5 === 0) {
          this.powerups.push(field);
          this.powerups.push(infiniteEnergy);
        }
      }
    },
    createPowerup: function(x, y) {  
      var selector = Math.floor(Math.random() * this.powerups.length);
      var func = this.powerups[selector];
      func(x, y);
    }
  };
  _.extend(EnemyFactory.prototype, Eventable.prototype);

  var Powerup = function(x, y, lifetime, width, height) {
    RenderQuad.call(this);
    HasMass.call(this);
    this.x = x;
    this.y = y;
    this.xvel = 0;
    this.yvel = 0;
    this.lifetime = lifetime;
    this.ticks = 0;
    this.width = width;
    this.height = height;
    this.size = (width + height) / 2.0;
    this.physical = true;
  };
  Powerup.prototype = {
    tick: function() {
      if(this.ticks++ >= this.lifetime)
        return this.scene.remove(this);
      this.x += this.xvel;
      this.y += this.yvel;
      this.rotation += 0.1;
    },
    notifyCollidedWith: function(other) {
      if(other instanceof Planet) {
        this.bestow();
        this.scene.remove(this);
        GlobalResources.playSound('assets/pickup');
      }
      else if(other instanceof Missile) {
        this.scene.remove(this);
        GlobalResources.playSound('assets/sad');
      }
    }
  };
  _.extend(Powerup.prototype, RenderQuad.prototype, HasMass.prototype);

  var EnergyBoost = function(x, y, lifetime) {
    Powerup.call(this, x, y, lifetime, 50, 50);
    this.id = IdGenerator.Next("energyboost-");
    this.colour = GlobalResources.getTexture('assets/star.png');
  };
  EnergyBoost.prototype = {
    bestow: function() {
      this.scene.withEntity('player', function(player) {
        player.increaseEnergy(10);
      });
      this.scene.add(new Message(this.x, this.y, "Energy + 10", 90, '#FF0'));
    }
  };
  _.extend(EnergyBoost.prototype, Powerup.prototype);

  var HealthBoost = function(x, y, lifetime) {
    Powerup.call(this, x, y, lifetime, 50, 50);
    this.id = IdGenerator.Next("HealthBoost-");
    this.colour = GlobalResources.getTexture('assets/heart.png');
  };
  HealthBoost.prototype = {
    bestow: function() {
      this.scene.withEntity('centre', function(centre) {
        centre.increaseHealth(10);
      });
      this.scene.add(new Message(this.x, this.y, "Health + 10", 90, '#0F0'));
    }
  };
  _.extend(HealthBoost.prototype, Powerup.prototype);

  var DestructionFieldGenerator = function(x, y, lifetime) {
    Powerup.call(this, x, y, lifetime, 50, 50);
    this.id = IdGenerator.Next("DestructionFieldGenerator-");
    this.colour = GlobalResources.getTexture('assets/destruction.png');
  };
  DestructionFieldGenerator.prototype = {
    bestow: function() {
      this.scene.add(new DestructionField(0,0));
      this.scene.add(new Message(this.x, this.y, "Destruction Field", 90, '#FFF'));
    }
  };
  _.extend(DestructionFieldGenerator.prototype, Powerup.prototype);

  var InfiniteEnergyPowerup = function(x, y, lifetime) {
    Powerup.call(this, x, y, lifetime, 50, 50);
    this.id = IdGenerator.Next("infiniteenergy-");
    this.colour = GlobalResources.getTexture('assets/infinite.png');
  };
  InfiniteEnergyPowerup.prototype = {
    bestow: function() {
      this.scene.withEntity('player', function(player) {
        player.freezeEnergy(90);
      });
      this.scene.add(new Message(this.x, this.y, "Infinite Energy", 90, '#FF0'));
    }
  };
  _.extend(InfiniteEnergyPowerup.prototype, Powerup.prototype);

  var DestructionField = function(x, y) {
    Eventable.call(this);
    this.id = IdGenerator.Next("DestructionField-");
    this.radius = 10;
    this.x = 0;
    this.y = 0;
  };

  DestructionField.prototype = {
    tick: function() {
      this.radius += 10;
      if(this.radius % 100 === 0)
        this.repelInsideField();
      if(this.radius > 1000)
        this.scene.remove(this);
    },
    repelInsideField: function() {
      var self = this;
      this.scene.each(function(entity) {
        if(entity instanceof Asteroid) {
          var diffx = entity.x - self.x;
          var diffy = entity.y - self.y;
          var distance = Math.sqrt((diffx * diffx) + (diffy * diffy));
          if(distance > self.radius) return;
          entity.destroy();
        }
      });
    },
    draw: function(context) {
      context.beginPath();
      var gradient = context.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(0.4, "transparent");
      gradient.addColorStop(0.4, 'rgba(0, 0, 255, 0.1)');
      gradient.addColorStop(0.95, 'rgba(0, 0, 255, 0.1)');
      gradient.addColorStop(0.95, 'rgba(255, 0, 0, 0.1)');
      gradient.addColorStop(1, "transparent");
      context.fillStyle = gradient;
      context.arc(this.x, this.y, this.radius, Math.PI * 2, false);
      context.fill();
    }
  };
  _.extend(DestructionField.prototype, Eventable.prototype);



  var Missile = function(id, x, y, xvel, yvel) {
    Quad.call(this);
    this.physical = true;
    this.id = id;
    this.x = x;
    this.y = y;
    this.xvel = xvel;
    this.yvel = yvel;
    this.width = 10;
    this.height = 10;
    this.ticks = 0;
  };
  Missile.prototype = {
    draw: function(context) {
      context.beginPath();
      var gradient = context.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.width);
      gradient.addColorStop(0, "white");
      gradient.addColorStop(0.4, "white");
      gradient.addColorStop(0.4, '#0DD');
      gradient.addColorStop(1, "black");
      context.fillStyle = gradient;
      context.arc(this.x, this.y, this.width, Math.PI * 2, false);
      context.fill();
    },
    tick: function() {
      if(this.ticks++ > 3200)
        this.raise('Destroyed');
      this.x = this.x + this.xvel;
      this.y = this.y + this.yvel;
    },
    notifyCollidedWith: function(other) {
      if(other.getPoints) {
        var points = other.getPoints();
        this.raise('PointsGained', points);
      }
      this.raise('Destroyed');    
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
      var missile = new Missile(id, x + (xvel * 2), y + (yvel * 3), xvel, yvel);
      missile.on('Destroyed', this.onMissileDestroyed, this);;
      this.scene.add(missile);      
    },
    onMissileDestroyed: function(data, sender) {
      sender.off('Destroyed', this.onMissileDestroyed, this);
      this.scene.remove(sender);
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
        case 38:
        //  this.scene.add(new DestructionField(0,0));
        break;
        case 39:
          this.movingRight = true;
        break;
        case 17:
          this.firing = true;
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
        case 17:
          this.firing = false;
        break;
      }
    },
    onEntityUpdated: function(data, sender) {
      if(sender.id !== 'player') return;
  //    this.scene.camera.rotateTo(-sender.angle);
    },
    tick: function() {
      var self = this;
      this.scene.withEntity('player', function(player) {
        if(self.movingLeft)
          player.moveLeft();
        else if(self.movingRight)
          player.moveRight();
        if(self.firing)
          player.fireMissile();
      });
    }
  };

  var Particle = function(x, y, velx, vely, size, colour) {
    this.x = x;
    this.y = y;
    this.velx = velx;
    this.vely = vely;
    this.size = size;
    this.colour = colour;
  };
  Particle.prototype = {};

  var Explosion = function(id, x, y, cfg) {
    Eventable.call(this);
    cfg = cfg || {};

    this.id = id;
    this.particles = [];
    this.amount = cfg.amount || 10;
    this.lifetime = cfg.lifetime || 60;
    this.ticks = 0;
    this.x = x;
    this.y = y;
    this.r = cfg.r || 1.0;
    this.g = cfg.g || 1.0;
    this.b = cfg.b || 1.0;
    this.initParticles();
  };
  Explosion.prototype = {
    initParticles: function() {
      for(var i = 0 ; i < this.amount ; i++) {
        var velx = 1.0 - Math.random() * 2.0;
        var vely = 1.0 - Math.random() * 2.0;
        var size = 10.0 + Math.random() * 10.0;
        var r = Math.random() * (this.r * 255) >> 0;
        var g = Math.random() * (this.g * 255) >> 0;
        var b = Math.random() * (this.b * 255) >> 0;
        var colour = "rgba("+r+","+g+","+b+",0.5)";
        this.particles.push(new Particle(this.x, this.y, velx, vely, size, colour));
      }
    },
    tick: function() {
      var self = this;
      this.scene.withEntity('explosionoverlay', function(overlay) {
        overlay.register(self);
      });
    },
    fill: function(context) { 
      if(this.ticks++ > this.lifetime)
        return this.finished();   
      context.save();
      context.globalAlpha = Math.max(1.0 - (this.ticks / this.lifetime, 0.0));
      for(var i = 0; i < this.amount ; i++) {
        var particle = this.particles[i];
        this.updateParticle(particle);

        context.beginPath();
        var gradient = context.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.size);
        gradient.addColorStop(0, "white");
        gradient.addColorStop(0.1, "white");
        gradient.addColorStop(0.1, particle.colour);
        gradient.addColorStop(1, "transparent");
        context.fillStyle = gradient;
        context.arc(particle.x, particle.y, particle.size, Math.PI * 2, false);
        context.fill();
      }
      context.restore();
    },
    finished: function() {
      this.raise('Finished');
      this.scene.remove(this);
    },
    updateParticle: function(particle) {
      particle.x += particle.velx;
      particle.y += particle.vely;
    }
  };
  _.extend(Explosion.prototype, Eventable.prototype);

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

  var CameraController = function(startZoom, standardZoom) {
    Eventable.call(this);
    this.id = "cameracontroller";
    this.standardZoom = standardZoom;
    this.currentZoom = startZoom;
    this.desiredZoom = standardZoom;
  };
  CameraController.prototype = {
    onAddedToScene: function() {
      this.scene.autoHook(this);
    },
    onFired: function() {
      this.desiredZoom += 100;
    },
    tick: function() {
      if(this.currentZoom > this.desiredZoom)
        this.currentZoom -= 15;
      else if(this.currentZoom < this.desiredZoom)
        this.currentZoom += 30;
      this.scene.camera.zoomTo(this.currentZoom);

      if(Math.abs(this.desiredZoom - this.currentZoom) < 15)
        this.currentZoom = this.desiredZoom;

      if(this.desiredZoom > this.standardZoom)
        this.desiredZoom -= 15;
      if(this.desiredZoom < this.standardZoom)
        this.desiredZoom = this.standardZoom;    

    }
  };
  _.extend(CameraController.prototype, Eventable.prototype);

  var ScoreKeeper = function() {
    Eventable.call(this);
    this.id = "scorekeeper";
    this.level = 1;
    this.score = 0;
  };
  ScoreKeeper.prototype = {
    onAddedToScene: function() {
      this.scene.autoHook(this);
    },
    onPointsGained: function(points, sender) {
      points *= this.level;
      this.score += points;
      this.raise('ScoreChanged', this.score);
      this.scene.add(new Message(sender.x, sender.y, points, 30, '#F0F'));
    },
    onLevelChanged: function(level) {
      this.level = level;
    }
  };
  _.extend(ScoreKeeper.prototype, Eventable.prototype);

  var Message = function(x, y, message, duration, colour) {
    Eventable.call(this);
    this.id = IdGenerator.Next('message-');
    this.ticks = 0;
    this.duration = duration;
    this.message = message;
    this.colour = colour;
    this.x = x;
    this.y = y;
  };
  Message.prototype = {
    tick: function() {
      var self = this;
      this.scene.withEntity('textoverlay', function(overlay) {
        overlay.register(self);
      });
      this.y -= 1.0;
    },
    fill: function(context) {
      context.fillStyle = this.colour;
      context.font = "32pt Helvetica";
      context.fillText(this.message, this.x, this.y);
      if(this.ticks++ >= this.duration)
        this.scene.remove(this);
    }
  };
  _.extend(Message.prototype, Eventable.prototype);

  var Bastard = function() {
    Eventable.call(this);
    this.id = "bastard";
    this.level = 1;
    this.score = 0;
    this.update();
  };
  Bastard.prototype = {
    onAddedToScene: function() {
      this.scene.autoHook(this);
    },
    onScoreChanged: function(score) {
      this.score = score;
      if(this.score > this.threshold)
        this.nextLevel();
    },
    changeLevel: function(level) {
      this.level = level;
      this.update();
    },
    nextLevel: function() {
      this.level++;
      this.update();
    },
    update: function() {
      this.threshold = (this.level * this.level) * 400;
      this.raise('LevelChanged', this.level);
    }
  };
  _.extend(Bastard.prototype, Eventable.prototype);

  var TextOverlay = function() {
    Eventable.call(this);
    this.messages = [];
    this.id = "textoverlay";
  };
  TextOverlay.prototype = {
    register: function(msg) {
      this.messages.push(msg);
    },
    draw: function(context) {
      for(var i in this.messages) {
        this.messages[i].fill(context);
      }
      this.messages = [];
    }
  };
  _.extend(TextOverlay.prototype, Eventable.prototype);

  var ExplosionOverlay = function() {
    Eventable.call(this);
    this.explosions = [];
    this.id = "explosionoverlay";
  };
  ExplosionOverlay.prototype = {
    register: function(explosion) {
      this.explosions.push(explosion);
    },
    draw: function(context) {
      for(var i in this.explosions) {
        this.explosions[i].fill(context);
      }
      this.explosions = [];
    }
  };
  _.extend(ExplosionOverlay.prototype, Eventable.prototype);

  var BasicMap = function() {
    Eventable.call(this);
    this.planet = null;
    this.scene = null;
  };

  BasicMap.prototype = {
    loadInto: function(scene) {
      this.scene = scene;
      // Create the planet we're protecting
      this.planet = new Planet('centre', 'assets/largeplanet.png', 0, 0, 128);
      scene.add(this.planet);

      this.planet.on('Destroyed', this.onPlanetDestroyed, this);

      // Start off above the polar north of the planet
      scene.camera.moveTo(0, 0);
      scene.camera.zoomTo(1000);
      scene.add(new EnemyFactory());
      var bastard = new Bastard();
      scene.add(bastard);

      scene.add(new Message(-200, -100, "3", 30, '#F00'));

      setTimeout(function() {
        scene.add(new Message(-200, -100, "2", 30, '#F00'));
      }, 1000);

      setTimeout(function() {
        scene.add(new Message(-200, -100, "1", 30, '#F00'));
      }, 2000);
     
      setTimeout(function() {
        var controller = new CameraController(1000, 2000); 
        scene.add(controller);
        scene.add(new Message(-200, -100, "GO GO GO", 90, '#F00'));
      }, 3000)
    },
    getSurfaceHeight: function() {
      return 512;
    },
    onPlanetDestroyed: function() {
      this.scene.remove(this.planet);

      // TODO: Explosion before this
      this.raise('GameOver');
    }
  };
  _.extend(BasicMap.prototype, Eventable.prototype);

  var Hud = function(scene) {
    this.scene = scene;
    this.scene.autoHook(this);
    this.score = $('#score');
    this.health = $('#health');
    this.energy = $('#energy');
    this.level = $('#level');
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
    },
    onEnergyFreezeStart: function(data, sender) {
      this.energy.css('background-color', '#00F');
    },
    onEnergyFreezeEnd: function(data, sender) {
      this.energy.css('background-color', '#CC0');
    },
    onHealed: function(health, sender) {
      if(sender.id !== 'centre') return;
      var perc = sender.healthPercentage();
      this.health.css('width', perc + '%');
    },
    onScoreChanged: function(score, sender) {
      this.score.text(score);
    },
    onLevelChanged: function(level, sender) {
      this.level.text(level);
    }
  };

  var Game = function() {
    this.canvas = document.getElementById('target');
    this.sizeupCanvas();
    this.context = this.canvas.getContext('2d');
    this.camera = new Camera(this.context);
    this.scene = new Scene(this.camera);
    this.controller = new Controller(this.scene);
    this.missiles = new MissileControl();
    this.hud = new Hud(this.scene);
    this.collision = new Collision();
    this.scorekeeper = new ScoreKeeper();
    this.explosionoverlay = new ExplosionOverlay();
    this.textoverlay = new TextOverlay();
  };

  Game.prototype = {
    sizeupCanvas: function() {
      var ele = $(this.canvas);
      ele
        .attr('width', ele.width() + 'px')
        .attr('height', ele.height() + 'px');
    },
    start: function() {
      var self = this;
      GlobalResources.load('assets.json', function() {
        self.scene.add(self.missiles);
        self.scene.add(self.collision);
        self.scene.add(self.scorekeeper);
        self.loadMap(new BasicMap())
        self.createPlayer();
        self.scene.add(self.explosionoverlay);
        self.scene.add(self.textoverlay);
        
        self.startTimers();
      });
    },
    startTimers: function() {
      var self = this;
      setInterval(function() {
        self.controller.tick();
        self.scene.tick();
        
        self.context.globalCompositionOperation = 'source-over';
        self.context.fillStyle = 'rgba(0, 0, 0, 0.1)';
        self.context.fillRect(0, 0, self.canvas.width, self.canvas.height);
        self.context.globalCompositionOperation = 'lighter';

        self.scene.draw(self.context);
      }, 100 / 3);
    },
    loadMap: function(map) {
      map.loadInto(this.scene);
      map.on('GameOver', this.onGameOver, this);
    },
    createPlayer: function() {
      var player = new Player();
      this.scene.add(player);
    },
    onGameOver: function() {
      $('#gameover').show();
      $('#final-score').text(this.scorekeeper.score);
      $('#try-again').click(function() {
        document.location = document.location;
      });
    }
  };

  $(document).ready(function() {
    var game = new Game();
    game.start();
  });
})();