'use strict'

let lint = require('mocha-eslint')
var paths = [
  'lib',
  'server.js',
  'test'
]
var options = {
  alwaysWarn: false,
  slow: 1000
}
lint(paths, options)

let Server = require('../src/server.js')
let RedisRetryStrategy = require('../src/redis-retry-strategy')
let http = require('http')
let chai = require('chai')
let chaiAsPromised = require('chai-as-promised')
let chaiDateString = require('chai-date-string')
let Promise = require('promise')

chai.use(chaiAsPromised)
chai.use(chaiDateString)
chai.config.truncateThreshold = 0
let expect = chai.expect

const ACTION_VISITED = 'objectVisited'

const next = () => {
}
const config = {
  'log': {
    'level': 'ERROR',
    'enabled': false
  },
  'redis': {
    'host': 'localhost',
    'port': 6379,
    'ttl': 1209600,
    'connectionTimeout': 1000,
    'connectionMaximumAttempts': 10,
    'connectionAttemptsInterval': 400,
    'retryConnectionInterval': 5000
  },
  'proxy': {
    'enabled': false
  },
  'fetch' : {
    'options':{
      'timeout': 1000
    }
  }
}

let fakeRedis = require('fakeredis').createClient(config.redis.port, config.redis.host)
let mockRedis = require('redis-mock').createClient()

let retryStrategy = new RedisRetryStrategy(config.redis)

const response = {
  send: function (status, body) {
    this.statusCode = status
    this.statusMessage = body
  }
}

let server

describe('Redis retry strategy test', function () {
  it('should return \'Connection refused error\' when options.error.code is set to ECONNREFUSED', function () {
    let options = {
      'error': {
        'code': 'ECONNREFUSED'
      }
    }
    expect(retryStrategy.reconnect(options)).to.be.an('error') //'The server refused the connection'
  })
  it('should return \'Retry time reached.\' when options.retry_time is higher than configured', function () {
    let options = {
      'error': {
        'code': 'DUMMY_CODE'
      },
      'total_retry_time': config.redis.connectionTimeout + 1
    }
    expect(retryStrategy.reconnect(options)).to.be.an('error') //'Retry time ' + config.redis.connectionTimeout + 'ms reached. Aborting.'
  })
  it('should return undefined when options.attempt is more than configured', function () {
    let options = {
      'attempt': config.redis.connectionMaximumAttempts + 1,
      'error': {
        'code': 'DUMMY_CODE'
      },
      'total_retry_time': config.redis.connectionTimeout - 1,
      'times_connected': config.redis.connectionMaximumAttempts + 1
    }
    expect(retryStrategy.reconnect(options)).to.be.undefined //'undefined'
  })
  it('should return configured \'connectionAttemptsInterval\' when options.error.code is set to ECONNREFUSED and options.retry_time is higher than configured and options.attepmt is more than configured', function () {
    let options = {
      'attempt': config.redis.connectionMaximumAttempts - 1,
      'error': {
        'code': 'DUMMY_CODE'
      },
      'total_retry_time': config.redis.connectionTimeout - 1,
      'times_connected': config.redis.connectionMaximumAttempts - 1
    }
    expect(retryStrategy.reconnect(options)).to.equals(config.redis.connectionAttemptsInterval)
  })
})

describe('Server test', function () {

  beforeEach(function () {
    server = new Server()
    server.config = config
  })

  it('should fail when starting server without config', function () {
    let testServer = new Server()
    expect(testServer.start).to.throw(Error)
  })

  describe('Request validators', function () {

    describe('validateUserRequest', function () {
      it('should be rejected when GET request has no params', function () {
        let request = new http.request
        let expectedResult = 'Missing get params'
        return expect(server.validateUserRequest(request)).to.be.rejectedWith(expectedResult)
      })
      it('should be rejected when GET request doesn\'t contain uid param', function () {
        let request = http.ClientRequest
        request.params = {'fake': 'param'}
        let expectedResult = 'Missing uid param ' + JSON.stringify(request.params)
        return expect(server.validateUserRequest(request)).to.be.rejectedWith(expectedResult)
      })
      it('should be fulfilled when GET request uid param is set', function () {
        let request = http.ClientRequest
        request.params = {'uid': '1234'}
        return expect(server.validateUserRequest(request)).to.be.fulfilled
      })
    })

    describe('validateRequest', function () {

      it('should be rejected when POST request has no params', function () {
        let request = http.ClientRequest
        let expectedResult = 'Missing post data'
        return expect(server.validateRequest(request)).to.be.rejectedWith(expectedResult)
      })

      let dataProvideContent = [
        {
          'label': 'should be rejected when POST request doesn\'t contain uid param',
          'fakeInput': {
            'action': 'fakeAction',
            'data': {'id': 'fakeItemId'}
          }
        },
        {
          'label': 'should be rejected when POST request uid param is shorter than 4 chars',
          'fakeInput': {
            'uid': '123',
            'action': 'fakeAction',
            'data': {'id': 'fakeItemId'}
          }
        },
        {
          'label': 'should be rejected when POST request uid param is longer than 16 chars',
          'fakeInput': {
            'uid': '0123456789ABCDEFG',
            'action': 'fakeAction',
            'data': {'id': 'fakeItemId'}
          }
        },
        {
          'label': 'should be rejected when POST request doesn\'t contain action param',
          'fakeInput': {
            'uid': '12345',
            'data': {'id': 'fakeItemId'}
          }
        },
        {
          'label': 'should be rejected when POST request action param is not alphanumeric',
          'fakeInput': {
            'uid': '12345',
            'action': 'fake Action',
            'data': {'id': 'fakeItemId'}
          }
        },
        {
          'label': 'should be rejected when POST request action param is shorter than 4 chars',
          'fakeInput': {
            'uid': '12345',
            'action': 'fct',
            'data': {'id': 'fakeItemId'}
          }
        },
        {
          'label': 'should be rejected when POST request action param is longer than 16 chars',
          'fakeInput': {
            'uid': '12345',
            'action': 'fakeActionfakeAction',
            'data': {'id': 'fakeItemId'}
          }
        },
        {
          'label': 'should be rejected when POST request doesn\'t contain data param',
          'fakeInput': {
            'uid': '12345',
            'action': 'fakeActionfakeAction'
          }
        },
        {
          'label': 'should be rejected when POST request doesn\'t contain data.id param',
          'fakeInput': {
            'uid': '12345',
            'action': 'fakeActionfakeAction',
            'data': {'fake': 'Data'}
          }
        }
      ]

      dataProvideContent.forEach(function (testCase) {
        it(testCase.label, function () {
          let request = http.ClientRequest
          let fakeInput = testCase.fakeInput
          request.body = JSON.stringify(fakeInput)
          let expectedResult = 'Invalid post data ' + request.body
          return expect(server.validateRequest(request)).to.be.rejectedWith(expectedResult)
        })
      })

      it('should be fulfilled when POST request body is valid', function () {
        let request = http.ClientRequest
        let fakeInput = {
          'uid': '12345',
          'action': 'fakeAction',
          'data': {'id': 'fakeItemId'}
        }
        request.body = JSON.stringify(fakeInput)
        return expect(server.validateRequest(request)).to.be.fulfilled
      })

    })

  })

  describe('Request getters', function () {

    describe('getUserIpAddress', function () {

      it('should return \'unknown\' when request doesn\'t contain headers', function () {
        let request = http.ClientRequest
        expect(server.getUserIpFromRequest(request)).to.equal('unknown')
      })

      it('should return \'unknown\' when request headers doesn\'t contain x-forwarded-for', function () {
        let request = http.ClientRequest
        request.headers = {'fake': 'header'}
        expect(server.getUserIpFromRequest(request)).to.equal('unknown')
      })

      it('should return ip when request headers x-forwarded-for is set', function () {
        let expectedResult = '0.0.0.0'
        let request = http.ClientRequest
        request.headers = {'x-forwarded-for': expectedResult}
        expect(server.getUserIpFromRequest(request)).to.equal(expectedResult)
      })

      it('should return ip when request connection is set', function () {
        let expectedResult = '0.0.0.0'
        let request = http.ClientRequest
        request.connection = {'remoteAddress': expectedResult}
        expect(server.getUserIpFromRequest(request)).to.equal(expectedResult)
      })

      it('should replace \'::ffff:\' when ip is set in IPv6', function () {
        let fakeIp = '0:0:0:0:0::ffff:'
        let expectedResult = '0.0.0.0'
        let request = http.ClientRequest
        request.connection = {'remoteAddress': fakeIp}
        expect(server.getUserIpFromRequest(request)).to.equal(expectedResult)
      })

    })

    describe('getReferrerFromRequest', function () {

      it('should return null when request doesn\'t contain headers', function () {
        let request = http.ClientRequest
        expect(server.getReferrerFromRequest(request)).to.be.null
      })

      it('should return null when request headers doesn\'t contain referrer', function () {
        let request = http.ClientRequest
        request.headers = {'fake': 'header'}
        expect(server.getReferrerFromRequest(request)).to.be.null
      })

      it('should return referrer when request headers referrer is set', function () {
        let expectedResult = 'http://example.com'
        let request
        request = http.ClientRequest
        request.headers = {'referrer': expectedResult}
        expect(server.getReferrerFromRequest(request)).to.equal(expectedResult)
        request = http.ClientRequest
        request.headers = {'referer': expectedResult}
        expect(server.getReferrerFromRequest(request)).to.equal(expectedResult)
      })

    })

    describe('getTrackFromRequest', function () {

      it('should return ISO DateString as timestamp', function () {
        let request = http.ClientRequest
        request.headers = {'': 'http://fakereferrer.com'}
        let fakeInput = {
          'uid': 'fakeUid',
          'action': 'fakeAction',
          'data': {
            'id': 'fakeGuid'
          },

        }
        request.body = JSON.stringify(fakeInput)
        let result = server.getTrackFromRequest(request)
        expect(result.timestamp).to.be.a.dateString()
      })

      let dataProvideContent = [
        {
          'label': 'should return track when whole track info is provided',
          'headers': {},
          'fakeInput': {
            'uid': 'fakeUid',
            'action': 'fakeAction',
            'site': 'fake.com',
            'url': 'http://fake.com',
            'referrer': 'http://fakereferrer.com',
            'data': {
              'id': 'fakeGuid'
            },
          },
          'expectedResult': {
            'uid': 'fakeUid',
            'itemId': 'fakeGuid',
            'action': 'fakeAction',
            'site': 'fake.com',
            'url': 'http://fake.com',
            'referrer': 'http://fakereferrer.com',
            'customData': {
              'id': 'fakeGuid'
            },
          }
        },
        {
          'label': 'should return reduced track when track info is provided without site',
          'headers': {},
          'fakeInput': {
            'uid': 'fakeUid',
            'action': 'fakeAction',
            'url': 'http://fake.com',
            'referrer': 'http://fakereferrer.com',
            'data': {
              'id': 'fakeGuid'
            },
          },
          'expectedResult': {
            'uid': 'fakeUid',
            'itemId': 'fakeGuid',
            'action': 'fakeAction',
            'site': null,
            'url': 'http://fake.com',
            'referrer': 'http://fakereferrer.com',
            'customData': {
              'id': 'fakeGuid'
            },
          }
        },
        {
          'label': 'should return reduced track when track info is provided without url',
          'headers': {},
          'fakeInput': {
            'uid': 'fakeUid',
            'action': 'fakeAction',
            'site': 'fake.com',
            'referrer': 'http://fakereferrer.com',
            'data': {
              'id': 'fakeGuid'
            },
          },
          'expectedResult': {
            'uid': 'fakeUid',
            'itemId': 'fakeGuid',
            'action': 'fakeAction',
            'site': 'fake.com',
            'url': null,
            'referrer': 'http://fakereferrer.com',
            'customData': {
              'id': 'fakeGuid'
            },
          }
        },
        {
          'label': 'should decode url when it is encoded',
          'headers': {},
          'fakeInput': {
            'uid': 'fakeUid',
            'action': 'fakeAction',
            'site': 'fake.com',
            'url': 'http://fake.com/finance/cesko-je-danovy-raj/r%7E2b32a98267d611e6a4100025900fea04/?param=bla%2F',
            'referrer': 'http://fakereferrer.com',
            'data': {
              'id': 'fakeGuid'
            },
          },
          'expectedResult': {
            'uid': 'fakeUid',
            'itemId': 'fakeGuid',
            'action': 'fakeAction',
            'site': 'fake.com',
            'url': 'http://fake.com/finance/cesko-je-danovy-raj/r~2b32a98267d611e6a4100025900fea04/?param=bla%2F',
            'referrer': 'http://fakereferrer.com',
            'customData': {
              'id': 'fakeGuid'
            },
          }
        },
        {
          'label': 'should return track with referrer from request headers when track info is provided without referrer',
          'headers': {'referrer': 'http://fakereferrer.com'},
          'fakeInput': {
            'uid': 'fakeUid',
            'action': 'fakeAction',
            'site': 'fake.com',
            'url': 'http://fake.com',
            'data': {
              'id': 'fakeGuid'
            },
          },
          'expectedResult': {
            'uid': 'fakeUid',
            'itemId': 'fakeGuid',
            'action': 'fakeAction',
            'site': 'fake.com',
            'url': 'http://fake.com',
            'referrer': 'http://fakereferrer.com',
            'customData': {
              'id': 'fakeGuid'
            },
          }
        },
        {
          'label': 'should return reduced track when track info is provided without referrer',
          'fakeInput': {
            'uid': 'fakeUid',
            'action': 'fakeAction',
            'site': 'fake.com',
            'url': 'http://fake.com',
            'data': {
              'id': 'fakeGuid'
            },
          },
          'expectedResult': {
            'uid': 'fakeUid',
            'itemId': 'fakeGuid',
            'action': 'fakeAction',
            'site': 'fake.com',
            'url': 'http://fake.com',
            'referrer': null,
            'customData': {
              'id': 'fakeGuid'
            },
          }
        },
      ]
      dataProvideContent.forEach(function (testCase) {
        it(testCase.label, function () {
          let request = http.ClientRequest
          request.headers = testCase.headers
          request.body = JSON.stringify(testCase.fakeInput)
          let result = server.getTrackFromRequest(request)
          delete (result.timestamp)
          expect(result).to.deep.equal(testCase.expectedResult)
        })

      })

    })

  })

  describe('Redis handlers', function () {


    beforeEach(function () {
      server.clientRedis = fakeRedis
    })

    describe('saveDataToRedis', function () {

      it('should be rejected when params aren\'t Redis ready', function () {
        let fakeKey = ''
        let fakeData = {'fake': 'data'}
        let fakeTtl = 'wrongTtl'
        return expect(server.saveDataToRedis(fakeKey, fakeData, fakeTtl)).to.be.rejected
      })

      it('should be fulfilled when params are compact', function () {
        let fakeKey = 'fakeKey'
        let fakeDataRaw = {'fake': 'data'}
        let fakeData = JSON.stringify(fakeDataRaw)
        let fakeTtl = 1000000
        return expect(server.saveDataToRedis(fakeKey, fakeData, fakeTtl)).to.be.fulfilled
      })
    })

    describe('loadDataFromRedis', function () {

      it('should be rejected when params aren\'t Redis ready', function () {
        let fakeKey = null
        return expect(server.loadDataFromRedis(fakeKey)).to.be.rejected
      })

      it('should be fulfilled when params are compact', function () {
        let fakeKey = 'fakeKey'
        return expect(server.loadDataFromRedis(fakeKey)).to.be.fulfilled
      })

    })
  })

  describe('Route handlers', function () {

    let request, expectedResponse, newResponse

    beforeEach(function () {
      request = new http.ClientRequest
      expectedResponse = Object.assign({}, response, {})
      newResponse = Object.assign({}, response, {})
    })

    describe('handleHealthCheck', function () {

      it('should return 200', function () {
        expectedResponse.send(200)
        server.handleHealthCheck(request, newResponse, next)
        expect(newResponse).deep.equals(expectedResponse)
      })

    })

    describe('track', function () {

      it('should return 400 and \'Missing post params\' warning when request is not valid', function (done) {
        server.clientRedis = fakeRedis
        expectedResponse.send(400, 'Missing post data')
        server.track(request, newResponse, () => {
          try {
            expect(newResponse).to.deep.equal(expectedResponse)
            done()
          } catch (e) {
            done(e)
          }
        })
      })

      it('should return 400 and Redis error when redis is not connected', function (done) {
        server.clientRedis = null
        request.body = JSON.stringify({
          'uid': '12345',
          'action': 'fakeAction',
          'data': {'id': 'fakeItemId'}
        })
        server.track(request, newResponse, () => {
          try {
            expect(newResponse.statusCode).to.equal(400)
            expect(newResponse.statusMessage).to.be.an('Error')
            done()
          } catch (e) {
            done(e)
          }
        })
      })

      it('should return 201 and \'Track stored\' message for valid request', function (done) {
        expectedResponse.send(201, 'Track stored')
        server.clientRedis = mockRedis
        request.body = JSON.stringify({
          'uid': '12345',
          'action': 'fakeAction',
          'data': {'id': 'fakeItemId'}
        })
        server.track(request, newResponse, () => {
          try {
            expect(newResponse).to.deep.equals(expectedResponse)
            done()
          } catch (e) {
            done(e)
          }
        })
      })

    })

    describe('returnUserVisitedObjects', function () {

      it('should return 200 and visits for valid request', function (done) {
        server.clientRedis = mockRedis
        request.params = {'uid': 'fakeUid'}
        server.returnUserVisitedObjects(request, newResponse, () => {
          try {
            expect(newResponse.statusCode).to.equal(200)
            expect(newResponse.statusMessage).to.be.an('Array')
            done()
          } catch (e) {
            done(e)
          }
        })
      })

      it('should return 400 and \'Missing get params\' warning when request is not valid', function (done) {
        server.clientRedis = fakeRedis
        expectedResponse.send(400, 'Missing get params')
        server.returnUserVisitedObjects(request, newResponse, () => {
          try {
            expect(newResponse).to.deep.equal(expectedResponse)
            done()
          } catch (e) {
            done(e)
          }
        })
      })

      it('should return 400 and Redis error when redis is not connected', function (done) {
        server.clientRedis = null
        request.params = {'uid': '12345'}
        server.returnUserVisitedObjects(request, newResponse, () => {
          try {
            expect(newResponse.statusCode).equals(400)
            expect(newResponse.statusMessage).to.be.an('Error')
            done()
          } catch (e) {
            done(e)
          }
        })
      })

    })

    describe('returnUserProfileData', function () {

      it('should return 200 and user profile for valid request', function (done) {
        server.clientRedis = mockRedis
        request.params = {'uid': 'fakeUid'}
        server.returnUserProfileData(request, newResponse, () => {
          try {
            expect(newResponse.statusCode).to.equal(200)
            expect(newResponse.statusMessage).to.be.an('Array')
            done()
          } catch (e) {
            done(e)
          }
        })
      })

      it('should return 400 and \'Missing get params\' warning when request is not valid', function (done) {
        server.clientRedis = fakeRedis
        expectedResponse.send(400, 'Missing get params')
        server.returnUserProfileData(request, newResponse, () => {
          try {
            expect(newResponse).to.deep.equal(expectedResponse)
            done()
          } catch (e) {
            done(e)
          }
        })
      })

      it('should return 400 and Redis error when redis is not connected', function (done) {
        server.clientRedis = null
        request.params = {'uid': '12345'}

        server.returnUserProfileData(request, newResponse, () => {
          try {
            expect(newResponse.statusCode).equals(400)
            expect(newResponse.statusMessage).to.be.an('Error')
            done()
          } catch (e) {
            done(e)
          }
        })
      })

    })

    describe('getPromisesByTrack', function () {

      it('should return 2 promises when action IS NOT ' + ACTION_VISITED, function () {
        server.config = config
        let track = {
          'uid': 'fakeUid',
          'itemId': 'fakeGuid',
          'action': 'fakeAction',
          'site': 'fake.com',
          'url': 'http://fake.com',
          'referrer': 'http://fakereferrer.com',
          'customData': {
            'id': 'fakeGuid'
          },
        }
        let result = server.getPromisesByTrack(track)
        expect(result).to.be.an('Array')
        expect(result).to.have.length(2)
      })

      it('should return 5 promises when action IS ' + ACTION_VISITED, function () {
        server.config = config
        let track = {
          'uid': 'fakeUid',
          'itemId': 'fakeGuid',
          'action': ACTION_VISITED,
          'site': 'fake.com',
          'url': 'http://fake.com',
          'referrer': 'http://fakereferrer.com',
          'customData': {
            'id': 'fakeGuid'
          },
        }
        let result = server.getPromisesByTrack(track)
        expect(result).to.be.an('Array')
        expect(result).to.have.length(5)
      })

    })

  })

})

describe('hit 3rd party endpoint', () => {
  let nock

  beforeEach(() => {
    nock = require('nock')
    nock.disableNetConnect()
    server = new Server()
    server.config = config
    server.clientRedis = mockRedis
  })
  afterEach(() => {
    nock.cleanAll()
  })

  it('should return promise', (done) => {
    let host = 'http://example.com',
      path = '/point',
      hit

    nock(host).get(path).reply(404)
    hit = server.hitThirdPartyTrackPoint(host + path)
    expect(hit).to.be.an.instanceOf(Promise)

    nock(host).get(path).reply(200)
    hit = server.hitThirdPartyTrackPoint(host + path)
    expect(hit).to.be.an.instanceOf(Promise)

    done()
  })

  it('should reject when unaccepted http status code returns', (done) => {
    let host = 'http://example.com',
      path = '/point',
      statusCode = 404

    nock(host).get(path).reply(statusCode)
    server.hitThirdPartyTrackPoint(host + path).then(() => {
      done(new Error('Promise should not be resolved'))
    }, (reason) => {
      expect(reason).to.equal('Fetch failed ' + host + path + ' Error: Incorrect response code ' + statusCode)
      done()
    })
  })

  it('should log error', (done) => {
    let host = 'http://example.com',
      path = '/point',
      statusCode = 500

    nock(host).get(path).reply(statusCode)
    let calls = 0
    let logMessage = ''
    let logType = ''
    server.log = function (msg, type) {
      calls++
      logMessage = msg
      logType = type
    }
    server.hitThirdPartyTrackPoint(host + path).then(() => {
      throw new Error('Promise should not be resolved')
    }, () => {
      expect(calls).to.equal(1)
      expect(logMessage).to.equal('Failed to hit 3rd party endpoint Error: Incorrect response code ' + statusCode + ' url: ' + host + path)
      expect(logType).to.equal('error')
    }).then(() => {
      done()
    }).catch((error) => {
      done(error)
    })
  })

  it('should be able to fetch url', (done) => {
    let host = 'http://example.com',
      path = '/point'
    nock(host).get(path).reply(200)
    server.hitThirdPartyTrackPoint(host + path)
      .then((resolve) => {
        expect(resolve.body).to.be.an('object')
      }, null, null)
      .then(() => {
        done()
      })
      .catch((error) => {
        done(error)
      })
  })

  it('should not modify url', (done) => {
    let host = 'http://example.com',
      path = '/point?url=' + encodeURIComponent('http://subdomain.example.com/r~123456guid?subdomain=queryParam')
    nock(host).get(path).reply(200)
    server.hitThirdPartyTrackPoint(host + path)
      .then((resolve) => {
        expect(resolve.status).to.equal(200)
        expect(resolve.url).to.equal('http://example.com/point?url=http%3A%2F%2Fsubdomain.example.com%2Fr~123456guid%3Fsubdomain%3DqueryParam')
      })
      .then(() => {
        done()
      })
      .catch((error) => {
        done(error)
      })
  })
})
