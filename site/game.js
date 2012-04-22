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

  var RenderQuad = function() {
    Eventable.call(this);
    this.colour = '#FFF';
    this.x = -2;
    this.y = -2;
    this.width = 4;
    this.height = 4;
    this.rotation = 0;
    this.physical = false;
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
    },
    intersectsWith: function(other) {
      var myradius = (this.width + this.height) / 4.0;
      var oradius = (other.width + other.height) / 4.0;
      var diffx = this.x - other.x;
      var diffy =  this.y - other.y;
      var diff = Math.sqrt(diffx * diffx + diffy * diffy);
      return (diff < myradius + oradius);
    }
  };
  _.extend(RenderQuad.prototype, Eventable.prototype);

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
    placeOnSurface: function(entity, angle, height) {
      height = height || 0;
      var x = this.x + (this.radius + height) * Math.cos(angle);
      var y = this.y + (this.radius + height) * Math.sin(angle);
      entity.x = x;
      entity.y = y - entity.height;
      entity.rotation = angle;
    },
    damage: function(amount) {
      this.health -= amount * 10;
      this.raise('Damaged')
      if(this.health <= 0)
        this.raise('Destroyed');
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
      this.angle -= 0.04;
      this.dirty = true;
    },
    moveRight: function() {
      this.angle += 0.04;
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

  var Asteroid = function(id, size, x, y, xvel, yvel) {
    RenderQuad.call(this);
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
      if(other.id === 'centre')
        other.damage(10);
      if(other instanceof Asteroid) return;
      this.raise('Destroyed');
    },
    applyGravity: function(amount, x, y) {
      var diffx = x - (this.x + this.size/2);
      var diffy = y - (this.y + this.size/2);
      var distancesq = (diffx * diffx) + (diffy * diffy);
      var adjustedAmount = (amount / distancesq) * 0.01;
      this.xvel += diffx * adjustedAmount;
      this.yvel += diffy * adjustedAmount;
    },
    getPoints: function() {
      return Math.floor(this.size);
    }
  };
  _.extend(Asteroid.prototype, RenderQuad.prototype);

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

      var speed = 1.0 + Math.random() * 1.0;
      var accuracy = 1.0 - Math.random() * 2.0;
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
      var explosion = new Explosion(IdGenerator.Next('explosion-'), x, y);
      this.scene.add(explosion);
    }
  };
  _.extend(EnemyFactory.prototype, Eventable.prototype);

  var Missile = function(id, x, y, xvel, yvel) {
    RenderQuad.call(this);
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
    },
    notifyCollidedWith: function(other) {
      if(other.getPoints) {
        var points = other.getPoints();
        this.raise('PointsGained', points);
      }
      this.raise('Destroyed');
    }
  };
  _.extend(Missile.prototype, RenderQuad.prototype);

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
      var missile = new Missile(id, x + (xvel * 10), y + (yvel * 10), xvel, yvel);
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
  //    this.scene.camera.rotateTo(-sender.angle);
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
    this.initParticles();
  };
  Explosion.prototype = {
    initParticles: function() {
      for(var i = 0 ; i < this.amount ; i++) {
        var velx = 1.0 - Math.random() * 2.0;
        var vely = 1.0 - Math.random() * 2.0;
        var size = 5.0 + Math.random() * 5.0;
        var colour = '#F00';
        this.particles.push(new Particle(this.x, this.y, velx, vely, size, colour));
      }
    },
    draw: function(context) { 
      if(this.ticks++ > this.lifetime)
        return this.finished();   
      for(var i = 0; i < this.amount ; i++) {
        var particle = this.particles[i];
        this.updateParticle(particle);

        context.beginPath();
        var gradient = context.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.size);
        gradient.addColorStop(0, "white");
        gradient.addColorStop(0.4, "white");
        gradient.addColorStop(0.4, particle.colour);
        gradient.addColorStop(1, "black");
        context.fillStyle = gradient;
        context.arc(particle.x, particle.y, particle.size, Math.PI * 2, false);
        context.fill();
      }
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

  var CameraController = function(standardZoom) {
    Eventable.call(this);
    this.id = "cameracontroller";
    this.standardZoom = standardZoom;
    this.currentZoom = standardZoom;
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
        this.currentZoom -= 7.5;
      else if(this.currentZoom < this.desiredZoom)
        this.currentZoom += 30;
      this.scene.camera.zoomTo(this.currentZoom);

      if(this.desiredZoom > this.standardZoom)
        this.desiredZoom -= 7.5;
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
      this.score += points * this.level;
      this.raise('ScoreChanged', this.score);
    }
  };
  _.extend(ScoreKeeper.prototype, Eventable.prototype);

  var BasicMap = function() {
    Eventable.call(this);
    this.planet = null;
    this.scene = null;
  };

  BasicMap.prototype = {
    loadInto: function(scene) {
      this.scene = scene;
      // Create the planet we're protecting
      this.planet = new Planet('centre', 'assets/basicplanet.png', 0, 0, 128);
      scene.add(this.planet);

      this.planet.on('Destroyed', this.onPlanetDestroyed, this);

      // Start off above the polar north of the planet
      scene.camera.moveTo(0, -100);
      scene.camera.zoomTo(100);
      scene.add(new EnemyFactory());
      
      var controller = new CameraController(2000); 
      scene.add(controller);
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
    onScoreChanged: function(score, sender) {
      this.score.text(score);
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
    this.scorekeeper = new ScoreKeeper();
  };

  Game.prototype = {
    start: function() {
      var self = this;
      GlobalResources.load('assets.json', function() {
        self.loadMap(new BasicMap())
        self.scene.add(self.missiles);
        self.scene.add(self.collision);
        self.scene.add(self.scorekeeper);
        self.createPlayer();
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