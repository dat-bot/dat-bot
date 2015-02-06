var http = require('http')
var fs = require('fs')
var createHandler = require('github-webhook-handler')
var request = require('request')
var path = require('path')
var exec = require('child_process').exec
var concat = require('concat-stream')
var cats = require('cat-ascii-faces')
var waterfall = require('run-waterfall')
var readjson = require('readjson')
var gitHead = require('./githead.js')
var minimist = require('minimist')

var PORT = process.env['PORT'] || 8080
var SECRET = process.env['SECRET'] || 'default'
var ghtoken = process.env['GITHUB_TOKEN']
var ghname = 'dat-bot'

var ghheaders = {
  'user-agent': 'dat-bot',
  'authorization': 'token ' + ghtoken
}

var webhook = createHandler({ path: '/webhook', secret: SECRET})

http.createServer(function(req, res) {
  webhook(req, res, function (err) {
    res.statusCode = 404
    res.end('404')
  })
}).listen(PORT)

console.log('Listening on port ' + PORT)


webhook.on('issue_comment', function (data) {
  console.log('event: issue_comment')
  // console.log(data.payload)
  var comment = data.payload.comment.body
  var pos = comment.indexOf('@' + ghname)
  if(pos === -1) return // not for me
  comment = comment.slice(pos + ghname.length + 1)

  var match = comment.match(/publish (major|minor|patch)(.*)/)
  if(match) {
    var versionStep = match[1]
    var options = minimist((match[2] || '').split(/\s+/))
    return publishNewVersion(data, versionStep, postComment, options)
  }  
  if(comment.match(/cat/)) {
    return postComment(cats())
  } 
  
  function postComment(message) {
    // post comment
    request.post({
      url: data.payload.comment.issue_url + '/comments',
      json: {body: '@' + data.payload.comment.user.login + ' ' + message},
      headers: ghheaders
    }, 
    function (err, res, body) {
      if(err) console.error(err)
    })
  }
})

function mdcode(test) {
  return '\n```\n' + test + '\n```\n'
}

function publishNewVersion(data, versionStep, comment, opts) {
  var repo = data.payload.repository.full_name
  var repoDir = path.join(__dirname, 'repos', repo)

  waterfall([
    checkCollaborator,
    checkLocalRepo,
    checkClean,
    mergePR,
    runPublish
  ],
  function (err) {
    if(err) comment(err.message)
  })


  function checkCollaborator(cb) {
    var checkCollaboratorUrl = data.payload.repository.collaborators_url.replace('{/collaborator}', '/' + data.payload.comment.user.login)
    request({url: checkCollaboratorUrl, headers: ghheaders}, function (err, res) {
      if(err) return comment('Problem with GitHub: ' + err) 
      if(res.statusCode !== 204) return cb(new Error('Sorry, it seems like you are not a collaborator.'))
      cb()
    })
  }

  
  
  function checkLocalRepo(cb) {
    fs.exists(repoDir, function (exists) {
      if(exists) return cb()
      var cloneURL = data.payload.repository.clone_url
      
      exec(['git clone ', cloneURL, repoDir].join(' '), {cwd: __dirname}, function (err, stdout, stderr) {
        if(err) return cb(new Error('There has been a problem cloning the directory' + mdcode(stderr)))
        console.log(stdout)
        // checks for publishing rights and push rights?
        cb()
      })
      
    })
  }
  
  function checkClean(cb) {
    // Check if there are no new changes in between
    if(opts['force']) return cb()
    readjson(path.join(repoDir, 'package.json'), function (err, info) {
      if(err) return cb(err)
      var moduleName = info.name
      gitHead(info.name, function (err, commit) {
        if(err) return cb(err)
        var masterUrl = 'https://api.github.com/repos/' + repo + '/git/refs/heads/master'
        request({url: masterUrl, json: true, headers: ghheaders}, function (err, resp, body) {
          if(err) return cb(err)
          if(body.object && body.object.sha) {
            if(body.object.sha !== commit) {
              cb(new Error(
                'There are unpublished changes in the repo. Here is the complete diff: ' +
                'https://github.com/' + repo + '/compare/' + commit + '...master\n' +
                'If you are okay with it run command again with `--force`'
                )
              )
            } else {
              cb()
            }
          } else {
            cb(new Error('failed to fetch head'))
          }
        })
      })
    })
  }  
  
  function mergePR(cb) {
    var pr = data.payload.issue.pull_request
    if(pr) {
      var mergeUrl = pr.url + '/merge'
      console.log('Trying to merge ' + mergeUrl)
      request.put({url: mergeUrl, headers: ghheaders, json: {}}, function (err, res, body) {
        if(err) return cb(new Error('Oops there was a problem: ' + err))
        if(!body.merged) return cb(new Error('I could not merge this, because GitHub said: ' + body.message))
        cb()
      })
    } else {
      cb()
    }
  }
  
  
  function runPublish(cb) {
    var cmd = path.join(__dirname, 'publish.sh') + ' ' + versionStep
    exec(cmd, {cwd: repoDir}, function (err, stdout, stderr) {
        if(err) return cb(new Error('There has been a problem: ' + mdcode(stderr)))
        console.log(stdout)
        comment('Published version ' + (stdout.match(/v\d+\.\d+\.\d+/) || ['error!'])[0])
        cb()
    })
  }
  
}