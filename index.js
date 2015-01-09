var http = require('http')
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

var repo = 'test'

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
  var comment = data.payload.comment.body
  var pos = comment.indexOf('@' + ghname)
  if(pos === -1) return // not for me
  comment = comment.slice(pos + ghname.length + 1)
  var issueUrl = data.payload.comment.issue_url
  var username = data.payload.comment.user.login

  var match = comment.match(/publish (major|minor|patch)/)
  if(match) {
    var versionStep = match[1]
    publishNewVersion(versionStep, postComment)
  } else if(comment.match(/cat/)) {
    postComment(cats())
  } else {  
    postComment('Hello, my friend!')
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

function publishNewVersion(versionStep, comment) {
  var cwd = path.join(__dirname, repo)
  var cmd = path.join(__dirname, 'publish.sh') + ' ' + versionStep
  exec(cmd, {cwd: cwd}, donePublish)
  var message
  function donePublish(err, stdout, stderr) {
  console.log(stdout)
    if(err) {
      message = 'Sorry, it seemed like there was a problem.\n'
      message += 'Here is the stderr output:\n```\n' + stderr + '\n```\n'
      comment(message)
    } else {
      comment('Published version ' + (stdout.match(/v\d+\.\d+\.\d+/) || ['error!'])[0])
    }
  }
  
}