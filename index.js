var http = require('http')
var fs = require('fs')
var createHandler = require('github-webhook-handler')
var request = require('request')
var path = require('path')
var exec = require('child_process').exec
var concat = require('concat-stream')
var cats = require('cat-ascii-faces')

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


webhook.on('issue_comment', function (data) {
  console.log('event: issue_comment')
  // console.log(data.payload)
  var comment = data.payload.comment.body
  var pos = comment.indexOf('@' + ghname)
  if(pos === -1) return // not for me
  comment = comment.slice(pos + ghname.length + 1)
  var issueUrl = data.payload.comment.issue_url
  var user = data.payload.comment.user
  var username = user.login

  var match = comment.match(/publish (major|minor|patch)/)
  if(match) {
    var versionStep = match[1]
    return publishNewVersion(data, versionStep, postComment)
  }  
  if(comment.match(/cat/)) {
    return postComment(cats())
  } 
  
  function postComment(message) {
    // post comment
    request.post({
      url: issueUrl + '/comments',
      json: {body: '@' + username + ' ' + message},
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

function publishNewVersion(data, versionStep, comment) {
  var repo = data.payload.repository.full_name
  var repoDir = path.join(__dirname, 'repos', repo)
  fs.exists(repoDir, function (exists) {
    if(exists) return checkPR()
    var cloneURL = data.payload.repository.clone_url
    
    exec(['git clone ', cloneURL, repoDir].join(' '), {cwd: __dirname}, function (err, stdout, stderr) {
      if(err) return comment('There has been a problem cloning the directory' + mdcode(stderr))
      console.log(stdout)
      // checks for publishing rights and push rights?
      checkPR()
    })
    
  })
  
  function checkPR() {
    var pr = data.payload.issue.pull_request
    if(pr) {
      var mergeUrl = pr.url + '/merge'
      console.log('Trying to merge ' + mergeUrl)
      request.put({url: mergeUrl, headers: ghheaders, json: {}}, function (err, res, body) {
        if(err) return comment('Oops there was a problem: ' + err)
        if(!body.merged) return comment('I could not merge this, because GitHub said: ' + body.message)
        runPublish()
      })
    } else {
      runPublish()
    }
  }
  
  function runPublish() {
    var cmd = path.join(__dirname, 'publish.sh') + ' ' + versionStep
    exec(cmd, {cwd: repoDir}, donePublish)
  }
  
  
  function donePublish(err, stdout, stderr) {
    console.log(stdout)
    if(err) {
      var message
      message = 'Sorry, it seems like there was a problem.\n'
      message += 'Here is the stderr output:\n```\n' + stderr + '\n```\n'
      comment(message)
    } else {
      comment('Published version ' + (stdout.match(/v\d+\.\d+\.\d+/) || ['error!'])[0])
    }
  }
  
}