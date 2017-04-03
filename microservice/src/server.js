'use strict'
let restify = require('restify')
let fs = require('fs')
let redis = require('redis')
let Promise = require('promise')
let HttpsProxyAgent = require('https-proxy-agent')
require('isomorphic-fetch')

const LOG_TYPE_TRACE = 'trace'
const LOG_TYPE_DEBUG = 'debug'
const LOG_TYPE_INFO = 'info'
const LOG_TYPE_WARN = 'warn'
const LOG_TYPE_ERROR = 'error'
const LOG_TYPE_FATAL = 'fatal'

const REDIS_NAMESPACE_USERS = 'users'
const REDIS_NAMESPACE_TRACKS = 'tracks'
const REDIS_NAMESPACE_VISITS = 'visits'

const ACTION_VISITED = 'objectVisited'

class Server {
  start() {
    let server = restify.createServer(this.serverConfig)
    server.use(restify.CORS({
      origins: this.config.origins
    }))
    server.use(restify.queryParser())
    server.use(restify.bodyParser())
    server.get('/healthcheck', (this.handleHealthCheck).bind(this))
    server.get('/healthcheck/redis', (this.handleRedisServerInfo).bind(this))
    server.get('/users/:uid/visited', (this.returnUserVisitedObjects).bind(this))
    server.get('/users/:uid', (this.returnUserProfileData).bind(this))
    server.post('/tracks', (this.track).bind(this))

    server.listen(this.config.server.port, (() => {
      return this.log('Listening on port ' + server.address().port, LOG_TYPE_INFO)
    }).bind(this))

    server.on('request', (req) => {
      this.log(this.getUserIpFromRequest(req)
        + ' "' + (req.method + ' ' + req.url + '"')
        + (req.headers['user-agent'] ? ' "' + req.headers['user-agent'] + '"' : '"-"')
        + (req.headers['referer'] ? ' "' + req.headers['referer'] + '"' : '"-"'), LOG_TYPE_INFO)
    })
    server.on('after', (req, res) => {
      this.log(this.getUserIpFromRequest(req) + ' response ' + res.statusCode, LOG_TYPE_INFO)
    })
  }

  returnUserVisitedObjects(req, res, next) {
    const userIp = this.getUserIpFromRequest(req)
    this.validateUserRequest(req).then(() => {
      return this.loadDataFromRedis(REDIS_NAMESPACE_VISITS + '_' + req.params.uid)
    }).then((visits)=> {
      this.log(userIp + ' ' + req.params.uid + ' visits are ' + visits, LOG_TYPE_INFO)
      res.send(200, visits ? visits : [])
    }).catch((e) => {
      this.log(userIp + ' ' + e, LOG_TYPE_ERROR)
      res.send(400, e)
    }).finally(() => {
      next()
    })
  }

  returnUserProfileData(req, res, next) {
    const userIp = this.getUserIpFromRequest(req)
    this.validateUserRequest(req).then(() => {
      return this.loadDataFromRedis(REDIS_NAMESPACE_USERS + '_' + req.params.uid)
    }).then((userProfile)=> {
      this.log(userIp + ' ' + req.params.uid + ' profile is ' + userProfile, LOG_TYPE_INFO)
      res.send(200, userProfile ? userProfile : [])
    }).catch((e) => {
      this.log(userIp + ' ' + e, LOG_TYPE_ERROR)
      res.send(400, e)
    }).finally(() => {
      next()
    })
  }

  track(req, res, next) {
    const userIp = this.getUserIpFromRequest(req)
    this.validateRequest(req).then(() => {
      let track = this.getTrackFromRequest(req)
      return Promise.all(this.getPromisesByTrack(track)).then(()=> {
        this.log(userIp + ' data stored', LOG_TYPE_INFO)
        res.send(201, 'Track stored')
      })
    }).catch((e) => {
      this.log(userIp + ' ' + e, LOG_TYPE_ERROR)
      res.send(400, e)
    }).finally(() => {
      next()
    })
  }

  getPromisesByTrack(track) {
    let promises = [
      this.saveDataToRedis(REDIS_NAMESPACE_TRACKS, JSON.stringify(track)),
      this.saveDataToRedis(REDIS_NAMESPACE_USERS + '_' + track.uid, JSON.stringify(track), this.config.redis.ttl)
    ]
    let trackUrl = encodeURIComponent(track.url)
    switch (track.action) {
      case ACTION_VISITED:
        promises.push(this.saveDataToRedis(REDIS_NAMESPACE_VISITS + '_' + track.uid, track.itemId, this.config.redis.ttl))
        // promises.push(this.hitThirdPartyTrackPoint('***')
        // promises.push(this.hitThirdPartyTrackPoint('***')
        break
    }
    return promises
  }

  validateUserRequest(req) {
    return new Promise((resolve, reject) => {
      if (!req.params) {
        reject('Missing get params')
      }
      if (!req.params.uid || !req.params.uid.length > 1) {
        reject('Missing uid param ' + JSON.stringify(req.params))
      }
      resolve()
    })
  }

  validateRequest(req) {
    return new Promise((resolve, reject) => {
      if (!req.body) reject('Missing post data')
      const data = JSON.parse(req.body)
      if ((data.uid && 3 < data.uid.length && data.uid.length < 16 && data.uid.indexOf(':') === -1)
        && (data.action && !(/\W/).test(data.action) && 3 < data.action.length && data.action.length < 16)
        && (data.data && data.data.id)) {
        resolve()
      } else {
        reject('Invalid post data ' + JSON.stringify(data))
      }
    })
  }

  loadDataFromRedis(key) {
    return new Promise((resolve, reject) => {
      this.clientRedis.lrange(key, 0, -1, (err, reply) => {
        if (err) {
          this.log('Failed loading data from ' + key + ', ' + err, LOG_TYPE_ERROR)
          reject(err)
        } else {
          this.log('Data loaded from ' + key + ', reply ' + reply, LOG_TYPE_DEBUG)
          resolve(reply)
        }
      })
    })
  }

  saveDataToRedis(key, data, ttl) {
    return new Promise((resolve, reject) => {
      this.clientRedis.lpush(key, data, (err, reply) => {
        if (err) {
          this.log('Failed saving ' + data + ' to ' + key + ', ' + err, LOG_TYPE_ERROR)
          reject(err)
        } else {
          this.log('Data ' + data + ' saved to ' + key + ', reply ' + reply, LOG_TYPE_DEBUG)
          if (ttl) {
            this.clientRedis.expire(key, ttl, (err, reply) => {
              if (err) {
                this.log('Failed setting expire ' + ttl + ' to ' + key + ', ' + err, LOG_TYPE_ERROR)
                reject(err)
              } else {
                this.log('Key ' + key + ' expire in ' + ttl + ', reply ' + reply, LOG_TYPE_DEBUG)
                resolve(reply)
              }
            })
          } else {
            resolve(reply)
          }
        }
      })
    })
  }

  hitThirdPartyTrackPoint(url) {
    return new Promise((resolve, reject) => {
      fetch(url, this.getFetchOptions()).then((response) => {
        if (response.status === 200 || response.status === 201 || response.status === 204) {
          this.log('Successfully hit 3rd party endpoint url: ' + url + ' status: ' + response.status, LOG_TYPE_INFO)
          resolve(response)
        } else {
          throw new Error('Incorrect response code ' + response.status)
        }
      }).catch((error) => {
        this.log('Failed to hit 3rd party endpoint ' + error + ' url: ' + url, LOG_TYPE_ERROR)
        reject('Fetch failed ' + url + ' ' + error)
      })
    })
  }

  getFetchOptions() {
    let fetchOptions = this.config.fetch.options
    if (this.config.proxy && this.config.proxy.enabled === true) {
      let proxyOptions = Object.assign({}, fetchOptions, this.config.proxy)
      fetchOptions['agent'] = new HttpsProxyAgent(proxyOptions)
    }
    return fetchOptions
  }

  handleHealthCheck(req, res, next) {
    this.log('HealthCheck handled', LOG_TYPE_DEBUG)
    res.send(200)
    return next()
  }

  handleRedisServerInfo(req, res, next) {
    let clientRedisTemporary = redis.createClient(this.config.redis.port, this.config.redis.host)
    clientRedisTemporary.on('error', (err)=> {
      let currentErrorStrigyfied = JSON.stringify(err)
      this.log(currentErrorStrigyfied, LOG_TYPE_ERROR)
      res.send(400, 'Redis connection failure - ' + currentErrorStrigyfied)
      return next()
    })
    clientRedisTemporary.on('ready', ()=> {
      let redisServerInfo = JSON.stringify(clientRedisTemporary.server_info)
      this.log('Redis info served: ' + redisServerInfo, LOG_TYPE_INFO)
      res.send(200, 'Redis server info: ' + redisServerInfo)
      clientRedisTemporary.quit()
      return next()
    })
  }

  getReferrerFromRequest(req) {
    let referrer = null
    if (req.headers) {
      referrer = (req.headers['referrer'] ? req.headers['referrer'] : (req.headers['referer'] ? req.headers['referer'] : null))
    }
    return referrer
  }

  getTrackFromRequest(req) {
    const data = JSON.parse(req.body)
    return {
      'uid': data.uid,
      'itemId': data.data.id,
      'timestamp': new Date().toISOString(),
      'action': data.action,
      'site': data.site ? data.site : null,
      'url': data.url ? decodeURI(data.url) : null,
      'referrer': data.referrer ? data.referrer : this.getReferrerFromRequest(req),
      'customData': data.data ? data.data : {},
    }
  }

  getUserIpFromRequest(req) {
    let ip = 'unknown'
    if (req.headers && req.headers['x-forwarded-for']) {
      ip = req.headers['x-forwarded-for']
    } else if (req.connection && req.connection.remoteAddress) {
      ip = req.connection.remoteAddress
    }
    ip = ip.replace('::ffff:', '')
    return ip
  }

  get config() {
    if (!this._config) throw new Error('Config is not set')
    return this._config
  }

  set config(config) {
    this._config = config
  }

  get clientRedis() {
    if (!this._clientRedis) throw new Error('Redis is not connected')
    return this._clientRedis
  }

  set clientRedis(clientRedis) {
    this._clientRedis = clientRedis
  }

  log(message, type) {
    if (this.logger === undefined && this.config.log.enabled) {
      console.log(message)
    } else if (this.config.log.enabled) {
      switch (type) {
        case LOG_TYPE_TRACE :
          this.logger.trace(message)
          break
        case LOG_TYPE_DEBUG :
          this.logger.debug(message)
          break
        case LOG_TYPE_INFO :
          this.logger.info(message)
          break
        case LOG_TYPE_WARN :
          this.logger.warn(message)
          break
        case LOG_TYPE_ERROR :
          this.logger.error(message)
          break
        case LOG_TYPE_FATAL :
          this.logger.fatal(message)
          break
        default:
          this.logger.info(message)
      }
    }
  }

  get logger() {
    return this._logger
  }

  set logger(logger) {
    this._logger = logger
  }

  get serverConfig() {
    if (!this._serverConfig) {
      this._serverConfig = {
        name: this.config.server.name
      }
      if (this.config.server.certificate && this.config.server.key) {
        this._serverConfig['certificate'] = fs.readFileSync(this.config.server.certificate),
          this._serverConfig['key'] = fs.readFileSync(this.config.server.key)
      }
    }
    return this._serverConfig
  }
}

module.exports = Server
