var request = require('request')

module.exports = getGitHead

function getGitHead(modulename, tag, cb) {
  if(typeof tag === 'function') {
    cb = tag
    tag = 'latest'
  }
  request('https://registry.npmjs.org/' + modulename + '/' + tag, {json: true}, 
  function (err, res, info) {
    if(err) return cb(err)
    if(!('gitHead' in info)) return cb(new Error('No gitHead information available.'))
    cb(null, info.gitHead)
  })
}

